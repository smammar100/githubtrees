import type { Metadata } from "next"
import { getPullHead, getRepoGraph } from "@/lib/github"
import { resolveRef } from "@/lib/github-url"
import { BranchesPage, type Tab, type View } from "@/components/branches/branches-page"
import { GraphError } from "@/components/branches/graph-states"

const TABS: Tab[] = ["overview", "yours", "active", "stale", "all"]
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function generateMetadata(props: PageProps<"/[owner]/[repo]/branches">): Promise<Metadata> {
  const { owner, repo } = await props.params
  const ref = one((await props.searchParams).branch)?.trim()
  // Shares the page's in-flight build or cached graph, so this costs no extra GitHub requests.
  const result = ref ? await getRepoGraph(owner, repo, { include: ref }) : null
  const branch = ref && result?.ok ? resolveRef(ref, result.graph.branches.map(b => b.name)) : null
  return { title: branch ? `${branch} · Branches · ${owner}/${repo}` : `Branches · ${owner}/${repo}` }
}

export default async function Page(props: PageProps<"/[owner]/[repo]/branches">) {
  const { owner, repo } = await props.params
  const sp = await props.searchParams
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview"

  // A shared link can point at a branch (?branch=, from …/tree/<branch>) or a pull request (?pr=, from …/pull/<n>).
  let branch = one(sp.branch)?.trim() || undefined
  let notice: string | undefined
  const pr = Number(one(sp.pr))
  if (!branch && Number.isInteger(pr) && pr > 0) {
    const pull = await getPullHead(owner, repo, pr)
    if (!pull) notice = `Couldn’t find pull request #${pr} in ${owner}/${repo}.`
    else if (pull.head) branch = pull.head
    else {
      branch = pull.base
      notice = `#${pr} comes from a fork (${pull.label}), so its branch isn’t in this repository. Showing its base branch, ${pull.base}.`
    }
  }
  const view: View = sp.view === "list" && !branch ? "list" : "tree"

  const result = await getRepoGraph(owner, repo, { fresh: sp.fresh !== undefined, include: branch })
  if (!result.ok) return <GraphError owner={owner} repo={repo} reason={result.reason} message={result.message} />
  // Keyed by the linked branch too, so following another link into the same repository re-focuses the tree.
  return <BranchesPage key={`${result.graph.fullName}\n${branch ?? ""}\n${notice ?? ""}`} graph={result.graph} initialView={view} initialTab={tab} initialBranch={branch} notice={notice} />
}
