require('dotenv').config();
const fs = require('fs');
const path = require('path');

const TOOL_ID = process.env.MERCADO_LIVRE_TOOL_ID;
const MATT_WORD = process.env.MERCADO_LIVRE_AFFILIATE_USERNAME || 'canalwpp';

function gerarLinkAfiliado(productId) {
  const baseUrl = `https://www.mercadolivre.com.br/p/${productId}`;
  return `${baseUrl}?matt_tool=${TOOL_ID}&matt_word=${MATT_WORD}`;
}

// Lê um arquivo de IDs (um por linha) e gera links afiliados
function processarArquivo(inputFile, outputFile) {
  const ids = fs.readFileSync(inputFile, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const linhas = ids.map(id => `${id}\t${gerarLinkAfiliado(id)}`);
  fs.writeFileSync(outputFile, linhas.join('\n'));
  console.log(`Links gerados em: ${outputFile}`);
}

// Exemplo de uso: node gerar-links-batch.js ids.txt links-afiliados.txt
if (require.main === module) {
  const [,, inputFile, outputFile] = process.argv;
  if (!inputFile || !outputFile) {
    console.log('Uso: node gerar-links-batch.js <arquivo_ids.txt> <saida_links.txt>');
    process.exit(1);
  }
  processarArquivo(inputFile, outputFile);
}
