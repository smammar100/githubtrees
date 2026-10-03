"use client"

import { useParams } from "next/navigation"
import { GraphError } from "@/components/branches/graph-states"
import { RepoHeader } from "@/components/repo-header"

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  return (
    <div className="flex min-h-screen flex-col">
      <RepoHeader owner={owner} repo={repo} />
      <GraphError owner={owner} repo={repo} reason="error" message="Something went wrong while building the branch graph." onRetry={retry} />
    </div>
  )
}
