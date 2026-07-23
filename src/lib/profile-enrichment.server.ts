import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type ProfileLinks = {
  githubUrl: string;
  portfolioUrl: string;
};

type SourceState = "not_added" | "read" | "unavailable";

type SourceSummary = {
  state: SourceState;
  detail: string;
  items: number;
  deployedLinks: number;
};

export type ProfileEvidenceSummary = {
  github: SourceSummary;
  portfolio: SourceSummary;
};

export type ProfileEnrichment = {
  evidenceText: string;
  summary: ProfileEvidenceSummary;
};

type GitHubRepo = {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  pushed_at: string | null;
};

type GitHubReadme = {
  content?: string;
  encoding?: string;
};

const MAX_PORTFOLIO_BYTES = 350_000;
const MAX_PORTFOLIO_TEXT = 3_800;
const MAX_README_TEXT = 700;
const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Nuvra-Profile-Reader",
};

function emptySource(detail: string): SourceSummary {
  return { state: "not_added", detail, items: 0, deployedLinks: 0 };
}

function unavailableSource(detail: string): SourceSummary {
  return { state: "unavailable", detail, items: 0, deployedLinks: 0 };
}

function stripControlCharacters(value: string) {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join("");
}

function cleanText(value: string, maxLength: number) {
  const lines = stripControlCharacters(value)
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(
      (line) =>
        line.length > 1 &&
        !/\b(ignore (all |any |the )?(previous|above)|system prompt|assistant instruction)\b/i.test(
          line,
        ),
    );
  return lines.join("\n").slice(0, maxLength).trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html: string) {
  return cleanText(
    decodeHtml(
      html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
    MAX_PORTFOLIO_TEXT,
  );
}

function firstMatch(value: string, pattern: RegExp) {
  const match = value.match(pattern);
  return match?.[1] ? decodeHtml(match[1].replace(/<[^>]+>/g, " ").trim()) : "";
}

function extractHeadings(html: string) {
  return [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => cleanText(decodeHtml(match[1].replace(/<[^>]+>/g, " ")), 140))
    .filter(Boolean)
    .slice(0, 10);
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extractLinks(html: string, baseUrl: URL) {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*?href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), baseUrl);
      if (isPublicHttpUrl(url.toString())) links.add(url.toString());
    } catch {
      // Ignore malformed hrefs from a public page.
    }
  }
  return [...links].slice(0, 12);
}

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.slice(7));
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function assertPublicPortfolioUrl(url: URL) {
  if (!isPublicHttpUrl(url.toString()) || url.username || url.password) {
    throw new Error("Only public HTTP(S) portfolio URLs are supported.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Only standard public web ports are supported.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Local network URLs are not supported.");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private network URLs are not supported.");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("The portfolio host must resolve to a public address.");
  }
}

