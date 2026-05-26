import { NextRequest, NextResponse } from "next/server";
import { startUgc, type UgcInputs } from "@/lib/ugc";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<UgcInputs>;
    if (!body.productTitle || !body.productImageUrl || !body.script || !body.hook || !body.style) {
      return NextResponse.json(
        { error: "missing required fields: productTitle, productImageUrl, script, hook, style" },
        { status: 400 }
      );
    }
    // SSRF guard: only public https URLs (Shopify CDN, public images)
    if (!/^https:\/\//i.test(body.productImageUrl)) {
      return NextResponse.json({ error: "productImageUrl must be https://" }, { status: 400 });
    }
    // Strip control chars and cap free-text fields to prevent prompt-injection / oversize abuse
    const clean = (s: string, max: number) => s.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
    const inputs: UgcInputs = {
      productTitle: clean(body.productTitle, 200),
      productDescription: body.productDescription ? clean(body.productDescription, 500) : undefined,
      productImageUrl: body.productImageUrl,
      script: clean(body.script, 1200),
      hook: clean(body.hook, 200),
      style: body.style,
      demographic: body.demographic ? clean(body.demographic, 200) : undefined,
      setting: body.setting ? clean(body.setting, 200) : undefined,
      language: body.language || "en",
    };
    const state = await startUgc(inputs);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ugc start failed" },
      { status: 500 }
    );
  }
}
