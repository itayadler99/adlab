// Verbatim Nicola VEO 3.1 brand JSON presets — distilled from the 25-page
// "Cinematic Ad Concepts for Brands" pack (Nutella/Tesla/Apple/Dior/Gucci/
// Ferrari/Prime/Yeezy/IKEA/LV pattern + Montier/Sneaker Station/FlyPro
// Israel-adapted variants).
//
// Pattern: box-eclipse / capsule-burst / hero-orbit reveal. Each preset is a
// VeoTemplate; pipe through buildVeoJson() for the canonical 8s / brand_safe
// envelope.

import type { VeoTemplate } from "./nicola-prompt";

export type BrandPresetKey =
  | "montier_box_burst"
  | "montier_chain_orbit"
  | "sneaker_station_eclipse"
  | "flypro_passport_capsule"
  | "generic_luxury_velvet"
  | "generic_tech_minimal";

export const VEO_BRAND_PRESETS: Record<BrandPresetKey, VeoTemplate> = {
  // 1. Montier jewelry box burst — direct adaptation of the Yeezy/IKEA eclipse pattern.
  montier_box_burst: {
    brand: "Montier",
    brandValues: ["craft", "warmth", "premium"],
    concept: "Sealed Montier velvet jewelry box wiggles then bursts open in a soft golden shimmer releasing a moissanite cuban chain that levitates and rotates",
    description:
      "Photorealistic cinematic shot of an empty matte-black studio. A sealed Montier-branded velvet jewelry box with embossed gold logo sits center. It wiggles, then bursts open in a soft golden shimmer releasing a Montier Moissanite Cuban Chain that levitates and rotates slowly. No text.",
    colors: ["champagne", "ivory", "deep onyx"],
    materials: ["velvet", "polished marble"],
    environment: "matte black studio with subtle fog and polished black floor",
    setting: "marble pedestal in soft studio light",
    subject: "Montier velvet jewelry box releasing moissanite cuban chain",
    beats: [
      "00-02s: velvet box settles on marble, gold logo glints under halo light",
      "02-05s: lid bursts open with gold shimmer, chain levitates upward",
      "05-08s: cuban chain locks into slow hero orbit, every facet catching halo light",
    ],
    accentColor: "warm champagne gold",
    motion: "box wiggles, lid pops with golden shimmer burst, chain glides upward into hero rotation",
    mood: "warm champagne",
    niche: "jewelry",
  },

  // 2. Montier chain orbit — pure hero-rotation, no box. Use for product close-ups.
  montier_chain_orbit: {
    brand: "Montier",
    brandValues: ["craft", "warmth", "premium"],
    concept: "Moissanite tennis chain levitates in a void, rotating slowly while halo light traces every facet",
    description:
      "Photorealistic cinematic macro shot of a Montier moissanite tennis chain levitating in a matte black void. The chain rotates slowly, every facet catching a soft halo spotlight, faint volumetric beams cutting through subtle fog. No text.",
    colors: ["champagne", "ivory", "deep onyx"],
    materials: ["moissanite", "polished platinum"],
    environment: "matte black void with subtle volumetric fog",
    setting: "levitating product in negative space",
    subject: "Montier moissanite tennis chain",
    beats: [
      "00-02s: chain hovers center, halo light traces facets",
      "02-05s: slow 180° orbit, micro-particles drift through beam",
      "05-08s: chain holds final hero angle, every stone glowing",
    ],
    accentColor: "platinum white",
    motion: "slow continuous hero orbit, no cuts",
    mood: "cinematic luxury",
    niche: "jewelry",
  },

  // 3. Sneaker Station wordmark eclipse — Yeezy template, brand-swapped.
  sneaker_station_eclipse: {
    brand: "Sneaker Station",
    brandValues: ["hype", "drop culture", "exclusive"],
    concept: "Sneaker Station wordmark eclipses a glowing halo, cracks open, releases the featured sneaker levitating forward in a cinematic void",
    description:
      "Photorealistic cinematic shot of a dark endless void with halo spotlight and subtle fog. The SNEAKER STATION wordmark floats mid-air backlit by a glowing circular halo, rotates slowly creating an eclipse effect, then cracks open at center releasing a beam of white light from which the featured sneaker levitates forward, rotating slightly as camera cranes back for wide hero shot. No text.",
    colors: ["matte black", "white glow", "electric blue"],
    materials: ["matte surface", "neon glass"],
    environment: "dark endless void with halo spotlight and subtle fog",
    setting: "studio void with mist and glowing halo light",
    subject: "Sneaker Station wordmark eclipsing halo then revealing levitating sneaker",
    beats: [
      "00-02s: wordmark floats mid-air, backlit by halo, camera pushes in slowly",
      "02-05s: wordmark rotates slowly, blocks and reveals halo like an eclipse, soft fog and electric pulses ripple",
      "05-08s: text cracks open at center, beam releases featured sneaker which levitates forward as camera cranes back",
    ],
    accentColor: "electric blue",
    motion: "wordmark eclipse rotation → crack → sneaker emerge → crane back to hero wide",
    mood: "dark electronic minimal",
    niche: "sneakers",
  },

  // 4. FlyPro passport capsule burst — Bangkok diorama, swap destination per ad.
  flypro_passport_capsule: {
    brand: "FlyPro",
    brandValues: ["adventure", "discovery", "Israeli wanderlust"],
    concept: "Israeli passport bursts open releasing a miniature destination diorama (Bangkok skyline, golden Buddha, tuk-tuk, palm trees)",
    description:
      "Photorealistic cinematic shot of an empty white travel hall with soft daylight. A blue Israeli passport stamped with destination ink wiggles in the center, then bursts open with a paper-shimmer burst. From inside, destination items fly out and snap into place forming a mini Bangkok skyline diorama: golden Buddha, tuk-tuk, palm trees, street food cart, neon signs. No text.",
    colors: ["sun gold", "passport navy", "sky white"],
    materials: ["paper", "miniature metal"],
    environment: "white travel hall with soft daylight and warm golden accents",
    setting: "fixed wide angle for symmetrical reveal",
    subject: "Israeli passport releasing miniature destination diorama",
    beats: [
      "00-02s: passport wiggles center, ink stamps glint",
      "02-05s: passport flips open, items burst out in paper-shimmer puff and bounce",
      "05-08s: items snap into diorama precisely, completed scene glows in warm light",
    ],
    accentColor: "warm sun gold",
    motion: "passport flip → paper-shimmer burst → items bounce → snap into diorama → passport slides off-screen",
    mood: "warm travel ASMR",
    niche: "travel",
  },

  // 5. Generic luxury velvet — fallback for any premium product (skincare, watches, decor).
  generic_luxury_velvet: {
    brand: "Generic Luxury",
    brandValues: ["craft", "heritage", "premium"],
    concept: "Velvet display box opens revealing levitating product against a soft halo void",
    description:
      "Photorealistic cinematic shot of a velvet display box on polished marble. The box opens with a soft gold shimmer, revealing the featured product which levitates and rotates slowly under a halo spotlight. Subtle fog drifts through volumetric beams. No text.",
    colors: ["champagne", "ivory", "deep onyx"],
    materials: ["velvet", "polished marble"],
    environment: "minimalist marble showroom with subtle fog",
    setting: "marble pedestal in soft studio light",
    subject: "luxury display box revealing levitating featured product",
    beats: [
      "00-02s: box settles on marble, halo light pours over surface",
      "02-05s: lid opens with gold shimmer, product levitates upward",
      "05-08s: product holds hero orbit, halo light traces every detail",
    ],
    accentColor: "warm champagne gold",
    motion: "box wiggle, lid pop, product emerge, slow hero orbit",
    mood: "warm champagne",
    niche: "luxury",
  },

  // 6. Generic tech minimal — Apple/Tesla aesthetic for SaaS/hardware/electronics.
  generic_tech_minimal: {
    brand: "Generic Tech",
    brandValues: ["precision", "innovation", "clarity"],
    concept: "Featured device materializes from particle assembly in a clean white void, rotates into hero pose",
    description:
      "Photorealistic cinematic shot of a clean white infinity-void. Geometric particles converge from off-frame, assembling into the featured device which rotates slowly into a perfect hero pose. Soft diffused key light, ultra-crisp reflections on glass and metal surfaces. No text.",
    colors: ["pure white", "matte silver", "cool blue accent"],
    materials: ["aluminium", "tempered glass"],
    environment: "clean white infinity-void",
    setting: "negative-space product showcase",
    subject: "tech device materializing from particle convergence",
    beats: [
      "00-02s: particles drift in from off-frame",
      "02-05s: particles converge and resolve into device with subtle shimmer",
      "05-08s: device locks into hero pose, slow camera orbit, accent light glints",
    ],
    accentColor: "cool electric blue",
    motion: "particle assembly → device resolve → hero orbit",
    mood: "cool minimal premium",
    niche: "tech",
  },
};

export function getVeoBrandPreset(key: BrandPresetKey): VeoTemplate {
  return VEO_BRAND_PRESETS[key];
}

export function listVeoBrandPresets(): { key: BrandPresetKey; brand: string; niche: string }[] {
  return Object.entries(VEO_BRAND_PRESETS).map(([key, t]) => ({
    key: key as BrandPresetKey,
    brand: t.brand,
    niche: t.niche,
  }));
}
