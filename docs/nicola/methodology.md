# Nicola Methodology — AdLab Reference

Distilled from Nicola Urbini (@nicola.ai, 89.5K followers, "AI Videos for Personal Brands"), companion docs by @theabhisheik (EXTENDED AI Clone Workflow), and the 25-page "Cinematic Ad Concepts for Brands" VEO JSON pack. This is the single source of truth for AdLab image/video prompts. Code in `lib/nicola-prompt.ts`, `lib/quality-gate.ts`, `lib/veo-brand-presets.ts`, `lib/nicola-domain-presets.ts`, `lib/identity-lock.ts` operationalizes everything below.

---

## Mantra

> If one step is weak, everything collapses.

Identity at Step 1 is the single point of failure. Gate every downstream stage on the previous one passing.

---

## 6-Step Clone Pipeline

| Step | Goal | Tool (Higgsfield wrapper) | Hard rule |
|---|---|---|---|
| 1. FACE | Identity-accurate portrait | NanoBanana Pro / Flux 2.0 / Seedream 4 | Identity-lock checklist (eyes + nose + jaw + hairline) must pass before Step 2 |
| 2. DATASET | 10-20 images, varied poses/outfits/angles/environments | NanoBanana Pro img2img with reference | Each gen passes identity-lock vs Step 1 reference |
| 3. UPSCALE | 4K-8K PNG | OpenArt / Magnific / Lupa AI / Higgsfield Upscale | Mandatory — sub-4K → motion artifacts |
| 4. VOICE | ElevenLabs clone | ElevenLabs Creator+ | 10 min natural conversational audio, NOT script reading |
| 5. MOTION | i2v | VEO 3.1 (cinematic) / Kling (human motion) / PixVerse (lip sync) | i2v mandatory for real product/face; t2v invents fakes |
| 6. ASSEMBLY | Sync, caption, publish | CapCut | Burn captions in post (model can't render Hebrew/RTL) |

---

## 14-Block Prompt (Stills)

Every photoreal image prompt = 14 stackable blocks in this order. Skip a block → model fills with AI-plastic defaults. Implemented in `buildNicolaPrompt()`.

1. **Quality opener** — `Ultra-photorealistic RAW` (default)
2. **Aspect** — `9:16 | 16:9 | 4:5 | 1:1`
3. **Shot type** — `extreme macro close-up | cinematic close-up | medium close-up | medium shot | hero wide | full body`
4. **Subject** — concrete role, NEVER "a person"
5. **Wardrobe** — specific items
6. **Camera position** — where the lens sits
7. **Frame edges** — what crops in
8. **Eye / focus** — default `eyes razor sharp`
9. **Skin realism** — default `realistic skin pores, natural asymmetry, micro-imperfections`
10. **Atmosphere** — ≥5 sensory nouns (sweat, dust, condensation, ice, smoke, particles, reflections…)
11. **Lighting** — explicit source (golden-hour, halo, soft volumetric, neon nightlife…)
12. **Dual-tone** — warm + cool both present
13. **Depth of field** — default `shallow depth of field, rich bokeh`
14. **Genre tag + negative tail** — default `cinematic editorial photography, no text.`

Plus optional **lens** override: `85mm f/1.4 | 50mm | 35mm | 24mm | macro 100mm`.

### Banned buzzwords (`assertNoBuzzwords()`)
`8k`, `4k resolution`, `masterpiece`, `best quality`, `highly detailed`, `beautiful`, `stunning`, `amazing`, `perfect`, `gorgeous`, `breathtaking`. These collapse photoreal models into stock-photo plastic.

---

## Quality Gate (12 rules)

Implemented in `runQualityGate()`. Run before paying for any render.

1. Real product → i2v mandatory (t2v invents fake SKUs)
2. Prompt density ≥ 60 words
3. ≥ 5 atmosphere/texture nouns
4. Dual-tone lighting (warm + cool)
5. Lens explicitly named
6. DoF clause present
7. Negative tail (`no text`) present
8. Aspect ↔ platform fit (IG/TT 9:16, YT 16:9, grid 1:1/4:5)
9. Subject concrete role (not "a person")
10. No banned buzzwords
11. VEO duration ≤ 8s
12. No Hebrew/RTL inside model prompt (burn captions in post)

---

## VEO 3.1 JSON Template (Videos)

Implemented in `buildVeoJson()`. Canonical envelope:

```ts
{
  role: "commercial_director",
  brand: { name, values },
  concept, description,
  style: "photorealistic cinematic, hyper-detail",
  visual_style: { look_and_feel, color_palette, materials, time_of_day, environment },
  scene: { setting, subject, beats: [3 beats × 8s] },
  camera: { framing, movement, lenses, fps: 24 },
  lighting: { style, accents },
  motion, ending,
  audio: { type, mood, no_voiceover: true },
  text: "none",
  output: { duration_seconds: 8, aspect_ratio: "9:16", safety: "brand_safe" },
}
```

Brand presets ready in `lib/veo-brand-presets.ts`:
- `montier_box_burst` — velvet box opens, moissanite chain bursts out
- `montier_chain_orbit` — pure macro hero orbit
- `sneaker_station_eclipse` — wordmark eclipses halo, sneaker emerges
- `flypro_passport_capsule` — passport bursts open, destination diorama assembles
- `generic_luxury_velvet` — fallback luxury template
- `generic_tech_minimal` — Apple/Tesla aesthetic

---

## Identity-Lock Checklist (Step 1 → Step 2 gate)

Four anchors must all match reference (`lib/identity-lock.ts`):

1. Eyes — inter-pupillary distance
2. Nose — bridge + tip shape
3. Jaw — width + chin angle
4. Hairline — starting point + density

Bonus: skin tone within 1 shade.

Fail-closed: regenerate before paying for upscale. Use `buildRegenDirective(drift)` to inject `Preserve identity exactly: …` into the next attempt.

---

## Pitfalls (paid in mistakes, do not repeat)

| Pitfall | Cost | Fix |
|---|---|---|
| t2v on real product | invents fake SKU, ad unusable | i2v with product reference image |
| Hebrew in VEO/NanoBanana prompt | garbled glyphs render | burn captions in CapCut post |
| Skip upscale before motion | plastic face artifacts | always 4K-8K PNG before VEO/Kling |
| Script-read ElevenLabs sample | robotic clone | 10 min natural conversational audio |
| "a person" subject | generic stock face | concrete role ("Israeli male cyclist, 32") |
| 8k / masterpiece / beautiful | model regresses to stock | specific lens/grade/texture vocab |
| Single tone lighting | flat AI look | dual-tone (warm + cool) always |
| VEO duration > 8s | coherence breaks | hard cap at 8s |

---

## Domain Presets (`lib/nicola-domain-presets.ts`)

Pre-baked NicolaBlocks (subject + wardrobe come from `actor-library.ts`):

- `jewelry_hero_macro` — moissanite stone, halo, macro 100mm
- `jewelry_lifestyle_model` — model wearing chain, golden hour, 85mm
- `sneaker_drop_macro` — toe-box macro, electric pulse
- `sneaker_street_lifestyle` — Tel Aviv golden-hour, 35mm
- `flight_passport_macro` — passport flatlay, macro
- `personal_ad_talking_head` — founder close-up, soft key, 85mm
- `personal_ad_authority_wide` — desk wide, dramatic rim, 35mm

---

## Source Files in Memory

- `~/.claude/projects/-Users-macbookpro/memory/reference_nicola_prompt_recipe.md`
- `~/.claude/projects/-Users-macbookpro/memory/reference_nicola_prompt_lexicon.md`
- `~/.claude/projects/-Users-macbookpro/memory/reference_nicola_tool_stack_methodology.md`
- `~/.claude/projects/-Users-macbookpro/memory/reference_nicola_applied_to_montier_projects.md`
- `~/.claude/projects/-Users-macbookpro/memory/feedback_image_video_prompt_standard.md`

Scribd source PDFs: 980313463 (Nicola 5-page), 1024955686 (theabhisheik 6-page EXTENDED), 911763924 (25-page Cinematic Ad Concepts), 792360488 (Runway 8-block).
