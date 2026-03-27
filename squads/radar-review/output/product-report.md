# 🚀 Relatório de Produto — Radar de Ofertas
**Agente:** Estrategista de Produto  
**Data:** 2025-07-25  
**Contexto:** WhatsApp broadcast bot que envia ofertas de Shopee e Mercado Livre para um canal único via WhatsApp Web.js

---

## Resumo Executivo

O produto está funcional e resolve o problema central (entregar ofertas com bom desconto para um canal de WhatsApp). No entanto, opera no modo mais básico possível: **sem feedback de desempenho, sem segmentação, sem curadoria dinâmica inteligente, e sem loop de melhoria**. Sem saber quais ofertas geram mais cliques ou interesse, é impossível melhorar a seleção ao longo do tempo. O ponto de maior alavancagem imediato é criar visibilidade sobre o que está funcionando.

---

## Análise do Estado Atual

### O Que Existe
- Envio automático para um único canal (`WHATSAPP_CHANNEL_ID`)
- Busca dinâmica de ofertas via API Shopee + Mercado Livre
- Fallback para lista curada manual (`src/ofertas-curadas.js`)
- Anti-repetição por link e nome de produto (últimas ofertas no log)
- Ranking interno por score (desconto, avaliação, comissão, vendas)
- Dashboard com histórico de envios e heatmap de horários

### O Que Falta para um Produto de Verdade
- Nenhuma métrica de engajamento (cliques, reações, respostas)
- Nenhuma segmentação de audiência
- Nenhuma cadência ou horário inteligente baseado em dados reais
- Nenhuma gestão de categorias (tech, casa, beleza)
- Produtos curados são placeholders — não são ofertas reais do dia

---

## Oportunidades de Produto

### 🟠 Altas (impacto direto em receita/engajamento)

**1. Zero visibilidade sobre CTR e conversão**
- **Situação:** O sistema envia a oferta e registra ACK (lida/entregue), mas não existe nenhum mecanismo para saber se alguém clicou no link.
- **Impacto imediato:** Sem dados, a seleção de ofertas não melhora. Qualquer produto poderia ser ruim e o operador nunca saberia.
- **Oportunidade:** Substituir links diretos por links encurtados rastreáveis (utm_source já está presente nos links ML e Shopee), ou usar um redirect próprio via Express:
  ```javascript
  // No dashboard-server.js — link de rastreamento
  app.get('/r/:ofertaId', (req, res) => {
    // logar clique com timestamp, ofertaId
    // redirecionar para URL real
  });
  ```
  Isso permitiria medir qual marketplace, horário e categoria convertem mais.

**2. Dados curados são placeholders — não refletem ofertas reais**
- **Situação:** `src/ofertas-curadas.js` tem produtos com IDs fictícios (`MLB48946861`, `12345678A`), preços que provavelmente não refletem o mercado atual, e sem `image_url`.
- **Impacto:** Quando as APIs falham, o canal recebe ofertas "fantasmas" que não existem ou têm preço desatualizado, corroendo a confiança dos inscritos.
- **Oportunidade:** Transformar as ofertas curadas em um arquivo de configuração mantido semanalmente com produtos reais, ou eliminar o fallback curado e tratar a falha de API como "sem disparo hoje" ao invés de "disparo com dado ruim".

**3. Horário de disparo não está otimizado por dados**
- **Situação:** O sistema dispara baseado em CRON — não existe análise de qual horário gera mais engajamento. O dashboard tem um heatmap de horários de envio, mas não de horários de leitura/clique.
- **Oportunidade:** No curto prazo (sem dados de clique), testar 3 horários distintos em semanas alternadas (manhã 8h, tarde 12h, noite 20h) e comparar taxa de ACK=2 (lida) para inferir melhor janela. O dado já está disponível nos logs.

---

### 🟡 Médias

**4. Canal único sem segmentação**
- **Situação:** Todas as ofertas vão para um único canal de WhatsApp. Não há como enviar "ofertas de eletrônicos" para quem prefere isso vs "ofertas de moda/beleza" para outro grupo.
- **Oportunidade de médio prazo:** Adicionar suporte a múltiplos `CHANNEL_ID` por categoria. O refactoring seria mínimo — `CHANNEL_ID` já é uma variável de env, bastaria torná-la uma lista com mapeamento de categoria.

**5. Nenhum controle de qualidade de oferta antes do envio**
- **Situação:** O sistema filtra por `ofertaTemImagem()` e score mínimo, mas não valida se o link ainda funciona, se o preço mudou ou se o produto foi retirado de venda antes do envio.
- **Oportunidade:** Adicionar uma chamada HEAD rápida ao link da oferta antes de enviar (timeout de 3s, fallback pular a oferta):
  ```javascript
  async function linkEstaAtivo(url) {
    try {
      const res = await axios.head(url, { timeout: 3000 });
      return res.status < 400;
    } catch { return false; }
  }
  ```

**6. Sem conteúdo editorial — só dados estruturados**
- **Situação:** A mensagem é 100% template. Não há comentário humano, contexto de "por que essa oferta é boa", ou narrativa.
- **Oportunidade (baixo esforço):** Adicionar um campo `obs` opcional ao objeto de oferta que aparece como nota do Radar embaixo do bloco de preço:
  ```
  💬 Nota do Radar: Melhor preço histórico segundo o Keepa. Estoque limitado.
  ```

---

### 🟢 Baixa prioridade (expansão futura)

**7. Multi-canal e alertas de preço por usuário** — permitir que inscritos definam alertas via reply ou formulário. Requer backend mais robusto.

**8. Integração com Amazon** — terceiro marketplace com API de afiliados bem documentada (`amazon-paapi`). Diversificaria o catálogo.

**9. Newsletter semanal de resumo** — envio automático do "top 5 da semana" toda segunda-feira, com as melhores ofertas por métrica de desconto acumulado.

---

## Métricas de Produto Sugeridas (para implementar agora)

| Métrica | Como medir hoje | Frequência |
|---|---|---|
| Taxa de ACK=2 (lida) | `disparos-log.json` campo `ackEnvio` | Por disparo |
| Ofertas puladas por sem imagem | `puladasSemImagem` já logado | Por ciclo |
| % de disparos de fallback curado | Adicionar campo `fonte: 'curada'\|'api'` ao log | Por disparo |
| Total de falhas por marketplace | `disparos-falhas.json` filtrado por campo `marketplace` | Diário |

---

## Top 3 Ações de Produto

| Prioridade | Ação | Impacto | Esforço |
|---|---|---|---|
| 1 | Adicionar rastreamento de clique via redirect Express (`/r/:ofertaId`) | Visibilidade de CTR | ~2h |
| 2 | Atualizar `ofertas-curadas.js` com produtos reais ou remover o fallback de dados fictícios | Qualidade das mensagens | ~30 min |
| 3 | Adicionar campo `fonte: 'curada'\|'api'` ao log de disparo para medir dependência de API | Diagnóstico de falhas API | ~15 min |
