type PRState = "open" | "draft" | "merged" | "closed"

export interface Person {
  login: string
  avatarUrl: string | null
  isBot: boolean
}

export interface PullRequestRef {
  number: number
  state: PRState
  title: string
  url: string
  base: string
}

export interface CheckSummary {
  passed: number
  total: number
  state: "success" | "failure" | "pending"
}

/**
 * How a branch's parent was determined.
 * - `default`: merge-base sits on the default branch (known)
 * - `pr`: the branch's pull request targets the parent (known)
 * - `ancestry`: the parent's tip is contained in this branch's unique commits (inferred)
 * - `manual`: set by the viewer on this device
 */
type ParentSource = "default" | "pr" | "ancestry" | "manual"

export interface Branch {
  name: string
  sha: string
  isDefault: boolean
  parent: string | null
  parentSource: ParentSource | null
  /** PR base branch that no longer exists; the branch is shown attached to the default branch. */
  parentDeleted?: string
  orphan: boolean
  ahead: number
  behind: number
  /** ISO date of the head commit */
  updatedAt: string
  /** ISO date of the fork point (first commit not on the default branch, or parent tip for stacked branches) */
  forkedAt: string | null
  author: Person
  pr: PullRequestRef | null
  checks: CheckSummary | null
}

export interface RepoGraph {
  owner: string
  repo: string
  fullName: string
  htmlUrl: string
  description: string | null
  isPrivate: boolean
  defaultBranch: string
  stars: number
  forks: number
  openIssues: number
  openPulls: number
  viewer: Person | null
  branches: Branch[]
  totalBranches: number
  commitsScanned: number
  fetchedAt: string
}

export type GraphResult =
  | { ok: true; graph: RepoGraph }
  | { ok: false; reason: "not-found" | "rate-limited" | "error"; message: string }
