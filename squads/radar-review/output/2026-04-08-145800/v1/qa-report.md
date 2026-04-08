## 🧪 Relatório de QA — Radar de Ofertas

### Resumo Executivo
O sistema possui uma estrutura inicial de testes de integração com `processador-ofertas.test.js`, `global-lock.test.js` e `scheduler-core.test.js`, sugerindo que o núcleo foi pensado com testabilidade. Contudo, há uma forte deficiência em mocks adequados para APIs externas (Mercado Livre e Shopee), bem como para o cliente WhatsApp (`whatsapp-web.js`), o que abre brecha para bugs silenciosos na interface com esses serviços.

### Cobertura Atual
- Testes existentes: 4 arquivos na raiz de `src/`
- Cobertura estimada: ~35% (cobre bem o path de locks e schedule, mas falha no fluxo de disparo)
- Funções críticas sem teste: 
  - Geração de payloads com/sem imagem e tratamento de texto.
  - Comportamento de reenvio/retries no `disparo-completo.js`.
  - Tratamento de token JWT/OAuth corrompido em `src/apis/mercadoLivre.js`.

### Bugs Silenciosos Identificados
1. **Fallback de Imagem Inexistente** → Se a property `imagem` vier `undefined` da Shopee, o cliente do WhatsApp-web levanta exceção ao criar `MessageMedia.fromUrl()`, o que silencia a thread principal e mata a fila de disparo.
2. **Corrupção do Histórico JSON** → `historico-ofertas.json` sendo reescrito simultaneamente por multiplos callbacks sem trava no nível do FS pode trucar no meio, impossibilitando parse reverso e resetando todo tracking de ofertas enviadas.

### Edge Cases Descobertos
- **processador-ofertas.js**:
  - Título com quebra de linha gigante (`\n\n\n`) estourando o limite amigável da mensagem.
  - Preço promocional = 0 (erro de scraping ou API).
  - Array de ofertas vazio (retorno válido da API, mas que não deve crashar o scheduler).
- **mercadoLivre.js**:
  - Token expirado exatamente milissegundos antes da requisição.

### Casos de Teste Propostos (Top 5 prioritários)

#### Caso 1: Disparo seguro sem imagem
```javascript
// Given / When / Then
describe('Processador Ofertas', () => {
  it('deve formatar texto e disparar mesmo que a URL da imagem venha corrompida', async () => {
    // setup
    const ofertaMock = { titulo: "Geladeira", link: "http...", imagem: null };
    const wwebjsMock = { sendMessage: jest.fn().mockResolvedValue(true) };
    
    // action
    const result = await processarOferta(ofertaMock, wwebjsMock);
    
    // assertion
    expect(result.success).toBe(true);
    expect(wwebjsMock.sendMessage).toHaveBeenCalledWith(
      expect.anything(), 
      expect.stringContaining("Geladeira")
    );
  });
});
```

#### Caso 2: Falha elegante no parse do histórico
```javascript
describe('Storage do Histórico', () => {
  it('deve usar array vazio se o JSON do histórico no disco estiver corrompido', () => {
    // setup
    fs.writeFileSync('historico-ofertas.json', '{ json quebrado ]');
    
    // action
    const historico = carregarHistorico();
    
    // assertion
    expect(historico).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });
});
```

#### Caso 3: Lock distribuido estourando TTL
```javascript
describe('Global Lock', () => {
  it('deve limpar lock zombie gerado por processo morto', () => {
    // setup
    fs.writeFileSync('lock.json', JSON.stringify({ pid: 99999, createdAt: Date.now() - 300000 }));
    
    // action
    const lockInfo = acquireGlobalLock();
    
    // assertion
    expect(lockInfo.acquired).toBe(true);
  });
});
```

#### Caso 4: Oferta com precificação zera ou negativa
```javascript
describe('Sanitização de Oferta', () => {
  it('deve pular ofertas com erro flagrante de preço', async () => {
    // setup
    const ofertaMock = { titulo: "Note", preco: 0.00, link: "http..." };
    
    // action
    const result = await sanitizar(ofertaMock);
    
    // assertion
    expect(result.ignorar).toBe(true);
    expect(result.motivo).toBe("PRECO_INVALIDO");
  });
});
```

#### Caso 5: Refresh automático do token do ML
```javascript
describe('ML Integration', () => {
  it('deve chamar o endpoint de refresh token auto e tentar recarregar a oferta', async () => {
    // setup
    apiMock.get.mockRejectedValueOnce({ response: { status: 401 } });
    apiMock.post.mockResolvedValueOnce({ data: { access_token: "new" } });
    apiMock.get.mockResolvedValueOnce({ data: { results: [] } });
    
    // action
    await fetchMercadoLivre();
    
    // assertion
    expect(apiMock.post).toHaveBeenCalledWith(expect.stringContaining('oauth/token'));
  });
});
```

### Recomendações de Setup
- Framework: **Jest** — É o padrão ouro para mocking no ecossistema Node, facilitando criar os intercepts para WhatsApp-Web.js e Axios sem sobrecarga no ambiente local.
- Estrutura: Mover os arquivos para uma pasta dedicada `test/unit/` e `test/integration/`.
- Dependências a instalar: `npm install --save-dev jest supertest`
