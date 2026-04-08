/**
 * LOG MASKING - Mascara valores sensiveis do .env nos outputs de console.
 *
 * Uso: chame patchConsole() UMA vez no topo do processo principal.
 * Todos os console.log / console.warn / console.error subsequentes
 * terao os valores sensiveis substituidos por "****".
 */

const SENSITIVE_ENV_KEYS = [
  'SHOPEE_PARTNER_KEY',
  'SHOPEE_PARTNER_ID',
  'MERCADO_LIVRE_CLIENT_ID',
  'MERCADO_LIVRE_TOOL_ID',
  'MERCADO_LIVRE_CLIENT_SECRET',
  'MERCADO_LIVRE_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER'
];

function getSensitiveValues() {
  return SENSITIVE_ENV_KEYS
    .map((k) => process.env[k])
    .filter((v) => typeof v === 'string' && v.length >= 4);
}

function maskString(str, sensitiveValues) {
  let result = String(str);

  // Mascaramento de Telefone (BR) / WhatsApp PII
  // Mascaramento de numeros de WhatsApp (Ex: 5511999998888@c.us)
  result = result.replace(/(55\d{2})9?(\d{4})(\d{4})@c\.us/g, '$1****$3@c.us');
  // Mascaramento de formato BR formatado: +55 (11) 99999-8888
  result = result.replace(/\+55\s*\(?(\d{2})\)?\s*9?(\d{4})-?(\d{4})/g, '+55 ($1) ****-$3');

  for (const val of sensitiveValues) {
    // Substitui todas as ocorrencias exatas pelo mesmo comprimento de asteriscos
    const stars = '*'.repeat(Math.min(val.length, 12));
    result = result.split(val).join(stars);
  }
  return result;
}

function maskArg(arg, sensitiveValues) {
  if (typeof arg === 'string') return maskString(arg, sensitiveValues);
  // Nao serializa objetos; deixa o console formatar normalmente
  return arg;
}

let patched = false;

function patchConsole() {
  if (patched) return;
  patched = true;

  const methods = ['log', 'warn', 'error', 'info', 'debug'];
  const originals = {};

  methods.forEach((method) => {
    originals[method] = console[method].bind(console);
    console[method] = (...args) => {
      const sensitive = getSensitiveValues();
      if (sensitive.length === 0) {
        originals[method](...args);
        return;
      }
      const masked = args.map((a) => maskArg(a, sensitive));
      originals[method](...masked);
    };
  });
}

module.exports = { patchConsole, maskString, getSensitiveValues };
