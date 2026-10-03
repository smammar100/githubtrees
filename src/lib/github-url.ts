/** What a GitHub link points at, as far as the branches tree cares. */
export interface TreeTarget {
  owner: string
  repo: string
  /** A branch, or a branch followed by a path (`main/src/app`, from /tree and /blob links). */
  ref?: string
  pr?: number
  tab?: "yours" | "active" | "stale" | "all"
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/
const TABS = new Set(["yours", "active", "stale", "all"])

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Reads GitHub-style path segments: `owner/repo`, `…/tree/<branch>`, `…/blob/<branch>/<path>`, `…/commits/<branch>`,
 * `…/pull/<n>`, `…/compare/<base>...<head>` and `…/branches/<tab>`. A leading `https:` and host (github.com, or this
 * site's own) are skipped, so a whole pasted URL works too.
 */
export function parseGitHubPath(segments: string[]): TreeTarget | null {
  let s = segments.map(decode).filter(Boolean)
  if (/^https?:$/i.test(s[0] ?? "")) s = s.slice(1)
  // GitHub logins can't contain dots or colons, so a first segment with one is a host.
  if (/[.:]/.test(s[0] ?? "")) s = s.slice(1)
  const [owner, rawRepo, kind, ...rest] = s
  const repo = rawRepo?.replace(/\.git$/i, "")
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo)) return null

  const target: TreeTarget = { owner, repo }
  if ((kind === "tree" || kind === "blob" || kind === "commits") && rest.length) target.ref = rest.join("/")
  else if (kind === "pull" || kind === "pulls") {
    const n = Number(rest[0])
    if (Number.isInteger(n) && n > 0) target.pr = n
  } else if (kind === "compare" && rest.length) {
    const spec = rest.join("/")
    let head = spec.includes("...") ? spec.slice(spec.lastIndexOf("...") + 3) : spec.includes("..") ? spec.slice(spec.lastIndexOf("..") + 2) : spec
    // `user:branch` is a fork's branch unless the user is this repository's owner.
    const colon = head.indexOf(":")
    if (colon >= 0) head = head.slice(0, colon).toLowerCase() === owner.toLowerCase() ? head.slice(colon + 1) : ""
    if (head) target.ref = head
  } else if (kind === "branches" && TABS.has(rest[0])) target.tab = rest[0] as TreeTarget["tab"]
  return target
}

/** Accepts `owner/repo`, a github.com URL (with or without https://) or a link to this site. */
export function parseGitHubUrl(input: string): TreeTarget | null {
  const path = input.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[?#]/)[0]
  return parseGitHubPath(path.split("/"))
}

/** The tree page for a target. Slashes in branch names stay readable in the query string. */
export function toTreeHref(t: TreeTarget): string {
  const q = new URLSearchParams()
  if (t.tab) q.set("tab", t.tab)
  if (t.ref) q.set("branch", t.ref)
  if (t.pr) q.set("pr", String(t.pr))
  const qs = q.toString().replace(/%2F/gi, "/")
  return `/${t.owner}/${t.repo}/branches${qs ? `?${qs}` : ""}`
}

/** The branch a ref names: an exact match, or the longest branch the ref starts with (`main/src/app` → `main`). */
export function resolveRef(ref: string, names: Iterable<string>): string | null {
  let best: string | null = null
  for (const name of names) {
    if (name === ref) return name
    if (ref.startsWith(`${name}/`) && (!best || name.length > best.length)) best = name
  }
  return best
}
