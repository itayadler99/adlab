// Shopify Admin REST API wrapper — Montier US
const SHOP = process.env.SHOPIFY_SHOP_DOMAIN || "montier-us.myshopify.com";
const VERSION = "2025-01";

function token() {
  const t = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!t) throw new Error("SHOPIFY_ACCESS_TOKEN not set");
  return t;
}

async function shopGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`https://${SHOP}/admin/api/${VERSION}${path}`, {
    headers: { "X-Shopify-Access-Token": token(), "Content-Type": "application/json" },
  });
  return res.json();
}

export interface ShopProduct {
  id: number;
  title: string;
  handle: string;
  image?: { src: string };
  variants?: { price: string }[];
}

export async function getProducts(limit = 50): Promise<{ products: ShopProduct[] }> {
  return shopGet(`/products.json?limit=${limit}&fields=id,title,handle,image,variants`);
}

export async function getProduct(id: number) {
  return shopGet(`/products/${id}.json`);
}

export function productUrl(handle: string) {
  return `https://${SHOP.replace(".myshopify.com", "")}/products/${handle}`;
}
