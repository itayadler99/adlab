// arcads.ai-style actor library — Israeli-first demographics.
//
// Pre-defined personas the user can pick from instead of free-typing a
// demographic each render. Each persona maps to a Nicola-grade subject block
// + default Higgsfield Soul preset + voice archetype for ElevenLabs.
//
// Filter by vibe/age/gender/region in the UI; render call passes the slug to
// the prompt builder which expands to the full subject/wardrobe blocks.

import type { VoiceArchetype } from "./ugc-prompts";

export type Vibe = "founder" | "hype" | "warm" | "street" | "luxury" | "geek" | "athlete";
export type Region = "TLV" | "JLM" | "Negev" | "North" | "diaspora";

export interface Actor {
  slug: string;
  displayName: string;
  subject: string;          // Nicola block 4 (concrete role)
  wardrobe: string;         // Nicola block 5
  voiceArchetype: VoiceArchetype;
  /** Higgsfield Soul preset id (set when we pre-generate the character). */
  soulId?: string;
  vibe: Vibe;
  region: Region;
  ageRange: [number, number];
  gender: "m" | "f" | "nb";
  language: ("he" | "en" | "ar" | "ru")[];
  tags: string[];
}

export const ACTORS: Actor[] = [
  {
    slug: "tlv_tech_bro",
    displayName: "Yoav — TLV tech founder",
    subject: "Israeli male tech founder, 32, short dark beard, sun-tanned skin",
    wardrobe: "plain charcoal t-shirt, AirPods Pro in hand, Apple Watch",
    voiceArchetype: "founder_male",
    vibe: "founder",
    region: "TLV",
    ageRange: [30, 38],
    gender: "m",
    language: ["he", "en"],
    tags: ["saas", "b2b", "podcast", "linkedin"],
  },
  {
    slug: "tlv_yoga_mom",
    displayName: "Noa — north-TLV mom",
    subject: "Israeli mother, 34, long wavy hair, light freckles, calm half-smile",
    wardrobe: "oversized cream linen shirt, dainty gold necklace",
    voiceArchetype: "mom_warm",
    vibe: "warm",
    region: "TLV",
    ageRange: [30, 40],
    gender: "f",
    language: ["he", "en"],
    tags: ["jewelry", "wellness", "beauty", "kids"],
  },
  {
    slug: "ramat_gan_genz",
    displayName: "Liel — Ramat Gan Gen-Z",
    subject: "Israeli woman, 22, dark wavy hair, hoop earrings, glossy lip",
    wardrobe: "cropped baby tee, vintage Levi's",
    voiceArchetype: "young_woman_excited",
    vibe: "hype",
    region: "TLV",
    ageRange: [20, 26],
    gender: "f",
    language: ["he"],
    tags: ["fashion", "beauty", "yapping", "tiktok"],
  },
  {
    slug: "mizrahi_dad",
    displayName: "Eli — Bat Yam dad",
    subject: "Mizrahi Israeli man, 42, salt-and-pepper buzz cut, warm eyes, crow's-feet",
    wardrobe: "navy polo shirt, simple silver chain",
    voiceArchetype: "young_man_casual",
    vibe: "warm",
    region: "TLV",
    ageRange: [38, 48],
    gender: "m",
    language: ["he"],
    tags: ["family", "home", "tools", "auto"],
  },
  {
    slug: "russian_student",
    displayName: "Sasha — Russian-Israeli student",
    subject: "Russian-Israeli woman, 24, light blonde hair, sharp cheekbones, pale skin",
    wardrobe: "oversized hoodie, minimalist gold studs",
    voiceArchetype: "young_woman_chill",
    vibe: "geek",
    region: "TLV",
    ageRange: [22, 28],
    gender: "f",
    language: ["he", "ru", "en"],
    tags: ["edtech", "books", "study", "self-improvement"],
  },
  {
    slug: "negev_guide",
    displayName: "Adam — Negev guide",
    subject: "Israeli outdoor guide, 35, weathered tan, stubble, sun-bleached short hair",
    wardrobe: "faded khaki shirt, leather wristband, ranger cap clipped to belt",
    voiceArchetype: "young_man_hype",
    vibe: "athlete",
    region: "Negev",
    ageRange: [30, 42],
    gender: "m",
    language: ["he", "en"],
    tags: ["outdoor", "hiking", "supplements", "gear"],
  },
  {
    slug: "jlm_orthodox_mom",
    displayName: "Sara — JLM mom",
    subject: "Jerusalem religious mother, 36, soft head covering, calm gentle smile",
    wardrobe: "long-sleeve modest blouse, no jewelry except wedding band",
    voiceArchetype: "mom_warm",
    vibe: "warm",
    region: "JLM",
    ageRange: [32, 44],
    gender: "f",
    language: ["he"],
    tags: ["kosher", "family", "kitchen", "modest"],
  },
  {
    slug: "luxury_jewelry_model",
    displayName: "Maya — luxury jewelry model",
    subject: "Israeli woman, 28, sleek dark center-part hair, sculpted collarbones",
    wardrobe: "black silk slip top, one statement moissanite cuban chain",
    voiceArchetype: "founder_female",
    vibe: "luxury",
    region: "TLV",
    ageRange: [25, 32],
    gender: "f",
    language: ["he", "en"],
    tags: ["jewelry", "luxury", "moissanite", "editorial"],
  },
  {
    slug: "sneakerhead_male",
    displayName: "Tom — sneakerhead",
    subject: "Israeli man, 26, dark fade haircut, gold cuban chain, lip stud",
    wardrobe: "vintage Nike hoodie, fresh white Air Max box in lap",
    voiceArchetype: "rapper_male",
    vibe: "street",
    region: "TLV",
    ageRange: [22, 30],
    gender: "m",
    language: ["he", "en"],
    tags: ["sneakers", "streetwear", "hiphop", "drops"],
  },
  {
    slug: "british_polished_female",
    displayName: "Emma — British polish",
    subject: "British woman, 30, sleek brown bob, neutral makeup, sharp jawline",
    wardrobe: "cream cashmere turtleneck, subtle gold huggies",
    voiceArchetype: "british_female",
    vibe: "luxury",
    region: "diaspora",
    ageRange: [28, 36],
    gender: "f",
    language: ["en"],
    tags: ["luxury", "skincare", "saas", "uk"],
  },
];

export function getActor(slug: string): Actor | undefined {
  return ACTORS.find((a) => a.slug === slug);
}

export interface ActorFilter {
  vibe?: Vibe;
  region?: Region;
  gender?: Actor["gender"];
  language?: "he" | "en" | "ar" | "ru";
  tag?: string;
}

export function filterActors(f: ActorFilter): Actor[] {
  return ACTORS.filter((a) => {
    if (f.vibe && a.vibe !== f.vibe) return false;
    if (f.region && a.region !== f.region) return false;
    if (f.gender && a.gender !== f.gender) return false;
    if (f.language && !a.language.includes(f.language)) return false;
    if (f.tag && !a.tags.includes(f.tag)) return false;
    return true;
  });
}
