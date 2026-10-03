import type { Metadata } from "next"
import { getRepoGraph } from "@/lib/github"
import { BranchesPage, type Tab, type View } from "@/components/branches/branches-page"
import { GraphError } from "@/components/branches/graph-states"

const TABS: Tab[] = ["overview", "yours", "active", "stale", "all"]

export async function generateMetadata(props: PageProps<"/[owner]/[repo]/branches">): Promise<Metadata> {
  const { owner, repo } = await props.params
  return { title: `Branches · ${owner}/${repo}` }
}

export default async function Page(props: PageProps<"/[owner]/[repo]/branches">) {
  const { owner, repo } = await props.params
  const sp = await props.searchParams
  const view: View = sp.view === "list" ? "list" : "tree"
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview"
  const result = await getRepoGraph(owner, repo, { fresh: sp.fresh !== undefined })
  if (!result.ok) return <GraphError owner={owner} repo={repo} reason={result.reason} message={result.message} />
  return <BranchesPage key={result.graph.fullName} graph={result.graph} initialView={view} initialTab={tab} />
}
