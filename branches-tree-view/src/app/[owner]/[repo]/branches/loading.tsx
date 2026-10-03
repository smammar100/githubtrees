"use client"

import { useParams } from "next/navigation"
import { GraphLoading } from "@/components/branches/graph-states"

export default function Loading() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  return <GraphLoading owner={owner} repo={repo} />
}
