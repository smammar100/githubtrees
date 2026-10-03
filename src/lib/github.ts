import "server-only"
import { execFileSync } from "node:child_process"
import type { Branch, CheckSummary, GraphResult, Person, PullRequestRef, RepoGraph } from "./types"

const API = "https://api.github.com"
const MAX_BRANCHES = 150
const CONCURRENCY = 8
const TTL_MS = 10 * 60 * 1000

class GitHubError extends Error {
  constructor(public status: number, message: string, public rateLimited = false) {
    super(message)
  }
}

let cachedToken: string | null | undefined
function token(): string | null {
  if (cachedToken !== undefined) return cachedToken
  cachedToken = process.env.GITHUB_TOKEN?.trim() || null
  if (!cachedToken) {
    // Local development convenience: reuse the GitHub CLI login if present.
    try {
      cachedToken = execFileSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }).trim() || null
    } catch {
      cachedToken = null
    }
  }
  return cachedToken
}

async function gh<T>(path: string): Promise<T> {
  const t = token()
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    const rateLimited = (res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0"
    throw new GitHubError(res.status, body.message ?? res.statusText, rateLimited)
  }
  return res.json() as Promise<T>
}

async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

interface ApiUser { login: string; avatar_url: string; type: string }
interface ApiCommit {
  sha: string
  author: ApiUser | null
  commit: { author: { name: string; date: string }; committer: { date: string } }
}
interface ApiCompare {
  ahead_by: number
  behind_by: number
  total_commits: number
  merge_base_commit: ApiCommit
  commits: ApiCommit[]
}
interface ApiPull {
  number: number
  title: string
  html_url: string
  state: "open" | "closed"
  draft: boolean
  merged_at: string | null
  head: { ref: string; repo: { full_name: string } | null }
  base: { ref: string }
}

const person = (c: ApiCommit): Person =>
  c.author
    ? { login: c.author.login, avatarUrl: c.author.avatar_url, isBot: c.author.type === "Bot" || c.author.login.endsWith("[bot]") }
    : { login: c.commit.author.name, avatarUrl: null, isBot: false }

const commitDate = (c: ApiCommit) => c.commit.committer?.date ?? c.commit.author.date

async function checksFor(full: string, sha: string): Promise<CheckSummary | null> {
  type Runs = { total_count: number; check_runs: { name: string; status: string; conclusion: string | null }[] }
  const [runs, status] = await Promise.all([
    gh<Runs>(`/repos/${full}/commits/${sha}/check-runs?per_page=100`),
    gh<{ total_count: number; statuses: { context: string; state: string }[] }>(`/repos/${full}/commits/${sha}/status`),
  ])
  const pages = Math.min(8, Math.ceil(runs.total_count / 100))
  if (pages > 1) {
    const more = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => gh<Runs>(`/repos/${full}/commits/${sha}/check-runs?per_page=100&page=${i + 2}`)))
    more.forEach(m => runs.check_runs.push(...m.check_runs))
  }
  // github.com counts every run returned here (matches its "42 / 57" exactly). Default branches can carry
  // hundreds of merge-queue suites, so when there are several pages keep only the newest run per name.
  const latest = new Map<string, { status: string; conclusion: string | null }>()
  runs.check_runs.forEach((r, i) => {
    const key = pages > 1 ? r.name : String(i)
    if (!latest.has(key)) latest.set(key, r)
  })
  let passed = 0, failed = 0, pending = 0
  for (const r of latest.values()) {
    if (r.status !== "completed") pending++
    else if (r.conclusion === "success" || r.conclusion === "neutral") passed++
    else if (r.conclusion !== "skipped") failed++
  }
  for (const s of status.statuses) {
    if (s.state === "success") passed++
    else if (s.state === "pending") pending++
    else failed++
  }
  const total = latest.size + status.statuses.length
  if (!total) return null
  return { passed, total, state: failed ? "failure" : pending ? "pending" : "success" }
}

