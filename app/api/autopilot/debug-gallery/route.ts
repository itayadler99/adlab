// Debug endpoint: fetch a Shopify product's gallery, run the vision picker,
// return the ranked list. No video gen, no Apify cost.
//
// POST { productHandle?: string; productId?: string | number; productTitle?: string }
//   - Provide handle OR id. If only handle, we resolve to id via Shopify search.
//   - title defaults to the product's title.
//
// Used to self-verify that the gallery picker is wired up in production.

import { NextRequest, NextResponse } from "next/server";
import { getProductImages, getProducts } from "@/lib/shopify";
import { pickGalleryReferences } from "@/lib/product-gallery-picker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      productHandle?: string;
      productId?: string | number;
      productTitle?: string;
      themeMatch?: string;
    };

    let productId = body.productId ? String(body.productId) : undefined;
    let productTitle = body.productTitle;

    // Resolve handle/themeMatch to a product id.
    if (!productId) {
      const { products } = await getProducts(50);
      let matched = products[0];
      if (body.productHandle) {
        matched = products.find((p) => p.handle === body.productHandle) || matched;
      } else if (body.themeMatch) {
        const needle = body.themeMatch.toLowerCase();
        matched = products.find((p) => p.title.toLowerCase().includes(needle)) || matched;
      }
      productId = String(matched.id);
      productTitle = productTitle || matched.title;
    }
    if (!productTitle) productTitle = "Jewelry";

    const gallery = await getProductImages(productId);
    if (gallery.length === 0) {
      return NextResponse.json({ productId, productTitle, gallery: [], picked: null, note: "no gallery" });
    }

    const picked = await pickGalleryReferences(gallery, productTitle, 3);
    return NextResponse.json({
      productId,
      productTitle,
      galleryCount: gallery.length,
      gallery,
      picked,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "debug-gallery failed" },
      { status: 500 }
    );
  }
}
