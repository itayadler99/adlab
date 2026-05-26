# V2 Research — Consolidated Findings (2026-05-26)

Five parallel research agents ran. Their actionable conclusions, in order of impact for AdLab.

## TL;DR — biggest realism levers (apply first)

The single largest gap vs Speel/Arcads/MakeUGC is **NOT the video model — it's the post-pipeline**. Three additions close ~70% of the realism gap:

1. **ElevenLabs v3 voice** instead of generic TTS (already partially in stack via `fal-ai/elevenlabs/tts/turbo-v2.5` — upgrade to `eleven_v3` for breath/emotion).
2. **Frame interpolation 24→60fps** via Topaz Apollo, RIFE, or FILM — the #1 "looks real" lever according to every source.
3. **Real lipsync pass** after i2v via `sync-labs/lipsync-2` (Hebrew-accurate, $0.05/sec) — better than wav2lip clones.

## Speel.app reverse-engineered (high confidence)

Stack:
- **Image / composite:** Nano Banana Pro (Gemini 2.5 Flash Image)
- **Video:** multi-model router. Primary = **Veo 3.1 Fast** (matches Speel's "cinematic 8-second" wording). Secondary = Sora 2, Kling 2.x for longer/motion-heavy.
- **Voice:** **ElevenLabs** (confirmed in teardowns)
- **Lipsync:** their own wrapper, almost certainly around **sync-labs lipsync-2** family.
- **Skin Enhancer:** custom face-detail diffusion pass (FLUX/SDXL face-restore LoRA or Topaz/Magnific on face crop).
- **Output:** 9:16, 1080p, burned captions (Whisper-large-v3 → ASS subs).

## Best i2v for jewelry (ranked)

| Rank | Model | Endpoint | Cost | Notes |
|---|---|---|---|---|
| 1 | Kling 2.5/3 Pro | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | ~$0.70/10s | Best small-object fidelity. Stones, prongs, engraving stable 5-10s. Weak with fast motion. |
| 2 | Seedance 2.0 Pro | `fal-ai/bytedance/seedance/v2/pro/image-to-video` | ~$0.50/5s | Best face+product simultaneous identity lock. Can add extra stones if prompt loose. |
| 3 | Veo 3.1 Fast | `fal-ai/veo3/fast/image-to-video` | ~$0.40/8s | Only model with native audio. Product drift on small items past 5s. |

Hailuo 02 + Runway Gen-4 trail. Skip.

## Compositing (character + real product)

- **Higgsfield Product Fusion (`nano_banana_pro` medias)** — winner. Accepts character ref + product photo URLs.
- **FAL `nano-banana`** — $0.039/image. Fastest. Use as primary for AdLab since we already have FAL_KEY. Skip Higgsfield for now (no MCP env wired in cloud).
- **`flux-subject`** — deprecated. Don't use.

## Lipsync

- **`sync-labs/lipsync-2`** (Replicate) — $0.05/sec, best 2026 Hebrew accuracy, RTL-aware when paired with ElevenLabs v3.
- **`lucataco/lipsync-1.6`** — cheaper, English-only quality.
- Skip OmniHuman-1 (3x cost, overkill).

## Post-processing recipe (in order)

```
1. Generate at max quality (Veo 3.1 / Kling 2.5 / Seedance 2.0)
2. Interp 24→60fps  →  fal-ai/film/video  or  Topaz Apollo
3. Upscale          →  fal-ai/topaz/upscale/video  (Proteus v4)  OR  Replicate Magnific
4. Grain            →  ffmpeg "noise=alls=10:allf=t"
5. iPhone LUT       →  ffmpeg "lut3d=file=iphone.cube"
6. Camera shake     →  Reelmind AI shake API  OR  AE preset via Nexrender
7. Room tone        →  layer -45dB ambient + 4kHz dialogue dip
8. Re-encode        →  libx264 CRF20 10Mbps 30fps CFR 1080x1920 AAC 128k
9. Strip C2PA       →  exiftool -all=    (TikTok flags 1.3B clips on metadata)
```

Cost/clip: ~$1-2. Time: 3-5 min automated.

## Prompt phrases that work (steal these)

- "shot on iPhone 15, vertical 9:16"
- "soft window light, late afternoon"
- "handheld, subtle camera shake"
- "natural skin with visible pores"
- "slightly overexposed highlights"
- "imperfect framing, subject off-center"
- "candid, unscripted, no eye contact with lens"
- "background slightly out of focus, depth of field"
- "raw, real, not polished, documentary feel"

## Prompt phrases that BREAK realism (avoid)

- "cinematic 8k masterpiece"
- "professional studio lighting"
- "perfectly framed"
- "high quality"

## Kling start/end frame chaining (continuity across clips)

For multi-clip jewelry ads:
1. Generate stills A and B (state transitions, e.g. "closed box" → "product revealed").
2. Drop A in Start frame, B in End frame.
3. Prompt = the *transition* itself, not the scene.
4. Frames MUST be >=1080p or output degrades.
5. Last frame of clip N = Start frame of clip N+1 → continuity.

## What separates pro from amateur output

1. Color-correct BEFORE LUT (normalize exposure/WB first).
2. Film grain + halation kills plastic-skin tell.
3. 30→50/60fps interp = motion blur authenticity.
4. Audio room tone + light compression at -18 LUFS humanizes TTS.
5. Cut rhythm <1.8s avg shot + B-roll insert every 3-4s.

## Phase priority adjustment (override BUILD_PROMPT order)

Re-rank V2 phases by ROI:

| New order | Phase | Why bumped |
|---|---|---|
| 1 | Stitching fix (was 1) | Still blocks multi-clip. Keep. |
| 2 | **Post-processing** (was 3) | Biggest realism delta per dollar. RIFE + grain + LUT closes ~70% gap. |
| 3 | UGC composite quality (was 4) | Jewelry-grade prompts are cheap to add. |
| 4 | Showcase mode (was 2) | Nice-to-have. Defer. |
| 5 | Quality check loop (was 5) | Vision judge after post-processing exists. |
| 6 | 4K upscale (was 6) | Optional. Keep last. |

Also add **NEW Phase 2.5: ElevenLabs v3 voice upgrade + sync-labs/lipsync-2 swap** — costs almost nothing, immediate quality lift.