async function build(owner: string, repo: string): Promise<RepoGraph> {
  const full = `${owner}/${repo}`
  const authed = !!token()

  const repoInfo = await gh<{
    full_name: string; html_url: string; description: string | null; private: boolean; default_branch: string
    stargazers_count: number; forks_count: number; open_issues_count: number
  }>(`/repos/${full}`)
  const fullName = repoInfo.full_name
  const def = repoInfo.default_branch

  const [viewer, apiBranches, pulls, openPullCount] = await Promise.all([
    authed ? gh<ApiUser>("/user").then(u => ({ login: u.login, avatarUrl: u.avatar_url, isBot: false }) as Person).catch(() => null) : Promise.resolve(null),
    (async () => {
      const all: { name: string; commit: { sha: string }; protected: boolean }[] = []
      for (let page = 1; page <= 10; page++) {
        const batch = await gh<typeof all>(`/repos/${fullName}/branches?per_page=100&page=${page}`)
        all.push(...batch)
        if (batch.length < 100) break
      }
      return all
    })(),
    (async () => {
      const all: ApiPull[] = []
      for (let page = 1; page <= 3; page++) {
        const batch = await gh<ApiPull[]>(`/repos/${fullName}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`)
        all.push(...batch)
        if (batch.length < 100) break
      }
      return all
    })(),
    gh<{ total_count: number }>(`/search/issues?q=${encodeURIComponent(`repo:${fullName} is:pr is:open`)}&per_page=1`).then(r => r.total_count).catch(() => null),
  ])

  const totalBranches = apiBranches.length
  const defBranch = apiBranches.find(b => b.name === def)
  const rest = apiBranches.filter(b => b.name !== def).slice(0, MAX_BRANCHES - 1)
  const picked = defBranch ? [defBranch, ...rest] : rest

  // Most recently updated PR per head branch (same-repo PRs only).
  const prByHead = new Map<string, PullRequestRef>()
  for (const p of pulls) {
    if (p.head.repo?.full_name !== fullName || prByHead.has(p.head.ref)) continue
    prByHead.set(p.head.ref, {
      number: p.number, title: p.title, url: p.html_url, base: p.base.ref,
      state: p.merged_at ? "merged" : p.state === "closed" ? "closed" : p.draft ? "draft" : "open",
    })
  }

  let commitsScanned = 0
  const raw = await pool(picked, async b => {
    const isDefault = b.name === def
    let ahead = 0, behind = 0, orphan = false, aheadShas: string[] = []
    let head: ApiCommit | null = null, mergeBase: ApiCommit | null = null
    if (isDefault) {
      head = await gh<ApiCommit>(`/repos/${fullName}/commits/${b.commit.sha}`)
    } else {
      try {
        const cmp = await gh<ApiCompare>(`/repos/${fullName}/compare/${encodeURIComponent(def)}...${b.commit.sha}`)
        ahead = cmp.ahead_by
        behind = cmp.behind_by
        aheadShas = cmp.commits.map(c => c.sha)
        mergeBase = cmp.merge_base_commit
        commitsScanned += cmp.commits.length
        if (ahead === 0) head = cmp.merge_base_commit
        else if (cmp.commits.length >= ahead) head = cmp.commits[cmp.commits.length - 1]
      } catch (e) {
        if (e instanceof GitHubError && e.status === 404) orphan = true
        else throw e
      }
      if (!head) head = await gh<ApiCommit>(`/repos/${fullName}/commits/${b.commit.sha}`)
    }
    const checks = authed ? await checksFor(fullName, b.commit.sha).catch(() => null) : null
    return { b, isDefault, ahead, behind, orphan, aheadShas, head: head!, mergeBase, checks }
  })

  const names = new Set(raw.map(r => r.b.name))
  const bySha = new Map<string, typeof raw>()
  for (const r of raw) if (!r.isDefault && !r.orphan) bySha.set(r.b.commit.sha, [...(bySha.get(r.b.commit.sha) ?? []), r])

  const branches: Branch[] = raw.map(r => {
    const pr = prByHead.get(r.b.name) ?? null
    const base: Branch = {
      name: r.b.name, sha: r.b.commit.sha, isDefault: r.isDefault, isProtected: r.b.protected,
      parent: null, parentSource: null, orphan: r.orphan, ahead: r.ahead, behind: r.behind,
      updatedAt: commitDate(r.head), forkedAt: r.mergeBase ? commitDate(r.mergeBase) : null,
      author: person(r.head), pr, checks: r.checks,
    }
    if (r.isDefault || r.orphan) return base

    // 1. Pull request base is the strongest signal.
    if (pr && pr.base !== def && pr.base !== r.b.name) {
      if (names.has(pr.base)) return { ...base, parent: pr.base, parentSource: "pr" }
      return { ...base, parent: def, parentSource: "default", parentDeleted: pr.base }
    }
    // 2. Another branch's tip is inside this branch's unique commits → stacked on it.
    if (!pr) {
      let best: (typeof raw)[number] | null = null
      for (const sha of r.aheadShas) {
        if (sha === r.b.commit.sha) continue
        for (const cand of bySha.get(sha) ?? []) {
          if (cand.b.name === r.b.name || cand.ahead >= r.ahead || cand.ahead === 0) continue
          if (!best || cand.ahead > best.ahead) best = cand
        }
      }
      if (best) return { ...base, parent: best.b.name, parentSource: "ancestry", forkedAt: commitDate(best.head) }
    }
    // 3. Forked straight from the default branch.
    return { ...base, parent: def, parentSource: "default" }
  })

  // Break any parent cycles (possible with crossed PR bases) by re-attaching to the default branch.
  const byName = new Map(branches.map(b => [b.name, b]))
  for (const b of branches) {
    const seen = new Set<string>([b.name])
    let p = b.parent
    while (p && byName.get(p)) {
      if (seen.has(p)) { b.parent = def; b.parentSource = "default"; break }
      seen.add(p)
      p = byName.get(p)!.parent
    }
  }

  return {
    owner: fullName.split("/")[0], repo: fullName.split("/")[1], fullName, htmlUrl: repoInfo.html_url,
    description: repoInfo.description, isPrivate: repoInfo.private, defaultBranch: def,
    stars: repoInfo.stargazers_count, forks: repoInfo.forks_count,
    openPulls: openPullCount ?? pulls.filter(p => p.state === "open").length,
    openIssues: Math.max(0, repoInfo.open_issues_count - (openPullCount ?? pulls.filter(p => p.state === "open").length)),
    viewer, branches, totalBranches, commitsScanned, fetchedAt: new Date().toISOString(),
  }
}

