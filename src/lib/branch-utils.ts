import type { Branch, Person } from "./types"

export const STALE_MS = 90 * 24 * 60 * 60 * 1000

export const isStale = (b: Branch, now: number) => !b.isDefault && now - new Date(b.updatedAt).getTime() > STALE_MS
export const isActive = (b: Branch, now: number) => !b.isDefault && !isStale(b, now)

export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return "—"
  const s = Math.round((now - new Date(iso).getTime()) / 1000)
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`
  const h = Math.round(m / 60)
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`
  const d = Math.round(h / 24)
  if (d === 1) return "yesterday"
  if (d < 7) return `${d} days ago`
  const w = Math.round(d / 7)
  if (d < 30) return w === 1 ? "last week" : `${w} weeks ago`
  const mo = Math.round(d / 30)
  if (d < 365) return mo <= 1 ? "last month" : `${mo} months ago`
  const y = Math.round(d / 365)
  return y === 1 ? "last year" : `${y} years ago`
}

export const initials = (n: string) =>
  n.replace(/\[bot\]/, "").split(/[-_. ]/).filter(Boolean).map(s => s[0]).join("").slice(0, 2).toUpperCase()

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Primer data-visualisation tokens, so branch colours follow the active theme.
const BRANCH_PALETTE = ["purple", "red", "green", "teal", "yellow", "orange", "blue", "pink", "auburn"].map(c => `var(--data-${c}-color-emphasis)`)
export const branchColor = (b: Branch) => (b.isDefault ? "var(--fgColor-default)" : BRANCH_PALETTE[hash(b.name) % BRANCH_PALETTE.length])

// Primer Label tokens for avatar fallbacks.
const AVATAR_PALETTE = ["blue", "purple", "pink", "green", "orange", "teal"].map(c => [`var(--label-${c}-bgColor-rest)`, `var(--label-${c}-fgColor-rest)`] as [string, string])
export const avatarColors = (p: Person): [string, string] => (p.isBot ? ["var(--bgColor-neutral-muted)", "var(--fgColor-muted)"] : AVATAR_PALETTE[hash(p.login) % AVATAR_PALETTE.length])

export const githubUrl = {
  tree: (repo: string, b: string) => `https://github.com/${repo}/tree/${encodeURIComponent(b).replace(/%2F/g, "/")}`,
  commits: (repo: string, b: string) => `https://github.com/${repo}/commits/${encodeURIComponent(b).replace(/%2F/g, "/")}`,
  compare: (repo: string, base: string, head: string, expand = false) =>
    `https://github.com/${repo}/compare/${base}...${head}${expand ? "?expand=1" : ""}`,
  activity: (repo: string, b: string) => `https://github.com/${repo}/activity?ref=${encodeURIComponent(b)}`,
  checks: (repo: string, sha: string) => `https://github.com/${repo}/commit/${sha}/checks`,
  rules: (repo: string, b: string) => `https://github.com/${repo}/rules?ref=${encodeURIComponent(`refs/heads/${b}`)}`,
  user: (login: string) => `https://github.com/${login.replace(/\[bot\]$/, "")}`,
}
