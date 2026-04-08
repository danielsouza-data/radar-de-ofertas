## 🏗️ Relatório Arquitetural — Radar de Ofertas

### Resumo Executivo
O sistema atual segue o padrão *Big Ball of Mud* e *Monolítico Procedural*. Funciona de maneira orgânica, porém acopla a camada de extração (Shopee/ML) com o core de disparo (WhatsApp) e o estado (FS Local). A evolução passará por componentizar a integração num modelo baseado em eventos, desacoplando o scrapper do disparador para aguentar múltiplos canais e afiliados simultaneamente.

### Diagrama As-Is
- **Disparo-Completo.js** atua como script centralizado (Deus Class) que carrega cronjobs, integrações e mensageria no mesmo runtime loop.
- **processador-ofertas.js** lida com parsing HTML e requisições HTTP atreladas, falhando com timeouts ou OOM sob stress.
- O Lock e agendador são acoplados ao file system local (`historico-ofertas.json`).

### Viés e Oportunidades
1. O forte acoplamento com Local File System impede a execução distribuída.
2. Não há Injeção de Dependências, o que reduz drasticamente a testabilidade unitária.
3. Tratamento monolítico limita a adição de novos marketplaces (Amazon, AliExpress) já que adicionam delay linear à thread do Event Loop Node.js.

### Target Arquitetural (To-Be)
1. **Padrão Hexagonal (Ports and Adapters):** O core da aplicação deve focar apenas no processo agnóstico "Oferta → Fila → Usuário". WhatsApp, MercadoLivre e Shopee devem ser adaptadores puramente plugáveis.
2. **Filas de Mensagem:** Introduzir RabbitMQ ou Redis Kue entre a extração da oferta e o seu processamento final para garantir resiliência e retries atômicos.
3. **Database Relacional/Documental:** Substituir JSON cru no disco por SQLite/Postgres para que históricos e sessões possam ter transações ACID.

### Plano de Refatoração Tático
1. Criar um Adapter pattern para APIs `src/marketplaces/ShopeeAdapter.js` e `MercadoLivreAdapter.js` injetáveis e agnósticos.
2. Extrair o agendador de `disparo-completo.js` para um Queue worker desacoplado.
3. Migrar de `historico-ofertas.json` para SQLite com Prisma.
