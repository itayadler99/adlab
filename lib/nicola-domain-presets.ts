// Domain-specific NicolaBlocks presets — copy-paste-ready shared blocks
// per Itay-project. Pair with actor-library for full prompt assembly:
//
//   const blocks = { ...JEWELRY_HERO_BLOCKS, subject: actor.subject,
//                    wardrobe: actor.wardrobe };
//   const prompt = buildNicolaPrompt(blocks);
//
// Each preset is verified against the 14-block density + dual-tone + lens
// + DoF + atmosphere rules so quality-gate passes by default.

import type { NicolaBlocks } from "./nicola-prompt";

export type DomainPresetKey =
  | "jewelry_hero_macro"
  | "jewelry_lifestyle_model"
  | "sneaker_drop_macro"
  | "sneaker_street_lifestyle"
  | "flight_passport_macro"
  | "personal_ad_talking_head"
  | "personal_ad_authority_wide";

// Shared blocks omit subject + wardrobe (filled by actor-library) so a single
// preset works across many actors.
type SharedPreset = Omit<NicolaBlocks, "subject" | "wardrobe">;

export const DOMAIN_PRESETS: Record<DomainPresetKey, SharedPreset> = {
  // Jewelry — macro hero of moissanite stone with halo + fog.
  jewelry_hero_macro: {
    aspect: "9:16",
    shot: "extreme macro close-up",
    cameraPosition: "lens hovering 8cm above the centered stone",
    frameEdges: "polished black setting rim cropping all four edges",
    atmosphere:
      "fine moissanite dust particles drifting through halo beam, micro-condensation on cool metal, soft fog at floor level, light refractions sparkling across facets, sub-surface stone glow",
    lighting: "halo spotlight",
    dualTone: "warm champagne rim with cool platinum reflections",
    lens: "macro 100mm",
    depthOfField: "razor-thin depth of field, dreamy bokeh on background facets",
    genreTag: "luxury jewelry editorial, no text.",
  },

  // Jewelry — model lifestyle wearing the chain, soft daylight.
  jewelry_lifestyle_model: {
    aspect: "9:16",
    shot: "cinematic close-up",
    cameraPosition: "camera tilted up toward the collarbone, chain dominating lower third",
    frameEdges: "soft hair strands cropping the top, silk fabric cropping the bottom",
    atmosphere:
      "natural skin pores catching window light, faint perfume mist, fabric fibers, micro-condensation on chain links, soft dust motes in side light, golden-hour bloom",
    lighting: "golden-hour sunlight cutting across",
    dualTone: "warm golden cheek light with cool blue silk shadow",
    lens: "85mm f/1.4",
    depthOfField: "shallow depth of field, dreamy bokeh on background",
    genreTag: "cinematic editorial fashion, no text.",
  },

  // Sneakers — macro product on void backdrop, halo + electric pulse.
  sneaker_drop_macro: {
    aspect: "9:16",
    shot: "extreme macro close-up",
    cameraPosition: "low angle pushing in from the toe-box",
    frameEdges: "outsole tread cropping the bottom, halo beam cropping the top",
    atmosphere:
      "fine dust drifting through halo beam, subtle smoke pooling at heel, micro-scuffs on rubber, electric pulse sparks, soft volumetric fog, light reflections on glossy lace tips",
    lighting: "halo spotlight",
    dualTone: "warm rim glow with cool electric-blue accent",
    lens: "50mm",
    depthOfField: "shallow depth of field with rich bokeh on void",
    genreTag: "drop-culture product hero, no text.",
  },

  // Sneakers — street lifestyle, golden-hour Tel Aviv backdrop.
  sneaker_street_lifestyle: {
    aspect: "9:16",
    shot: "medium close-up",
    cameraPosition: "camera at hip height tracking forward with the walker",
    frameEdges: "denim cropping the top, sidewalk grain cropping the bottom",
    atmosphere:
      "road dust kicking up, golden-hour sunbeams, palm shadow stripes, sneaker leather creases, fine grit on rubber outsole, faint heat shimmer",
    lighting: "golden-hour sunlight cutting across",
    dualTone: "warm sunset rim with cool concrete shadow",
    lens: "35mm",
    depthOfField: "shallow depth of field, palm trees melting into bokeh",
    genreTag: "street editorial sneakers, no text.",
  },

  // Flight ads — passport + boarding pass macro for FlyPro.
  flight_passport_macro: {
    aspect: "9:16",
    shot: "extreme macro close-up",
    cameraPosition: "top-down lens hovering 12cm above the passport",
    frameEdges: "passport gold emblem cropping the top, boarding-pass edge cropping the bottom",
    atmosphere:
      "paper fibers catching diffuse light, faint dust particles, micro-creases on visa stamps, ink texture, subtle steam from coffee cup off-frame, soft cabin-window glow",
    lighting: "soft diffused key light",
    dualTone: "warm cabin-yellow with cool airport-blue accent",
    lens: "macro 100mm",
    depthOfField: "razor-thin focus on the destination stamp",
    genreTag: "travel editorial flatlay, no text.",
  },

  // AdLab personal ad — founder talking-head, studio.
  personal_ad_talking_head: {
    aspect: "9:16",
    shot: "cinematic close-up",
    cameraPosition: "lens at eye level, slight 5° downward tilt",
    frameEdges: "shoulder cropping the bottom, hair cropping the top",
    atmosphere:
      "soft skin highlights, micro-pore detail, faint dust motes in key beam, subtle breath warmth, gentle background bokeh sparkle, light fabric texture on shirt",
    lighting: "soft diffused key light",
    dualTone: "warm key with cool blue rim from background monitor",
    lens: "85mm f/1.4",
    depthOfField: "shallow depth of field, rich bokeh",
    genreTag: "cinematic founder editorial, no text.",
  },

  // AdLab personal ad — wide authority shot (founder at desk / studio).
  personal_ad_authority_wide: {
    aspect: "9:16",
    shot: "hero wide",
    cameraPosition: "low wide angle pushing slowly forward",
    frameEdges: "desk edge cropping the bottom, ceiling beam cropping the top",
    atmosphere:
      "dust particles in key beam, soft fabric texture on chair, subtle paper sheen on desk, faint condensation on glass, lens flare from window, warm wood grain",
    lighting: "dramatic stadium lighting with warm sunset rim",
    dualTone: "warm window-light with cool tungsten shadow",
    lens: "35mm",
    depthOfField: "deep depth of field, environment in focus",
    genreTag: "cinematic authority editorial, no text.",
  },
};

export function getDomainPreset(key: DomainPresetKey): SharedPreset {
  return DOMAIN_PRESETS[key];
}

export function listDomainPresets(): DomainPresetKey[] {
  return Object.keys(DOMAIN_PRESETS) as DomainPresetKey[];
}
