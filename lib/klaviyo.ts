// Klaviyo REST v2024-10-15 wrapper
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";

function key() {
  const k = process.env.KLAVIYO_API_KEY;
  if (!k) throw new Error("KLAVIYO_API_KEY not set");
  return k;
}

function headers() {
  return {
    Authorization: `Klaviyo-API-Key ${key()}`,
    "Content-Type": "application/json",
    accept: "application/json",
    revision: REVISION,
  };
}

export interface KlaviyoTemplate {
  id: string;
  name: string;
  html: string;
}

export async function createTemplate(opts: {
  name: string;
  html: string;
  text?: string;
}): Promise<KlaviyoTemplate> {
  const res = await fetch(`${BASE}/templates/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "template",
        attributes: {
          name: opts.name,
          editor_type: "CODE",
          html: opts.html,
          text: opts.text || "",
        },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return {
    id: json.data.id,
    name: json.data.attributes.name,
    html: json.data.attributes.html,
  };
}

export function renderAdEmail(opts: {
  headline: string;
  body: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  ctaText?: string;
  ctaUrl: string;
}): string {
  const thumb = opts.thumbnailUrl || "";
  const media = opts.videoUrl
    ? `<a href="${opts.videoUrl}" style="display:block"><img src="${thumb}" alt="" style="width:100%;max-width:600px;display:block;border:0" /></a>`
    : thumb
    ? `<img src="${thumb}" alt="" style="width:100%;max-width:600px;display:block;border:0" />`
    : "";
  const cta = opts.ctaText || "Shop Now";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:24px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="padding:32px 32px 16px 32px">
          <h1 style="margin:0 0 16px 0;font-size:28px;line-height:1.2;color:#111">${escapeHtml(opts.headline)}</h1>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.5;color:#444">${escapeHtml(opts.body)}</p>
        </td></tr>
        ${media ? `<tr><td style="padding:0 32px">${media}</td></tr>` : ""}
        <tr><td align="center" style="padding:24px 32px 32px 32px">
          <a href="${opts.ctaUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px">${escapeHtml(cta)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
