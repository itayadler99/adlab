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

/**
 * Pull every gallery image for a product. Shopify exposes them under
 * `/products/{id}/images.json`. We bias the ordering by `position` so the
 * caller can take a top-K slice that matches the storefront sort.
 */
export async function getProductImages(id: number | string): Promise<string[]> {
  const res = await shopGet<{ images?: { src: string; position?: number }[] }>(
    `/products/${id}/images.json`
  );
  const imgs = (res.images || []).slice();
  imgs.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  return imgs.map((i) => i.src).filter((u): u is string => typeof u === "string" && u.length > 0);
}

// Storefront domain (where shoppers land). Differs from admin domain (xxx.myshopify.com).
const STOREFRONT = process.env.SHOPIFY_STOREFRONT_DOMAIN || process.env.LINK_MONTIER_US?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "montierjewelry.com";

export function productUrl(handle: string) {
  return `https://${STOREFRONT}/products/${handle}`;
}
