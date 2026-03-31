# Relatório de Dados/ETL

**Responsável:** Especialista em Dados/ETL

## Diagnóstico
- Dados extraídos do Mercado Livre passam por transformação em `processador-ofertas.js` e `src/`.
- Não há validação formal de schema dos dados recebidos.
- Duplicidades podem ocorrer em lotes grandes, pois a deduplicação é feita apenas por ID.
- Não há logs detalhados de etapas de transformação e enriquecimento.

## Recomendações
1. Implementar validação de schema (ex: com Joi ou Zod) para dados recebidos do ML.
2. Deduplicar ofertas considerando múltiplos campos (ID, título, preço).
3. Adicionar logs detalhados em cada etapa de transformação.
4. Enriquecer dados com informações adicionais (categoria, reputação do vendedor, etc).
5. Validar dados antes do disparo para o usuário final.

## Exemplo de validação
```js
const ofertaSchema = Joi.object({
  id: Joi.string().required(),
  title: Joi.string().required(),
  price: Joi.number().required(),
  // ...outros campos
});
const { error } = ofertaSchema.validate(ofertaRecebida);
if (error) {
  // Log e descartar oferta
}
```

## Conclusão
O pipeline de dados é funcional, mas pode ser aprimorado para garantir maior qualidade, consistência e rastreabilidade.