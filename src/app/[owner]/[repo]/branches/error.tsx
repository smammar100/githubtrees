"use client"

import { useParams } from "next/navigation"
import { GraphError } from "@/components/branches/graph-states"

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  return <GraphError owner={owner} repo={repo} reason="error" message="Something went wrong while building the branch graph." onRetry={retry} />
}
