## 📊 Relatório Executivo Consolidado — Radar de Ofertas

### Visão Geral da Análise
A arquitetura do Radar de Ofertas comprova-se funcional e com Product-Market Fit claro para o nicho de caçadores de ofertas no Brasil. No entanto, o sistema opera num modelo monolítico com forte acoplamento entre a extração e a mensageria, o que gera gargalos de escala e riscos de interrupção silenciosa (downtime). A evolução do bot de uma operação "solo" para um sistema distribuído multicanais requererá as ações prioritárias abaixo.

---

### Top 5 Ações Imediatas (Priorizadas por Impacto)

#### 1. Implementação de Circuit Breaker (Prioridade SRE & QA)
**Problema:** Falhas na API da Shopee ou ausência de campos chave (como `#imagem`) causam o travamento silencioso do scheduler ou erros não tratados no Whatsapp-web.js.
**Ação:** Implementar padrão Circuit Breaker no `processador-ofertas.js`. Em caso de erro repetido na extração 3rd-party, o sistema deve pausar temporariamente as requisições, sem derrubar a fila de envios. No nível do WhatsApp, incluir tratamento contra media ausente antes da chamada `.sendMessage()`.

#### 2. Proteção de Credenciais Dinâmicas (Prioridade Segurança & QA)
**Problema:** Vulnerabilidade no manuseio de tokens (Mercado Livre/Shopee OAuth) e armazenamento local das sessões web (`.wwebjs_cache/`).
**Ação:** Ocultar PII nos logs com regex robustas (`log-mask.js`) de forma centralizada (interceptação) e assegurar que a pasta da sessão e os .js scripts evitem o modo 'root'. Adicionalmente, tratar tokens expirados on-the-fly (`mercadoLivre.js` refresh automático inter-requests), cobrindo esta mudança essencial com testes em Jest.

#### 3. Desacoplamento da Ingestão vs Disparo (Prioridade Arquitetura)
**Problema:** O Loop é centralizado. Extração da oferta, parsing e disparo acontecem no mesmo runtime tick do arquivo monolítico.
**Ação:** Extrair a funcionalidade das APIs ("Ingestor Shopee", "Ingestor ML") para um Worker isolado usando Adaptadores Hexagonais. Enviar as ofertas processadas para uma fila resiliente (RabbitMQ/Kue). O disparador do WhatsApp só atua como consumidor final da fila.

#### 4. Sandbox e Hardening de Web Scraping (Prioridade Segurança)
**Problema:** Playwright processa dados de afiliados diretamente com os privilégios do OS runner atual. 
**Ação:** Executar a instancia do Playwright headless em contextos mais isolados de permissão, desativando acessos remotos via configuração e limitando recursos em container Docker para mitigar Remote Code Executions de páginas envenenadas.

#### 5. Segmentação Curatorial (Prioridade Produto)
**Problema:** Gatilho massivo (broadcast) desgasta a base de assinantes rapidamente pela irrelevância diária de algumas ofertas.
**Ação:** Validar categorias e aplicar tracking IDs (sub_ids) mais complexos, migrando a estratégia para "Digests Diários" ao invés de mensagens em ping-pong esparsos. Testar o bloqueio de "Falsas Promoções" checando se o desconto real do preço é garantidamente de ponta (>30%).

---

### Impacto Esperado (Ao realizar este roadmap)
- **Zero interrupções fantasma:** Resiliência comprovada onde o sistema notifica falhas externas, mas continua servindo o cache local.
- **Maior Taxa de Clique (CTR):** Com base no reengajamento via escassez e personalização (Produto).
- **Scale-Ready:** Com filas de mensagens, habilitar postagem para canais Telegram/Grupos Facebook torna-se apenas escrever "Consumidores" novos, usando a mesma fila construída.
