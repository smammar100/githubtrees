"use client"

import { useRouter } from "next/navigation"
import { Button, buttonVariants } from "@/components/ui/button"
import { RepoHeader } from "@/components/repo-header"
import { cn } from "@/lib/utils"
import { UnderlineTabs } from "./primitives"

function Shell({ owner, repo, children }: { owner: string; repo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <RepoHeader owner={owner} repo={repo} />
      <main className="mx-auto box-border w-full max-w-[1344px] px-4 pt-6 pb-16 md:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl leading-9 font-normal">Branches</h1>
          <Button disabled>New branch</Button>
        </div>
        <div className="mt-6 border-b border-border-default">
          <UnderlineTabs tabs={[["overview", "Overview"], ["active", "Active"], ["stale", "Stale"], ["all", "All"]]} value="overview" />
        </div>
        <div
          className="relative mt-4 h-[680px] animate-view-in overflow-hidden rounded-[14px] border border-border-default bg-canvas-subtle"
          style={{ backgroundImage: "radial-gradient(var(--borderColor-default) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}

const SKELETONS: [number, number, number][] = [[0, 230, 90], [410, 90, 150], [410, 330, 120], [820, 0, 170], [820, 150, 110], [820, 300, 150], [820, 450, 130]]

export function GraphLoading({ owner, repo }: { owner: string; repo: string }) {
  return (
    <Shell owner={owner} repo={repo}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: "translate(80px, 70px) scale(.8)" }}>
        {SKELETONS.map(([x, y, w], i) => (
          <div key={i} className="absolute flex w-[270px] animate-skel flex-col gap-2" style={{ left: x, top: y, animationDelay: `${i * 0.12}s` }}>
            <div className="h-2.5 w-[110px] rounded bg-border-default" />
            <div className="box-border flex h-24 flex-col gap-3.5 rounded-xl border border-border-default bg-canvas p-4">
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-md bg-canvas-inset" />
                <div className="h-3 rounded bg-canvas-inset" style={{ width: w }} />
              </div>
              <div className="h-1 rounded-sm bg-canvas-inset" />
            </div>
          </div>
        ))}
      </div>
      <div role="status" className="absolute top-16 left-1/2 -translate-x-1/2 rounded-[20px] border border-border-default bg-canvas px-3.5 py-2 text-[12.5px] whitespace-nowrap text-fg-default">
        Building branch graph from {owner}/{repo} commit history…
      </div>
    </Shell>
  )
}

export function GraphError({
  owner, repo, reason, message, onRetry,
}: {
  owner: string
  repo: string
  reason: "not-found" | "rate-limited" | "error"
  message: string
  onRetry?: () => void
}) {
  const router = useRouter()
  const title = reason === "not-found" ? "Repository not found" : reason === "rate-limited" ? "GitHub rate limit reached" : "Couldn’t build the branch graph"
  const retry = () => {
    if (onRetry) onRetry()
    else router.replace(`/${owner}/${repo}/branches?fresh=1`)
  }
  return (
    <Shell owner={owner} repo={repo}>
      <div className="absolute top-1/2 left-1/2 box-border flex w-[380px] max-w-[calc(100%-40px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 rounded-[14px] border border-border-default bg-canvas p-[22px] shadow-floating-lg">
        <span className="grid size-8 place-content-center rounded-[9px] bg-danger-subtle font-semibold text-fg-danger">!</span>
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] text-pretty text-fg-muted">{message}</span>
        <div className="mt-1.5 flex gap-2">
          {reason === "not-found" ? (
            <Button onClick={() => router.push("/primer/react/branches")}>Open primer/react</Button>
          ) : (
            <Button onClick={retry}>Try again</Button>
          )}
          <a
            href={`https://github.com/${owner}/${repo}/branches`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "text-(--button-default-fgColor-rest) hover:no-underline hover:text-(--button-default-fgColor-rest)")}
          >
            View on GitHub
          </a>
        </div>
      </div>
    </Shell>
  )
}
