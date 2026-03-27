#!/usr/bin/env node
/**
 * SHOPEE AFFILIATE API - Implementação com assinatura SHA256 correta
 *
 * Fórmula de assinatura descoberta:
 * base_string = appId + timestamp + JSON.stringify({query}) + secret
 * signature = SHA256(base_string)
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const APP_ID = process.env.SHOPEE_PARTNER_ID;
const APP_SECRET = process.env.SHOPEE_PARTNER_KEY;

class ShopeeAffiliateAPI {
  constructor() {
    this.baseURL = 'https://open-api.affiliate.shopee.com.br/graphql';
  }

  /**
   * Gerar assinatura SHA256 conforme explorador Shopee
   */
  gerarSignatura(query, timestamp = null) {
    if (!timestamp) {
      timestamp = Math.ceil(new Date().getTime() / 1000);
    }

    const payload = JSON.stringify({ query });
    const baseString = APP_ID + timestamp + payload + APP_SECRET;
    const signature = crypto
      .createHash('sha256')
      .update(baseString)
      .digest('hex');

    return { timestamp, signature };
  }

  /**
   * Fazer requisição GraphQL autenticada
   */
  async executarQuery(query) {
    try {
      const { timestamp, signature } = this.gerarSignatura(query);

      console.log(`\n[SHOPEE API] Enviando query...`);
      console.log(`  App ID: ${APP_ID}`);
      console.log(`  Timestamp: ${timestamp}`);
      console.log(`  Signature: ${signature.substring(0, 20)}...`);

      const response = await axios.post(
        this.baseURL,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
          },
          timeout: 15000
        }
      );

      // Verificar se há erros GraphQL
      if (response.data?.errors) {
        console.log(`[ERRO GraphQL] ${response.data.errors[0].message}`);
        return null;
      }

      return response.data?.data;
    } catch (error) {
      console.error(`[ERRO Conexão] ${error.message}`);
      return null;
    }
  }

  /**
   * Buscar ofertas de lojas
   */
  async buscarOfertas(limite = 20) {
    const query = `{
  shopOfferV2(limit: ${limite}) {
    nodes {
      commissionRate
      imageUrl
      offerLink
      originalLink
      shopId
      shopName
      periodStartTime
      periodEndTime
      ratingStar
      shopType
      remainingBudget
      sellerCommCoveRatio
    }
    pageInfo {
      page
      limit
      hasNextPage
    }
  }
}`;

    const data = await this.executarQuery(query);
    if (data?.shopOfferV2?.nodes) {
      console.log(`[✓] ${data.shopOfferV2.nodes.length} ofertas obtidas`);
      return data.shopOfferV2.nodes;
    }

    return [];
  }

  /**
   * Buscar produtos com comissão (simplificado)
   */
  async buscarProdutos(limite = 20) {
    const query = `{
  productOfferV2(limit: ${limite}) {
    nodes {
      itemId
      commissionRate
      appExistRate
      appNewRate
      webExistRate
      webNewRate
      commission
      price
      sales
      imageUrl
      productName
      shopName
      productLink
      offerLink
      periodEndTime
      periodStartTime
      priceMin
      priceMax
      ratingStar
      priceDiscountRate
      shopId
      shopType
      sellerCommissionRate
      shopeeCommissionRate
    }
    pageInfo {
      page
      limit
      hasNextPage
      scrollId
    }
  }
}`;

    const data = await this.executarQuery(query);
    if (data?.productOfferV2?.nodes) {
      console.log(`[✓] ${data.productOfferV2.nodes.length} produtos obtidos`);
      return data.productOfferV2.nodes;
    }

    return [];
  }
}

module.exports = ShopeeAffiliateAPI;

// ============ TESTE ============

if (require.main === module) {
  (async () => {
    console.log('='.repeat(70));
    console.log('  TESTE - SHOPEE AFFILIATE API COM AUTENTICAÇÃO REAL');
    console.log('='.repeat(70));

    const api = new ShopeeAffiliateAPI();

    // Buscar ofertas de lojas
    console.log('\n[TESTE 1] Buscando ofertas de lojas...');
    const ofertas = await api.buscarOfertas(5);

    if (ofertas.length > 0) {
      console.log('\n[RESULTADO] Primeiras 3 ofertas:');
      ofertas.slice(0, 3).forEach((o, i) => {
        const comissao = (parseFloat(o.commissionRate) * 100).toFixed(1);
        console.log(`  [${i + 1}] ${o.shopName}`);
        console.log(`      Comissão: ${comissao}% | Rating: ${o.ratingStar}⭐`);
        console.log(`      Link: ${o.offerLink}`);
      });
    }

    // Buscar produtos
    console.log('\n[TESTE 2] Buscando produtos com comissão...');
    const produtos = await api.buscarProdutos(5);

    if (produtos.length > 0) {
      console.log('\n[RESULTADO] Primeiros 3 produtos:');
      produtos.slice(0, 3).forEach((p, i) => {
        const comissao = (parseFloat(p.commissionRate) * 100).toFixed(1);
        const desconto = p.priceDiscountRate || 0;
        console.log(`  [${i + 1}] ${p.productName}`);
        console.log(`      R$ ${p.price} | Comissão: ${comissao}% | Desconto: ${desconto}%`);
        console.log(`      Link: ${p.offerLink}`);
      });
    }
  })();
}