const cache = new Map<string, { at: number; graph: RepoGraph }>()
const inflight = new Map<string, Promise<RepoGraph>>()

export async function getRepoGraph(owner: string, repo: string, opts: { fresh?: boolean } = {}): Promise<GraphResult> {
  const key = `${owner}/${repo}`.toLowerCase()
  const hit = cache.get(key)
  if (hit && !opts.fresh && Date.now() - hit.at < TTL_MS) return { ok: true, graph: hit.graph }
  try {
    let p = inflight.get(key)
    if (!p) {
      p = build(owner, repo).finally(() => inflight.delete(key))
      inflight.set(key, p)
    }
    const graph = await p
    cache.set(key, { at: Date.now(), graph })
    return { ok: true, graph }
  } catch (e) {
    if (e instanceof GitHubError) {
      if (e.rateLimited)
        return { ok: false, reason: "rate-limited", message: token() ? "GitHub API rate limit reached. Try again in a few minutes." : "GitHub’s anonymous API limit (60 requests/hour) was reached. Set GITHUB_TOKEN or sign in with the GitHub CLI to raise it." }
      if (e.status === 404) return { ok: false, reason: "not-found", message: `${owner}/${repo} isn’t a public repository, or it doesn’t exist.` }
      return { ok: false, reason: "error", message: e.message }
    }
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : "Unknown error" }
  }
}
