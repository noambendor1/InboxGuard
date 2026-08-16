import type { Finding } from "../../types/models.js";

export const CONTENT_CATEGORY_MAX = 20;

/**
 * Deterministic keyword-group rules. A single weak keyword (e.g. "urgent")
 * is intentionally worth very little on its own. Real signal comes from
 * *combinations* of groups (e.g. urgency + credential request + threat),
 * which is why a combination bonus only unlocks once two or more distinct
 * groups match. This keeps a normal "urgent: Q3 numbers" business email out
 * of HIGH RISK while still catching classic phishing templates.
 */
// Phrases are intentionally bilingual (English + Hebrew): a rule engine that
// only recognizes English pressure tactics is blind to phishing/scam email
// written in any other language, which is a real gap, not a hypothetical one.
const KEYWORD_GROUPS: Record<string, string[]> = {
  credential: [
    "verify your password",
    "confirm your password",
    "enter your password",
    "your login",
    "verify your account",
    "confirm your account",
    "account has been suspended",
    "account will be suspended",
    "reactivate your account",
    "unusual sign-in activity",
    "security alert",
    "confirm your identity",
    // Hebrew
    "אמת את הסיסמה",
    "אימות סיסמה",
    "אמת את החשבון",
    "אימות חשבון",
    "החשבון הושעה",
    "החשבון ננעל",
    "כניסה חריגה",
    "התראת אבטחה",
    "אמת את הזהות"
  ],
  urgency: [
    "urgent",
    "immediately",
    "right away",
    "act now",
    "as soon as possible",
    "final notice",
    "within 24 hours",
    "your account will be closed",
    "action required",
    // Hebrew
    "דחוף",
    "באופן מיידי",
    "מיידי",
    "בהקדם האפשרי",
    "התראה סופית",
    "תוך 24 שעות",
    "נדרשת פעולה"
  ],
  payment: [
    "wire transfer",
    "gift card",
    "gift cards",
    "bitcoin",
    "cryptocurrency",
    "crypto payment",
    "bank account details",
    "routing number",
    "payment overdue",
    "unpaid invoice",
    "purchase gift cards",
    // Hebrew
    "העברה בנקאית",
    "כרטיס מתנה",
    "ביטקוין",
    "מטבע קריפטוגרפי",
    "פרטי חשבון בנק",
    "חוב",
    "תשלום באיחור",
    "חשבונית שלא שולמה"
  ],
  threat: [
    "legal action",
    "account will be locked",
    "account will be permanently closed",
    "unauthorized access detected",
    "suspicious activity detected",
    "penalty",
    "failure to comply",
    // Hebrew
    "הליכים משפטיים",
    "עיקול",
    "עיקולים",
    "הליכי גבייה",
    "פעילות לא מורשית זוהתה",
    "פעילות חשודה זוהתה",
    "קנס",
    "ללא אפשרות ביטול"
  ],
  sensitiveInfo: [
    "social security number",
    "date of birth",
    "credit card number",
    "billing address and password",
    // Hebrew
    "מספר תעודת זהות",
    "תאריך לידה",
    "מספר כרטיס אשראי"
  ]
};

const GROUP_SCORE = 5;
const COMBINATION_BONUS = 6;

interface GroupMatch {
  group: string;
  matchedPhrase: string;
}

function findGroupMatches(bodyLower: string, subjectLower: string): GroupMatch[] {
  const combined = `${subjectLower} ${bodyLower}`;
  const matches: GroupMatch[] = [];
  for (const [group, phrases] of Object.entries(KEYWORD_GROUPS)) {
    const hit = phrases.find((phrase) => combined.includes(phrase));
    if (hit) {
      matches.push({ group, matchedPhrase: hit });
    }
  }
  return matches;
}

const GROUP_COPY: Record<
  string,
  { title: string; explanation: string; technical: string; action: string }
> = {
  credential: {
    title: "This email asks about your password or account",
    explanation: "This email asks you to verify, confirm, or re-enter account or login details.",
    technical: "Matched credential-request / account-verification language.",
    action: "Do not enter your password using links from this email."
  },
  urgency: {
    title: "This email pressures you to act quickly",
    explanation:
      "This email uses urgent language to rush you into acting before you can think it through.",
    technical: "Matched urgency/pressure language.",
    action: "Slow down. Legitimate organizations rarely demand immediate action by email."
  },
  payment: {
    title: "This email asks about money or payment",
    explanation:
      "This email mentions payment methods (like wire transfers, gift cards, or cryptocurrency) that are commonly used in scams.",
    technical: "Matched payment/financial-request language.",
    action:
      "Do not send money or payment details based on this email alone. Verify by phone with a known number."
  },
  threat: {
    title: "This email uses threatening language",
    explanation:
      "This email threatens a negative consequence (legal action, account closure) to pressure you.",
    technical: "Matched threat/consequence language.",
    action: "Verify the sender using a trusted contact method before taking any action."
  },
  sensitiveInfo: {
    title: "This email asks for sensitive personal information",
    explanation:
      "This email asks for personal information that legitimate organizations rarely request by email.",
    technical: "Matched sensitive personal information request language.",
    action: "Do not reply with personal or financial information."
  }
};

export function detectContentSignals(bodyText: string, subject: string | undefined): Finding[] {
  const findings: Finding[] = [];
  const bodyLower = (bodyText || "").toLowerCase();
  const subjectLower = (subject || "").toLowerCase();

  const matches = findGroupMatches(bodyLower, subjectLower);

  for (const match of matches) {
    const copy = GROUP_COPY[match.group];
    if (!copy) continue;
    findings.push({
      id: `content.${match.group}`,
      category: "content",
      severity: match.group === "urgency" ? "low" : "medium",
      scoreContribution: GROUP_SCORE,
      userTitle: copy.title,
      userExplanation: copy.explanation,
      technicalExplanation: copy.technical,
      recommendedAction: copy.action
    });
  }

  if (matches.length >= 2) {
    findings.push({
      id: "content.combination",
      category: "content",
      severity: "high",
      scoreContribution: COMBINATION_BONUS,
      userTitle: "The email asks you to act urgently",
      userExplanation:
        "This email combines several classic pressure tactics (for example, urgency plus a request for account or payment details), which is a common pattern in scam emails.",
      technicalExplanation: `Matched ${matches.length} distinct content signal groups: ${matches
        .map((m) => m.group)
        .join(", ")}.`,
      recommendedAction:
        "Do not act on this email's requests until you verify the sender independently."
    });
  }

  return findings;
}
