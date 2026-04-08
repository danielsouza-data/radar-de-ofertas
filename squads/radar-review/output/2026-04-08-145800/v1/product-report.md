## 🚀 Relatório de Produto — Radar de Ofertas

### Resumo Executivo
O Radar de Ofertas possui um Product-Market Fit claro para o público brasileiro caçador de promoções, conectando consumo passivo no WhatsApp com monetização direta via revenda de links de afiliados. No entanto, o produto atual trata todos os assinantes como uma massa única (broadcast), limitando o LTV (Life Time Value) e ignorando oportunidades de personalização e gatilhos de recuperação de compra.

### Jornada do Usuário & Retenção

1. **Urgência vs. Fadiga:** O envio constante de ofertas não segmentadas gera um "blind spot" (cegueira de banner no WhatsApp). Os usuários tendem a silenciar canais que disparam volumes muito altos de produtos irrelevantes. 
   - *Oportunidade:* Limitar a N disparos diários altamente curados e agrupar ofertas comuns em um único "Digest Diário".
2. **Onboarding Silencioso:** Atualmente o usuário entra no grupo/canal e apenas espera.
   - *Oportunidade:* Mensagem de boas-vindas com as "Regras de Ouro" de como comprar mais rápido e como ativar notificações só para horários de pico.

### Monetização & Afiliação

1. **Dependência de Shopee e Mercado Livre:** Centralizar a receita em apenas dois players impõe risco de mudança de comissionamento.
   - *Oportunidade:* Integrar Amazon Associates e Magalu, aumentando a chance de bater ofertas campeãs (ex: iPhone, Fraldas) que geram comissões premiums.
2. **Estratégia de Link Building:** Os trackers atuais não discriminam a fonte/categoria da oferta.
   - *Oportunidade:* Adicionar `sub_ids` específicos por categoria de produto. Ex: se roupas vendem melhor às 19h, direcionar curadoria de moda para a noite.

### Mapa de Funcionalidades Recomendadas (Product Roadmap)

#### 🏃 Curto Prazo (Quick Wins)
- [ ] **Curadoria Inteligente por Desconto Real**: Só enviar produtos cujo desconto atual seja real (via cruzamento de histórico básico) e > 30%, criando status de "Oportunidade Rara".
- [ ] **CTA Otimizado**: Adicionar gatilhos como "Estoque baixo no ML" ou "Últimas unidades", usando os dados de estoque da API.

#### 🚶 Médio Prazo
- [ ] **Categorização de Canais Automática**: Criar canais paralelos (ex: "Radar Tech" e "Radar Casa") e usar o mesmo core/backend para processar o fluxo, diversificando a audiência.
- [ ] **Pesquisa sob Demanda**: Permitir que o usuário mande uma mensagem no PV do bot "Quero geladeira" e o bot responda com um affiliate link on-the-fly.

#### 🧗 Longo Prazo
- [ ] **Cashback Próprio**: Compartilhar uma fração da comissão do ML/Shopee com o comprador mais frequente usando PIX automático de R$ 5 a R$ 10 como engajamento.

### KPIs de Produto a Monitorar
1. **CTR (Click-Through Rate) no Link do WhatsApp:** Taxa de conversão de cliques por disparo.
2. **Revenue per Send (RPS):** Ticket médio gerado por cada broadcast realizado.
3. **Churn de Assinantes:** Quantos usuários silenciam ou saem do grupo/transmissão semanalmente.
