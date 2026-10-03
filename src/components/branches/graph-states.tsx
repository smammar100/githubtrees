"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, buttonVariants } from "@/components/ui/button"
import { OpenRepoButton } from "@/components/open-repo-dialog"
import { cn } from "@/lib/utils"
import { UnderlineTabs } from "./primitives"

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto box-border w-full max-w-[1344px] px-4 pt-6 pb-16 md:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl leading-9 font-normal">Branches</h1>
        <OpenRepoButton />
      </div>
      <div className="mt-6 border-b border-border-muted">
        <UnderlineTabs tabs={[["overview", "Overview"], ["active", "Active"], ["stale", "Stale"], ["all", "All"]]} value="overview" />
      </div>
      <div
        className="relative mt-4 h-[680px] overflow-hidden rounded-[14px] border border-border-default bg-canvas-subtle"
        style={{ backgroundImage: "radial-gradient(var(--borderColor-default) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
      >
        {children}
      </div>
    </main>
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
  const [pending, startTransition] = useTransition()
  const title = reason === "not-found" ? "Repository not found" : reason === "rate-limited" ? "GitHub rate limit reached" : "Couldn’t build the branch graph"
  const retry = () => {
    if (onRetry) onRetry()
    else startTransition(() => router.replace(`/${owner}/${repo}/branches?fresh=${Date.now()}`))
  }
  return (
    <Shell>
      <div className="absolute top-1/2 left-1/2 box-border flex w-[380px] max-w-[calc(100%-40px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 rounded-[14px] border border-border-default bg-canvas p-[22px] shadow-floating-lg">
        <span className="grid size-8 place-content-center rounded-[9px] bg-danger-subtle font-semibold text-fg-danger">!</span>
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] text-pretty text-fg-muted">{message}</span>
        <div className="mt-1.5 flex gap-2">
          {reason === "not-found" ? (
            <Button disabled={pending} onClick={() => startTransition(() => router.push("/primer/react/branches"))}>{pending ? "Opening…" : "Open primer/react"}</Button>
          ) : (
            <Button disabled={pending} onClick={retry}>{pending ? "Retrying…" : "Try again"}</Button>
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
