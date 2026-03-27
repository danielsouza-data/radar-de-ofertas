function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecoverableSendError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('detached frame') ||
    msg.includes('execution context was destroyed') ||
    msg.includes('cannot find context')
  );
}

function createDeliveryService({
  client,
  MessageMedia,
  ackTimeoutMs = 45000,
  pollIntervalMs = 2000,
  maxAttempts = 3,
  recoveryBackoffBaseMs = 5000,
  logger = console
} = {}) {
  if (!client) {
    throw new Error('createDeliveryService: client e obrigatorio');
  }

  if (!MessageMedia || typeof MessageMedia.fromUrl !== 'function') {
    throw new Error('createDeliveryService: MessageMedia.fromUrl e obrigatorio');
  }

  async function loadMedia(imageUrl) {
    try {
      return await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
    } catch (err) {
      logger.warn(`[MEDIA_LOAD_ERR] Nao foi possivel carregar imagem: ${err.message}`);
      return null;
    }
  }

  async function waitForMessageAck(messageId, timeoutMs = ackTimeoutMs) {
    if (!messageId) return 0;

    const inicio = Date.now();
    let ultimoAck = 0;
    let lastPollError = null;

    while (Date.now() - inicio < timeoutMs) {
      try {
        const msgObj = await client.getMessageById(messageId);
        const ack = Number(msgObj?.ack ?? 0);
        ultimoAck = ack;

        if (ack >= 1) return ack;
        if (ack === -1) return ack;
      } catch (err) {
        if (!lastPollError || lastPollError !== err.message) {
          logger.warn(`[ACK_POLL_WARN] Erro no poll de ACK: ${err.message}`);
          lastPollError = err.message;
        }
      }

      await sleep(pollIntervalMs);
    }

    return ultimoAck;
  }

  async function sendWithRecovery(chatId, msg, media = null) {
    let houveRecuperacao = false;
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= maxAttempts; tentativa++) {
      try {
        const sent = media
          ? await client.sendMessage(chatId, media, { caption: msg })
          : await client.sendMessage(chatId, msg);

        const ack = await waitForMessageAck(sent?.id?._serialized, ackTimeoutMs);
        if (ack < 1) {
          throw new Error(`ACK nao confirmado (ack=${ack})`);
        }

        return {
          tentativas: tentativa,
          houveRecuperacao,
          ultimoErro: ultimoErro ? String(ultimoErro.message || ultimoErro) : null,
          ackFinal: ack,
          messageId: sent?.id?._serialized || null
        };
      } catch (error) {
        ultimoErro = error;
        const recuperavel = isRecoverableSendError(error);
        const ultimaTentativa = tentativa === maxAttempts;

        if (!recuperavel || ultimaTentativa) {
          throw error;
        }

        logger.warn(`[RECOVERY] Erro recuperavel no envio (${error.message}). Tentando recuperar sessao...`);
        houveRecuperacao = true;

        try {
          if (client.pupPage && typeof client.pupPage.isClosed === 'function' && !client.pupPage.isClosed()) {
            await client.pupPage.reload({ waitUntil: 'networkidle0', timeout: 60000 });
          }
        } catch (reloadError) {
          logger.warn(`[RECOVERY] Falha ao recarregar pagina do WhatsApp: ${reloadError.message}`);
        }

        const backoffMs = tentativa * recoveryBackoffBaseMs;
        logger.warn(`[RECOVERY] Aguardando ${backoffMs / 1000}s antes da nova tentativa...`);
        await sleep(backoffMs);
      }
    }

    throw new Error('Falha inesperada no envio com recuperacao');
  }

  return {
    loadMedia,
    waitForMessageAck,
    sendWithRecovery
  };
}

module.exports = {
  createDeliveryService,
  isRecoverableSendError
};