async function readBody(response: Response, maxBytes: number) {
  const headerLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(headerLength) && headerLength > maxBytes) {
    throw new Error("The portfolio page is too large to inspect.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("The portfolio page is too large to inspect.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchPublicHtml(input: string) {
  let current = new URL(input);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicPortfolioUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Nuvra-Profile-Reader/1.0",
      },
      signal: AbortSignal.timeout(7_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The portfolio redirect did not include a destination.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`The portfolio returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("The portfolio URL did not return an HTML page.");
    }
    return { url: current, html: await readBody(response, MAX_PORTFOLIO_BYTES) };
  }
  throw new Error("The portfolio redirected too many times.");
}

function githubHandle(input: string) {
  try {
    const url = new URL(input);
    if (
      url.hostname.toLowerCase() !== "github.com" &&
      url.hostname.toLowerCase() !== "www.github.com"
    ) {
      return null;
    }
    const handle = url.pathname.split("/").filter(Boolean)[0] || "";
    return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(handle) ? handle : null;
  } catch {
    return null;
  }
}

async function githubJson<T>(path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: GITHUB_HEADERS,
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
  return (await response.json()) as T;
}

async function readGitHub(
  handle: string,
): Promise<{ evidenceText: string; summary: SourceSummary }> {
  const repos = await githubJson<GitHubRepo[]>(
    `/users/${encodeURIComponent(handle)}/repos?per_page=100&sort=updated`,
  );
  const selected = repos
    .filter((repo) => !repo.fork && !repo.archived)
    .sort(
      (a, b) =>
        b.stargazers_count - a.stargazers_count ||
        String(b.pushed_at || "").localeCompare(String(a.pushed_at || "")),
    )
    .slice(0, 5);
  const readmes = await Promise.all(
    selected.slice(0, 4).map(async (repo) => {
      try {
        const readme = await githubJson<GitHubReadme>(
          `/repos/${encodeURIComponent(handle)}/${encodeURIComponent(repo.name)}/readme`,
        );
        if (!readme.content || readme.encoding !== "base64") return "";
        return cleanText(Buffer.from(readme.content, "base64").toString("utf8"), MAX_README_TEXT);
      } catch {
        return "";
      }
    }),
  );
  const deployedLinks = new Set<string>();
  const lines = selected.map((repo, index) => {
    if (repo.homepage && isPublicHttpUrl(repo.homepage)) deployedLinks.add(repo.homepage);
    const summary = [
      `Repository: ${repo.name}`,
      repo.language ? `Language: ${repo.language}` : "",
      repo.description ? `Description: ${cleanText(repo.description, 260)}` : "",
      repo.topics?.length ? `Topics: ${repo.topics.slice(0, 6).join(", ")}` : "",
      repo.homepage && isPublicHttpUrl(repo.homepage) ? `Live link: ${repo.homepage}` : "",
      readmes[index] ? `README: ${readmes[index]}` : "",
    ].filter(Boolean);
    return summary.join(" | ");
  });
  return {
    evidenceText: lines.length ? `[UNTRUSTED PUBLIC GITHUB PROJECT DATA]\n${lines.join("\n")}` : "",
    summary: {
      state: "read",
      detail: `${selected.length} public repositories inspected`,
      items: selected.length,
      deployedLinks: deployedLinks.size,
    },
  };
}

async function readPortfolio(
  input: string,
): Promise<{ evidenceText: string; summary: SourceSummary }> {
  const { url, html } = await fetchPublicHtml(input);
  const title = cleanText(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i), 180);
  const description = cleanText(
    firstMatch(
      html,
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i,
    ),
    360,
  );
  const headings = extractHeadings(html);
  const links = extractLinks(html, url);
  const pageText = htmlToText(html);
  const evidence = [
    title ? `Page title: ${title}` : "",
    description ? `Page description: ${description}` : "",
    headings.length ? `Project headings: ${headings.join(" | ")}` : "",
    links.length ? `Project links: ${links.join(" | ")}` : "",
    pageText ? `Page text: ${pageText}` : "",
  ].filter(Boolean);
  return {
    evidenceText: evidence.length
      ? `[UNTRUSTED PUBLIC PORTFOLIO DATA]\n${evidence.join("\n")}`
      : "",
    summary: {
      state: "read",
      detail: `${headings.length} headings and ${links.length} public links inspected`,
      items: headings.length,
      deployedLinks: links.length,
    },
  };
}

export async function enrichPublicProfile(profile: ProfileLinks): Promise<ProfileEnrichment> {
  const github = githubHandle(profile.githubUrl);
  const githubTask = github
    ? readGitHub(github).catch((error) => {
        console.warn("Could not enrich GitHub profile.", error);
        return {
          evidenceText: "",
          summary: unavailableSource("GitHub could not be read right now"),
        };
      })
    : Promise.resolve({
        evidenceText: "",
        summary: profile.githubUrl.trim()
          ? unavailableSource("Use a public github.com profile URL")
          : emptySource("No GitHub profile added"),
      });
  const portfolioTask = profile.portfolioUrl.trim()
    ? readPortfolio(profile.portfolioUrl).catch((error) => {
        console.warn("Could not enrich portfolio.", error);
        return {
          evidenceText: "",
          summary: unavailableSource("Portfolio could not be read right now"),
        };
      })
    : Promise.resolve({ evidenceText: "", summary: emptySource("No portfolio added") });
  const [githubResult, portfolioResult] = await Promise.all([githubTask, portfolioTask]);

  return {
    evidenceText: [githubResult.evidenceText, portfolioResult.evidenceText]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 9_000),
    summary: { github: githubResult.summary, portfolio: portfolioResult.summary },
  };
}
