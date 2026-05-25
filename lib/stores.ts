export interface StoreConfig {
  id: string;
  name: string;
  adAccountId: string;
  pageId: string;
  shopifyDomain?: string;
  defaultLink?: string;
}

// Reads per-store config from env. Falls back to META_AD_ACCOUNT_ID / META_PAGE_ID.
function envOr(key: string, fallback?: string): string {
  return process.env[key] || fallback || "";
}

export const STORES: StoreConfig[] = [
  {
    id: "montier_us",
    name: "Montier US",
    adAccountId: envOr("META_AD_ACCOUNT_MONTIER_US", "act_2312364629134701"),
    pageId: envOr("META_PAGE_MONTIER_US"),
    shopifyDomain: envOr("SHOPIFY_DOMAIN_MONTIER_US"),
    defaultLink: envOr("LINK_MONTIER_US", "https://montierjewelry.com"),
  },
  {
    id: "sneakers",
    name: "Sneakers",
    adAccountId: envOr("META_AD_ACCOUNT_SNEAKERS"),
    pageId: envOr("META_PAGE_SNEAKERS"),
    shopifyDomain: envOr("SHOPIFY_DOMAIN_SNEAKERS"),
    defaultLink: envOr("LINK_SNEAKERS"),
  },
  {
    id: "studio",
    name: "Studio",
    adAccountId: envOr("META_AD_ACCOUNT_STUDIO"),
    pageId: envOr("META_PAGE_STUDIO"),
    shopifyDomain: envOr("SHOPIFY_DOMAIN_STUDIO"),
    defaultLink: envOr("LINK_STUDIO"),
  },
  {
    id: "treyzer",
    name: "Treyzer",
    adAccountId: envOr("META_AD_ACCOUNT_TREYZER"),
    pageId: envOr("META_PAGE_TREYZER", "269994772864708"),
    shopifyDomain: envOr("SHOPIFY_DOMAIN_TREYZER"),
    defaultLink: envOr("LINK_TREYZER"),
  },
];

export function getStore(id: string): StoreConfig | undefined {
  return STORES.find((s) => s.id === id);
}
