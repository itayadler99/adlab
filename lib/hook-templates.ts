// Hook templates — arcads-style library tagged by niche.
//
// Each hook is a first-3-seconds opener proven to slow the scroll. They're
// the single highest-leverage piece of a UGC ad and are reusable across
// products inside the same niche. Pick by niche+style; the LLM headline
// generator then fills the rest of the script.
//
// Hebrew-first: every hook ships in HE; an `en` field exists when an
// English direct translation actually fires (most do).

export type HookNiche =
  | "jewelry"
  | "sneakers"
  | "fashion"
  | "skincare"
  | "saas"
  | "food"
  | "supplements"
  | "kids"
  | "home";

export type HookStyle =
  | "shock"           // "I can't believe…"
  | "controversial"   // "Stop doing X"
  | "demo"            // "Watch this happen"
  | "secret"          // "Nobody talks about…"
  | "result"          // "After 30 days…"
  | "objection"       // "You think it's expensive but…"
  | "question";       // "Why does X always…?"

export interface Hook {
  id: string;
  niches: HookNiche[];
  style: HookStyle;
  he: string;
  en?: string;
  /** Optional voice archetype best-fit. */
  bestVoice?: string;
}

export const HOOKS: Hook[] = [
  // jewelry
  {
    id: "jw_secret_moissanite",
    niches: ["jewelry"],
    style: "secret",
    he: "אף אחד לא יזהה שזו לא יהלום אמיתי.",
    en: "Nobody can tell this isn't a real diamond.",
    bestVoice: "founder_female",
  },
  {
    id: "jw_objection_price",
    niches: ["jewelry"],
    style: "objection",
    he: "חשבתי שאני צריכה לשלם 30 אלף שקל בשביל ככה.",
    en: "I thought I had to pay $8K for this look.",
  },
  {
    id: "jw_demo_sparkle",
    niches: ["jewelry"],
    style: "demo",
    he: "תראו את הניצוץ הזה לאור שמש אמיתי.",
    en: "Watch this sparkle in real sunlight.",
  },
  // sneakers
  {
    id: "sn_drop_alert",
    niches: ["sneakers"],
    style: "shock",
    he: "הזוג הזה הולך להיגמר תוך 48 שעות.",
    en: "These will be sold out in 48 hours.",
    bestVoice: "rapper_male",
  },
  {
    id: "sn_sizeup_tip",
    niches: ["sneakers"],
    style: "secret",
    he: "תיקח מידה אחת גדולה. תאמין לי.",
    en: "Go one size up. Trust me.",
  },
  // fashion
  {
    id: "fa_outfit_repeat",
    niches: ["fashion"],
    style: "controversial",
    he: "תפסיקי לקנות בגדים. תרכיבי קומבינציות.",
    en: "Stop buying clothes. Start combining.",
  },
  // skincare
  {
    id: "sk_30day_result",
    niches: ["skincare"],
    style: "result",
    he: "אחרי 30 ימים — תראו את ההבדל.",
    en: "After 30 days — look at the difference.",
  },
  {
    id: "sk_dermatologist_secret",
    niches: ["skincare"],
    style: "secret",
    he: "הרופאת עור שלי הראתה לי את זה.",
    en: "My dermatologist showed me this.",
  },
  // saas
  {
    id: "sa_replaced_team",
    niches: ["saas"],
    style: "shock",
    he: "החלפתי שלושה אנשים בצוות עם הכלי הזה.",
    en: "I replaced 3 people on my team with this tool.",
    bestVoice: "founder_male",
  },
  {
    id: "sa_save_hours",
    niches: ["saas"],
    style: "demo",
    he: "תראו איך זה עושה ב-30 שניות מה שלקח לי שעה.",
    en: "Watch this do in 30s what took me an hour.",
  },
  // food
  {
    id: "fd_one_pan",
    niches: ["food"],
    style: "demo",
    he: "ארוחת ערב במחבת אחת. בלי לשטוף כלום.",
    en: "Dinner in one pan. Zero dishes.",
  },
  // supplements
  {
    id: "sp_energy_switch",
    niches: ["supplements"],
    style: "result",
    he: "שבוע אחרי שהתחלתי — קמתי בלי קפה.",
    en: "One week in — woke up without coffee.",
  },
  // kids
  {
    id: "kd_calm_in_5",
    niches: ["kids"],
    style: "secret",
    he: "התרגיל הזה מרגיע ילד תוך חמש דקות.",
    en: "This trick calms a kid in 5 minutes.",
  },
  // home
  {
    id: "hm_clean_grout",
    niches: ["home"],
    style: "demo",
    he: "ככה ניקיתי שנים של לכלוך מהמרצפות.",
    en: "This is how I cleaned years of grime from my tiles.",
  },
];

export interface HookFilter {
  niche?: HookNiche;
  style?: HookStyle;
  language?: "he" | "en";
}

export function filterHooks(f: HookFilter): Hook[] {
  return HOOKS.filter((h) => {
    if (f.niche && !h.niches.includes(f.niche)) return false;
    if (f.style && h.style !== f.style) return false;
    if (f.language === "en" && !h.en) return false;
    return true;
  });
}

export function getHook(id: string): Hook | undefined {
  return HOOKS.find((h) => h.id === id);
}
