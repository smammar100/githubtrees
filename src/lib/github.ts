import "server-only"
import { execFileSync } from "node:child_process"
import type { Branch, CheckSummary, GraphResult, Person, PullRequestRef, RepoGraph } from "./types"

const API = "https://api.github.com"
const MAX_BRANCHES = 150
// REST fallback (no token): requests in flight at once.
const CONCURRENCY = 16
// GraphQL: branches per detail query. All chunks run in parallel; ~10 keeps each well under GitHub's 10 s query timeout.
const CHUNK = 10
// Serverless hosts cap a whole request at 60 s, so no single call may hang.
const REQUEST_TIMEOUT_MS = 20_000
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

const isRateLimited = (res: Response, message = "") =>
  (res.status === 403 || res.status === 429) && (res.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(message))

async function gh<T>(path: string): Promise<T> {
  const t = token()
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new GitHubError(res.status, body.message ?? res.statusText, isRateLimited(res, body.message))
  }
  return res.json() as Promise<T>
}

/** GraphQL request. Fields that fail on their own (e.g. a branch deleted mid-fetch) come back as null. */
async function gql<T>(query: string): Promise<T> {
  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: T | null; errors?: { type?: string; message: string }[]; message?: string }
  if (!res.ok) throw new GitHubError(res.status, body.message ?? res.statusText, isRateLimited(res, body.message))
  const rateLimit = body.errors?.find(e => e.type === "RATE_LIMITED")
  if (rateLimit) throw new GitHubError(403, rateLimit.message, true)
  if (!body.data) throw new GitHubError(502, body.errors?.[0]?.message ?? "GitHub returned no data")
  return body.data
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

// ─── Shared graph assembly ───────────────────────────────────────────────────

/** A branch as read from GitHub, before its parent is worked out. */
interface RawBranch extends Omit<Branch, "parent" | "parentSource" | "parentDeleted" | "local"> {
  /** Commits on this branch that aren't on the default branch, oldest first. */
  aheadShas: string[]
}

type RepoMeta = Omit<RepoGraph, "branches" | "commitsScanned" | "fetchedAt">

