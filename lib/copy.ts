// Hebrew ad-copy rules (Itay's house style), centralized so the launch route,
// the Klaviyo email, and the headline endpoint all enforce the same thing:
//   - no em-dashes / en-dashes (— –) and no hyphen used as a sentence dash
//   - no specific dates — only generic time pressure ("רק היום", "מלאי אחרון")
//   - clean Hebrew, no English words mixed into a Hebrew sentence
//
// sanitizeHebrew() repairs what it safely can (dashes). validateHebrew()
// reports issues it should NOT silently rewrite (dates, English), so a caller
// can warn or regenerate rather than ship bad copy.

const DASH_RE = /\s*[—–]\s*|\s+-\s+/g;

/** Replace em/en/sentence dashes with a comma and collapse whitespace. */
export function sanitizeHebrew(s: string): string {
  if (!s) return "";
  return s.replace(DASH_RE, ", ").replace(/\s{2,}/g, " ").trim();
}

const MONTHS_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

// A run of Latin letters inside otherwise-Hebrew copy (3+ chars to avoid
// flagging units/sizes like "S" or "ml"). Brand names are unavoidable, so the
// caller treats this as a warning, not a hard failure.
const ENGLISH_WORD_RE = /[A-Za-z]{3,}/;
const HEBREW_RE = /[֐-׿]/;
const SPECIFIC_DATE_RE = new RegExp(
  `\\b\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?\\b|\\b\\d{4}\\b|(${MONTHS_HE.join("|")})`
);

export interface CopyIssues {
  hasDash: boolean;
  hasSpecificDate: boolean;
  hasEnglishInHebrew: boolean;
  warnings: string[];
}

export function validateHebrew(s: string): CopyIssues {
  const warnings: string[] = [];
  const hasDash = /[—–]|\s-\s/.test(s);
  if (hasDash) warnings.push("contains a dash — use a comma instead");
  const hasSpecificDate = SPECIFIC_DATE_RE.test(s);
  if (hasSpecificDate) warnings.push("contains a specific date — use generic time pressure");
  const isHebrew = HEBREW_RE.test(s);
  const hasEnglishInHebrew = isHebrew && ENGLISH_WORD_RE.test(s);
  if (hasEnglishInHebrew) warnings.push("mixes English words into Hebrew copy");
  return { hasDash, hasSpecificDate, hasEnglishInHebrew, warnings };
}

/** Convenience: sanitize then validate the result. */
export function cleanAndCheck(s: string): { text: string; issues: CopyIssues } {
  const text = sanitizeHebrew(s);
  return { text, issues: validateHebrew(text) };
}
