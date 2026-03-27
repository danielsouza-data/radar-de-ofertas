/**
 * DADOS CURADOS - Ofertas que você selecionou manualmente
 * Atualize este arquivo com ofertas reais que encontra nos marketplaces
 *
 * Formato esperado:
 * {
 *   marketplace: "Shopee" | "Mercado Livre",
 *   product_id: "seu_id",
 *   product_name: "nome do produto",
 *   slug: "slug-do-produto" (só Mercado Livre),
 *   price: 99.90,
 *   original_price: 199.90,
 *   rating: 4.5,
 *   seller_id: "123456" (só Shopee)
 * }
 */

const OFERTAS_CURADAS = {
  // ============ MERCADO LIVRE ============
  mercadolivre: [
    {
      marketplace: 'Mercado Livre',
      product_id: 'MLB48946861',
      product_name: 'Samsung Galaxy A06 5G 128GB Dual Sim Preto',
      slug: 'samsung-galaxy-a06-5g-dual-sim-128gb-preto',
      price: 799.90,
      original_price: 1299.90,
      rating: 4.8
    },
    {
      marketplace: 'Mercado Livre',
      product_id: 'MLB49234567',
      product_name: 'Fone Bluetooth JBL Tune 670 Azul',
      slug: 'fone-bluetooth-jbl-tune-670-azul',
      price: 199.90,
      original_price: 399.90,
      rating: 4.7
    },
    {
      marketplace: 'Mercado Livre',
      product_id: 'MLB50123456',
      product_name: 'Tablet Samsung Galaxy Tab A8 32GB WiFi',
      slug: 'tablet-samsung-galaxy-tab-a8-32gb-wifi',
      price: 899.90,
      original_price: 1499.90,
      rating: 4.6
    },
    {
      marketplace: 'Mercado Livre',
      product_id: 'MLB50987654',
      product_name: 'Smart Watch Xiaomi Band 8 Pro',
      slug: 'smart-watch-xiaomi-band-8-pro',
      price: 299.90,
      original_price: 599.90,
      rating: 4.5
    },
    {
      marketplace: 'Mercado Livre',
      product_id: 'MLB51234567',
      product_name: 'Carregador Rápido 65W USB-C PD',
      slug: 'carregador-rapido-65w-usb-c-pd',
      price: 89.90,
      original_price: 179.90,
      rating: 4.9
    }
  ],

  // ============ SHOPEE ============
  shopee: [
    {
      marketplace: 'Shopee',
      product_id: '12345678A',
      seller_id: '9876543',
      product_name: 'Fone sem fio TWS Blitzwolf Pro',
      price: 84.90,
      original_price: 219.90,
      rating: 4.7
    },
    {
      marketplace: 'Shopee',
      product_id: '87654321B',
      seller_id: '1234567',
      product_name: 'Powerbank 20000mAh Turbo com LED',
      price: 54.90,
      original_price: 139.90,
      rating: 4.6
    },
    {
      marketplace: 'Shopee',
      product_id: '11111111C',
      seller_id: '5555555',
      product_name: 'Cabo USB-C 2m Nylon Reforcado',
      price: 21.90,
      original_price: 64.90,
      rating: 4.8
    },
    {
      marketplace: 'Shopee',
      product_id: '22222222D',
      seller_id: '6666666',
      product_name: 'Protetor de Tela Vidro 9H Premium',
      price: 16.90,
      original_price: 54.90,
      rating: 4.9
    },
    {
      marketplace: 'Shopee',
      product_id: '33333333E',
      seller_id: '7777777',
      product_name: 'Mouse Gamer RGB 6400 DPI',
      price: 64.90,
      original_price: 169.90,
      rating: 4.5
    }
  ]
};

module.exports = OFERTAS_CURADAS;

/*
   COMO ATUALIZAR:
   ================

   1. Visite mercadolivre.com.br ou shopee.com.br
   2. Encontre uma oferta interessante com bom desconto
   3. Copie as informacoes e atualize este arquivo
  4. Execute: node disparo-completo.js

   CAMPOS OBRIGATORIOS:
   ====================

   Mercado Livre:
   - marketplace: "Mercado Livre"
   - product_id: (copie da URL como MLB12345678)
   - product_name: (nome do produto)
   - slug: (copie da URL como "celular-smartphone")
   - price: (preço atual)
   - original_price: (preço anterior)
   - rating: (de 1 a 5)

   Shopee:
   - marketplace: "Shopee"
   - product_id: (copie da URL como 12345678)
   - seller_id: (copie da URL como 9876543)
   - product_name: (nome do produto)
   - price: (preço atual)
   - original_price: (preço anterior)
   - rating: (de 1 a 5)

   DICA: Quanto maior o desconto + melhor rating = maior score no ranking!
*/