function graphOf(meta: RepoMeta, raw: RawBranch[]): RepoGraph {
  const def = meta.defaultBranch
  const names = new Set(raw.map(r => r.name))
  const bySha = new Map<string, RawBranch[]>()
  for (const r of raw) if (!r.isDefault && !r.orphan) bySha.set(r.sha, [...(bySha.get(r.sha) ?? []), r])

  const branches: Branch[] = raw.map(({ aheadShas, ...r }) => {
    const base: Branch = { ...r, parent: null, parentSource: null }
    if (r.isDefault || r.orphan) return base

    // 1. Pull request base is the strongest signal.
    if (r.pr && r.pr.base !== def && r.pr.base !== r.name) {
      if (names.has(r.pr.base)) return { ...base, parent: r.pr.base, parentSource: "pr" }
      return { ...base, parent: def, parentSource: "default", parentDeleted: r.pr.base }
    }
    // 2. Another branch's tip is inside this branch's unique commits → stacked on it.
    if (!r.pr) {
      let best: RawBranch | null = null
      for (const sha of aheadShas) {
        if (sha === r.sha) continue
        for (const cand of bySha.get(sha) ?? []) {
          if (cand.name === r.name || cand.ahead >= r.ahead || cand.ahead === 0) continue
          if (!best || cand.ahead > best.ahead) best = cand
        }
      }
      if (best) return { ...base, parent: best.name, parentSource: "ancestry", forkedAt: best.updatedAt }
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

  return { ...meta, branches, commitsScanned: raw.reduce((n, r) => n + r.aheadShas.length, 0), fetchedAt: new Date().toISOString() }
}

interface ApiBranch { name: string; commit: { sha: string }; protected: boolean }

/** Branches in name order, as github.com lists them. GraphQL can't see ruleset protection, so this stays on REST. */
async function listBranches(full: string, max: number): Promise<ApiBranch[]> {
  const all: ApiBranch[] = []
  for (let page = 1; all.length < max; page++) {
    const batch = await gh<ApiBranch[]>(`/repos/${full}/branches?per_page=100&page=${page}`)
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

/** The default branch first, then the rest up to MAX_BRANCHES. */
async function pickBranches(full: string, listed: ApiBranch[], def: string): Promise<ApiBranch[]> {
  const defBranch = listed.find(b => b.name === def) ?? (await gh<ApiBranch>(`/repos/${full}/branches/${encodeURIComponent(def)}`))
  return [defBranch, ...listed.filter(b => b.name !== def).slice(0, MAX_BRANCHES - 1)]
}

// ─── GraphQL (with a token): ~15 requests in parallel, a few seconds cold ────

const str = JSON.stringify // GraphQL string literals use JSON's escaping

interface GqlActor { name: string | null; avatarUrl: string | null; user: { login: string; avatarUrl: string } | null }
type StateCounts = { state: string; count: number }[]
interface GqlRollup {
  state: "SUCCESS" | "PENDING" | "EXPECTED" | "FAILURE" | "ERROR"
  contexts: { checkRunCount: number; checkRunCountsByState: StateCounts; statusContextCount: number; statusContextCountsByState: StateCounts }
}
interface GqlPull {
  number: number; title: string; url: string; state: "OPEN" | "CLOSED" | "MERGED"; isDraft: boolean; updatedAt: string
  baseRefName: string; headRepository: { nameWithOwner: string } | null
}
interface GqlRef {
  target: { oid: string; committedDate: string; author: GqlActor | null; statusCheckRollup: GqlRollup | null } | null
  associatedPullRequests: { nodes: GqlPull[] }
}
interface GqlCompare { aheadBy: number; behindBy: number; commits: { nodes: { oid: string; committedDate: string }[] } }

// associatedPullRequests ignores orderBy and lists oldest first, so `last` gets the recent ones.
const DETAIL_FRAGMENTS = `
fragment Head on Ref {
  target { ... on Commit {
    oid committedDate
    author { name avatarUrl user { login avatarUrl } }
    statusCheckRollup { state contexts {
      checkRunCount checkRunCountsByState { state count }
      statusContextCount statusContextCountsByState { state count } } }
  } }
  associatedPullRequests(last: 5) {
    nodes { number title url state isDraft updatedAt baseRefName headRepository { nameWithOwner } }
  }
}
fragment Diff on Comparison { aheadBy behindBy commits(first: 100) { nodes { oid committedDate } } }`

function actor(a: GqlActor | null): Person {
  // GitHub App avatars live under /in/<app id>.
  if (a?.user) return { login: a.user.login, avatarUrl: a.user.avatarUrl, isBot: a.user.login.endsWith("[bot]") || a.user.avatarUrl.includes("/in/") }
  // Bots aren't Users; their commit identity carries the name and avatar.
  const login = a?.name ?? "unknown"
  const isBot = login.endsWith("[bot]")
  return { login, avatarUrl: isBot ? (a?.avatarUrl ?? null) : null, isBot }
}

/** The latest run of each check plus commit statuses — the counts github.com shows for a commit. */
function rollupChecks(rollup: GqlRollup | null): CheckSummary | null {
  if (!rollup) return null
  const { checkRunCount, checkRunCountsByState, statusContextCount, statusContextCountsByState } = rollup.contexts
  const count = (counts: StateCounts, states: string[]) => counts.reduce((n, c) => n + (states.includes(c.state) ? c.count : 0), 0)
  const total = checkRunCount + statusContextCount
  if (!total) return null
  return {
    passed: count(checkRunCountsByState, ["SUCCESS", "NEUTRAL"]) + count(statusContextCountsByState, ["SUCCESS"]),
    total,
    state: rollup.state === "SUCCESS" ? "success" : rollup.state === "PENDING" || rollup.state === "EXPECTED" ? "pending" : "failure",
  }
}

/** The same-repo pull request updated most recently, as the REST path picks it. */
function latestPull(nodes: GqlPull[], fullName: string): PullRequestRef | null {
  const p = nodes.filter(pr => pr.headRepository?.nameWithOwner === fullName).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (!p) return null
  return { number: p.number, title: p.title, url: p.url, base: p.baseRefName, state: p.state === "MERGED" ? "merged" : p.state === "CLOSED" ? "closed" : p.isDraft ? "draft" : "open" }
}

async function buildGraphQL(owner: string, repo: string): Promise<RepoGraph> {
  type Meta = {
    viewer: { login: string; avatarUrl: string }
    repository: {
      nameWithOwner: string; url: string; description: string | null; isPrivate: boolean
      stargazerCount: number; forkCount: number
      issues: { totalCount: number }; pullRequests: { totalCount: number }
      defaultBranchRef: { name: string } | null
      refs: { totalCount: number }
    } | null
  }
  const [meta, listed] = await Promise.all([
    gql<Meta>(`query { viewer { login avatarUrl } repository(owner: ${str(owner)}, name: ${str(repo)}) {
      nameWithOwner url description isPrivate stargazerCount forkCount
      issues(states: OPEN) { totalCount } pullRequests(states: OPEN) { totalCount }
      defaultBranchRef { name } refs(refPrefix: "refs/heads/") { totalCount } } }`),
    listBranches(`${owner}/${repo}`, MAX_BRANCHES),
  ])
  const r = meta.repository
  if (!r?.defaultBranchRef) throw new GitHubError(404, "Not Found")
  const fullName = r.nameWithOwner
  const def = r.defaultBranchRef.name
  const picked = await pickBranches(fullName, listed, def)
  const [o, n] = fullName.split("/")

  // One query per chunk: each branch's head commit, checks and PR, plus its comparison with the default branch.
  const detail = async (chunk: ApiBranch[]): Promise<RawBranch[]> => {
    const compares = chunk.map((b, i) => (b.name === def ? "" : `c${i}: compare(headRef: ${str(`refs/heads/${b.name}`)}) { ...Diff }`)).join("\n")
    const heads = chunk.map((b, i) => `r${i}: ref(qualifiedName: ${str(`refs/heads/${b.name}`)}) { ...Head }`).join("\n")
    let data: { repository: Record<string, unknown> | null }
    try {
      data = await gql<typeof data>(`query { repository(owner: ${str(o)}, name: ${str(n)}) {
        ${compares ? `base: ref(qualifiedName: ${str(`refs/heads/${def}`)}) { ${compares} }` : ""}
        ${heads} } } ${DETAIL_FRAGMENTS}`)
    } catch (e) {
      // GitHub times out heavy queries (502/504); retry as two smaller ones.
      const retryable = (e instanceof GitHubError && e.status >= 500) || (e instanceof Error && e.name === "TimeoutError")
      if (!retryable || chunk.length === 1) throw e
      const mid = Math.ceil(chunk.length / 2)
      return (await Promise.all([detail(chunk.slice(0, mid)), detail(chunk.slice(mid))])).flat()
    }
    const repoData = data.repository ?? {}
    const cmps = (repoData.base ?? {}) as Record<string, GqlCompare | null>
    return chunk.flatMap((b, i): RawBranch[] => {
      const ref = repoData[`r${i}`] as GqlRef | null
      const head = ref?.target
      if (!head) return [] // deleted since it was listed
      const isDefault = b.name === def
      const cmp = isDefault ? null : cmps[`c${i}`]
      const commits = cmp?.commits.nodes ?? []
      return [{
        name: b.name, sha: head.oid, isDefault, isProtected: b.protected,
        orphan: !isDefault && !cmp, ahead: cmp?.aheadBy ?? 0, behind: cmp?.behindBy ?? 0, aheadShas: commits.map(c => c.oid),
        updatedAt: head.committedDate,
        // The branch's first commit of its own; a branch with none sits on the default branch at its head.
        forkedAt: isDefault || !cmp ? null : (commits[0]?.committedDate ?? head.committedDate),
        author: actor(head.author), pr: isDefault ? null : latestPull(ref.associatedPullRequests.nodes, fullName),
        checks: rollupChecks(head.statusCheckRollup),
      }]
    })
  }
  const chunks = Array.from({ length: Math.ceil(picked.length / CHUNK) }, (_, i) => picked.slice(i * CHUNK, (i + 1) * CHUNK))
  const raw = (await Promise.all(chunks.map(detail))).flat()

  return graphOf({
    owner: o, repo: n, fullName, htmlUrl: r.url, description: r.description, isPrivate: r.isPrivate, defaultBranch: def,
    stars: r.stargazerCount, forks: r.forkCount, openPulls: r.pullRequests.totalCount, openIssues: r.issues.totalCount,
    viewer: { login: meta.viewer.login, avatarUrl: meta.viewer.avatarUrl, isBot: false },
    totalBranches: r.refs.totalCount,
  }, raw)
}

// ─── REST (anonymous fallback): one compare per branch ───────────────────────

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
  // Default branches can carry hundreds of merge-queue runs; three pages is plenty for the de-duplicated count.
  const pages = Math.min(3, Math.ceil(runs.total_count / 100))
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

async function buildRest(owner: string, repo: string): Promise<RepoGraph> {
  const authed = !!token()

  const repoInfo = await gh<{
    full_name: string; html_url: string; description: string | null; private: boolean; default_branch: string
    stargazers_count: number; forks_count: number; open_issues_count: number
  }>(`/repos/${owner}/${repo}`)
  const fullName = repoInfo.full_name
  const def = repoInfo.default_branch

  const [viewer, listed, pulls, openPullCount] = await Promise.all([
    authed ? gh<ApiUser>("/user").then(u => ({ login: u.login, avatarUrl: u.avatar_url, isBot: false }) as Person).catch(() => null) : Promise.resolve(null),
    listBranches(fullName, 1000),
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
  const picked = await pickBranches(fullName, listed, def)

  // Most recently updated PR per head branch (same-repo PRs only).
  const prByHead = new Map<string, PullRequestRef>()
  for (const p of pulls) {
    if (p.head.repo?.full_name !== fullName || prByHead.has(p.head.ref)) continue
    prByHead.set(p.head.ref, {
      number: p.number, title: p.title, url: p.html_url, base: p.base.ref,
      state: p.merged_at ? "merged" : p.state === "closed" ? "closed" : p.draft ? "draft" : "open",
    })
  }

  const raw = await pool(picked, async (b): Promise<RawBranch> => {
    const isDefault = b.name === def
    let ahead = 0, behind = 0, orphan = false
    let commits: ApiCommit[] = []
    let head: ApiCommit | null = null
    if (!isDefault) {
      try {
        const cmp = await gh<ApiCompare>(`/repos/${fullName}/compare/${encodeURIComponent(def)}...${b.commit.sha}`)
        ahead = cmp.ahead_by
        behind = cmp.behind_by
        commits = cmp.commits
        if (ahead === 0) head = cmp.merge_base_commit
        else if (commits.length >= ahead) head = commits[commits.length - 1]
      } catch (e) {
        if (e instanceof GitHubError && e.status === 404) orphan = true
        else throw e
      }
    }
    if (!head) head = await gh<ApiCommit>(`/repos/${fullName}/commits/${b.commit.sha}`)
    const checks = authed ? await checksFor(fullName, b.commit.sha).catch(() => null) : null
    return {
      name: b.name, sha: b.commit.sha, isDefault, isProtected: b.protected,
      orphan, ahead, behind, aheadShas: commits.map(c => c.sha),
      updatedAt: commitDate(head),
      forkedAt: isDefault || orphan ? null : commits[0] ? commitDate(commits[0]) : commitDate(head),
      author: person(head), pr: isDefault ? null : (prByHead.get(b.name) ?? null), checks,
    }
  })

  const openPulls = openPullCount ?? pulls.filter(p => p.state === "open").length
  return graphOf({
    owner: fullName.split("/")[0], repo: fullName.split("/")[1], fullName, htmlUrl: repoInfo.html_url,
    description: repoInfo.description, isPrivate: repoInfo.private, defaultBranch: def,
    stars: repoInfo.stargazers_count, forks: repoInfo.forks_count,
    openPulls, openIssues: Math.max(0, repoInfo.open_issues_count - openPulls),
    viewer, totalBranches: listed.length,
  }, raw)
}

// ─── Cache ───────────────────────────────────────────────────────────────────

// The page and the API route are bundled separately; keep one cache per server process on globalThis.
const store = ((globalThis as { __repoGraphs?: { cache: Map<string, { at: number; graph: RepoGraph }>; inflight: Map<string, Promise<RepoGraph>> } })
  .__repoGraphs ??= { cache: new Map(), inflight: new Map() })

export async function getRepoGraph(owner: string, repo: string, opts: { fresh?: boolean } = {}): Promise<GraphResult> {
  const key = `${owner}/${repo}`.toLowerCase()
  const hit = store.cache.get(key)
  if (hit && !opts.fresh && Date.now() - hit.at < TTL_MS) return { ok: true, graph: hit.graph }
  try {
    let p = store.inflight.get(key)
    if (!p) {
      p = (token() ? buildGraphQL(owner, repo) : buildRest(owner, repo)).finally(() => store.inflight.delete(key))
      store.inflight.set(key, p)
    }
    const graph = await p
    store.cache.set(key, { at: Date.now(), graph })
    return { ok: true, graph }
  } catch (e) {
    if (e instanceof GitHubError) {
      if (e.rateLimited)
        return { ok: false, reason: "rate-limited", message: token() ? "GitHub API rate limit reached. Try again in a few minutes." : "GitHub’s anonymous API limit (60 requests/hour) was reached. Set GITHUB_TOKEN or sign in with the GitHub CLI to raise it." }
      if (e.status === 404) return { ok: false, reason: "not-found", message: `${owner}/${repo} isn’t a public repository, or it doesn’t exist.` }
      return { ok: false, reason: "error", message: e.message }
    }
    if (e instanceof Error && e.name === "TimeoutError") return { ok: false, reason: "error", message: "GitHub took too long to respond. Try again in a moment." }
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : "Unknown error" }
  }
}
