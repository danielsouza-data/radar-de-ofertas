const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeliveryService, isRecoverableSendError } = require('./delivery-service');

test('isRecoverableSendError reconhece erros recuperaveis conhecidos', () => {
  assert.equal(isRecoverableSendError(new Error('Execution context was destroyed')), true);
  assert.equal(isRecoverableSendError(new Error('Detached frame found')), true);
  assert.equal(isRecoverableSendError(new Error('outro erro qualquer')), false);
});

test('loadMedia retorna null quando MessageMedia.fromUrl falha', async () => {
  const client = {};
  const MessageMedia = {
    fromUrl: async () => {
      throw new Error('media indisponivel');
    }
  };

  const svc = createDeliveryService({ client, MessageMedia, logger: { warn: () => {} } });
  const media = await svc.loadMedia('https://example.com/img.png');
  assert.equal(media, null);
});

test('sendWithRecovery faz retry e confirma ack', async () => {
  let sendCalls = 0;
  let reloadCalls = 0;

  const client = {
    pupPage: {
      isClosed: () => false,
      reload: async () => {
        reloadCalls += 1;
      }
    },
    sendMessage: async () => {
      sendCalls += 1;
      if (sendCalls === 1) {
        throw new Error('Execution context was destroyed');
      }
      return { id: { _serialized: 'msg-123' } };
    },
    getMessageById: async () => ({ ack: 1 })
  };

  const MessageMedia = { fromUrl: async () => ({}) };
  const svc = createDeliveryService({
    client,
    MessageMedia,
    ackTimeoutMs: 50,
    pollIntervalMs: 1,
    recoveryBackoffBaseMs: 1,
    logger: { warn: () => {} }
  });

  const result = await svc.sendWithRecovery('chat', 'mensagem');

  assert.equal(sendCalls, 2);
  assert.equal(reloadCalls, 1);
  assert.equal(result.ackFinal, 1);
  assert.equal(result.tentativas, 2);
  assert.equal(result.houveRecuperacao, true);
});
