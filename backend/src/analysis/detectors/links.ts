import type { Finding, LinkInput } from "../../types/models.js";

export const LINKS_CATEGORY_MAX = 30;

const SHORTENER_DOMAINS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at"
]);

const SUSPICIOUS_PATH_KEYWORDS = [
  "/login",
  "/signin",
  "/verify",
  "/account/update",
  "/account-update",
  "/secure",
  "/wp-admin",
  "/reset-password",
  "/confirm-identity"
];

const IPV4_HOST = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

interface ParsedUrl {
  raw: string;
  url: URL | null;
}

function safeParseUrl(href: string): ParsedUrl {
  try {
    // Links without a scheme (rare in real HTML emails, but handle gracefully)
    const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(href) ? href : `http://${href}`;
    return { raw: href, url: new URL(normalized) };
  } catch {
    return { raw: href, url: null };
  }
}

function looksLikeDomain(text: string): string | null {
  const trimmed = text.trim().toLowerCase();
  const match = trimmed.match(/^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})(?:\/.*)?$/i);
  return match ? (match[1] ?? null) : null;
}

function hostnamesEquivalent(a: string, b: string): boolean {
  const na = a.replace(/^www\./, "");
  const nb = b.replace(/^www\./, "");
  return na === nb || na.endsWith(`.${nb}`) || nb.endsWith(`.${na}`);
}

/**
 * Structural, local heuristics only. This never fetches the URL and never
 * renders/executes any email HTML - it only inspects the string form of the
 * link and its associated visible text.
 */
export function detectLinkSignals(links: LinkInput[]): {
  findings: Finding[];
  uniqueUrls: string[];
} {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const uniqueUrls: string[] = [];

  for (const link of links) {
    const key = link.href.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueUrls.push(key);

    const { url } = safeParseUrl(key);
    if (!url) {
      findings.push(
        buildFinding(`link.unparsable.${uniqueUrls.length}`, "low", 3, key, "unparsable-url")
      );
      continue;
    }

    const hostname = url.hostname.toLowerCase();

    if (url.protocol === "http:") {
      findings.push(buildFinding(`link.http.${hostname}`, "low", 4, key, "insecure-http"));
    }

    if (IPV4_HOST.test(hostname)) {
      findings.push(buildFinding(`link.ip-host.${hostname}`, "high", 10, key, "ip-address-host"));
    }

    if (hostname.includes("xn--")) {
      findings.push(buildFinding(`link.punycode.${hostname}`, "high", 8, key, "punycode-domain"));
    }

    if (url.username) {
      findings.push(
        buildFinding(`link.userinfo.${hostname}`, "high", 8, key, "userinfo-obfuscation")
      );
    }

    if (key.length > 150) {
      findings.push(buildFinding(`link.long-url.${hostname}`, "low", 3, key, "long-url"));
    }

    if (SHORTENER_DOMAINS.has(hostname)) {
      findings.push(buildFinding(`link.shortener.${hostname}`, "medium", 5, key, "url-shortener"));
    }

    const path = url.pathname.toLowerCase();
    if (SUSPICIOUS_PATH_KEYWORDS.some((kw) => path.includes(kw))) {
      findings.push(
        buildFinding(`link.suspicious-path.${hostname}`, "medium", 4, key, "suspicious-path")
      );
    }

    if (link.displayText) {
      const displayedDomain = looksLikeDomain(link.displayText);
      if (displayedDomain && !hostnamesEquivalent(displayedDomain, hostname)) {
        findings.push({
          id: `link.text-mismatch.${hostname}`,
          category: "links",
          severity: "high",
          scoreContribution: 12,
          userTitle: "Link text does not match its destination",
          userExplanation: `This link is displayed as "${link.displayText.trim()}" but actually points to "${hostname}".`,
          technicalExplanation: `Visible link text resolves to domain "${displayedDomain}" but href resolves to "${hostname}".`,
          recommendedAction:
            "Open the company's website directly instead of using the link in this email."
        });
      }
    }
  }

  return { findings, uniqueUrls };
}

function buildFinding(
  id: string,
  severity: Finding["severity"],
  scoreContribution: number,
  href: string,
  kind:
    | "unparsable-url"
    | "insecure-http"
    | "ip-address-host"
    | "punycode-domain"
    | "userinfo-obfuscation"
    | "long-url"
    | "url-shortener"
    | "suspicious-path"
): Finding {
  const copy: Record<typeof kind, { title: string; explanation: string; technical: string }> = {
    "unparsable-url": {
      title: "A link could not be checked",
      explanation: "This email contains a link in a format we could not fully analyze.",
      technical: `Link "${href}" could not be parsed as a well-formed URL.`
    },
    "insecure-http": {
      title: "A link uses an insecure connection",
      explanation: "One of the links in this email does not use a secure (HTTPS) connection.",
      technical: `Link uses plain HTTP: ${href}`
    },
    "ip-address-host": {
      title: "A link points to a raw IP address",
      explanation:
        "One of the links points directly to a numeric address instead of a normal website name.",
      technical: `Link hostname is a raw IP address: ${href}`
    },
    "punycode-domain": {
      title: "A link uses a disguised web address",
      explanation:
        "One of the links uses a special encoding that can be used to imitate a well-known website name.",
      technical: `Link hostname uses punycode (xn--) encoding: ${href}`
    },
    "userinfo-obfuscation": {
      title: "A link may be disguised",
      explanation: "One of the links is formatted in a way that can hide its true destination.",
      technical: `Link contains userinfo before the actual host: ${href}`
    },
    "long-url": {
      title: "A link is unusually long",
      explanation:
        "One of the links is unusually long, which can be used to hide its real destination.",
      technical: `Link exceeds 150 characters: ${href}`
    },
    "url-shortener": {
      title: "A link uses a link-shortening service",
      explanation:
        "One of the links uses a service that hides the real destination until you click it.",
      technical: `Link uses a known URL shortener domain: ${href}`
    },
    "suspicious-path": {
      title: "A link points to a login-style page",
      explanation:
        "One of the links points to a page path commonly used for fake login or verification pages.",
      technical: `Link path matches a suspicious keyword pattern: ${href}`
    }
  };

  const c = copy[kind];
  return {
    id,
    category: "links",
    severity,
    scoreContribution,
    userTitle: c.title,
    userExplanation: c.explanation,
    technicalExplanation: c.technical,
    recommendedAction:
      "Open the company's website directly instead of using the link in this email."
  };
}
