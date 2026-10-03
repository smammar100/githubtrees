"use client"

// The interactive parts of the server-rendered RepoHeader.

import { useState, useTransition } from "react"
import Link, { useLinkStatus } from "next/link"
import { useRouter } from "next/navigation"
import { LockIcon, PlusIcon, RepoIcon, SearchIcon, TriangleDownIcon } from "@primer/octicons-react"
import { parseGitHubUrl, toTreeHref } from "@/lib/github-url"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const PRIMER_REPOS = ["primer/react", "primer/css", "primer/primitives", "primer/octicons", "primer/behaviors", "primer/view_components", "primer/brand"]

/** Opens the canvas search, like github.com's header search opens its own. */
export function SearchButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }))}
      className="hidden h-8 w-60 max-w-[30vw] flex-none cursor-text items-center gap-2 rounded-md border border-border-default bg-canvas px-2 text-sm text-fg-muted md:flex"
    >
      <span className="flex"><SearchIcon size={16} /></span>
      <span className="flex items-center gap-1 whitespace-nowrap">
        Type <kbd className="rounded border border-border-default bg-canvas px-1 font-mono text-[11px] leading-4">/</kbd> to search
      </span>
    </button>
  )
}

export function CreateMenu({ repoUrl }: { repoUrl: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger title="Create new" aria-label="Create new" className="flex h-8 flex-none cursor-pointer items-center gap-0.5 rounded-md border border-border-default pr-1.5 pl-2 text-fg-muted hover:bg-control-hover aria-expanded:bg-control-hover">
        <PlusIcon size={16} /><TriangleDownIcon size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl p-2 shadow-floating ring-0">
        <DropdownMenuItem className="px-2 py-1.5" onClick={() => window.open(`${repoUrl}/issues/new`, "_blank")}>New issue</DropdownMenuItem>
        <DropdownMenuItem className="px-2 py-1.5" onClick={() => window.open(`${repoUrl}/compare`, "_blank")}>New pull request</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Shown inside a Link while the page it opens is being built. */
function OpeningHint() {
  const { pending } = useLinkStatus()
  return pending ? <span role="status" className="text-xs text-fg-muted">Opening…</span> : null
}

export function RepoSwitcher({ full, repo, isPrivate }: { full: string; repo: string; isPrivate: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [invalid, setInvalid] = useState(false)
  // The popover stays open while the new tree is built; landing on another repository remounts the header.
  const [pending, startTransition] = useTransition()
  const go = (input: string) => {
    const target = parseGitHubUrl(input)
    if (!target) return setInvalid(true)
    startTransition(() => router.push(toTreeHref(target)))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 font-semibold whitespace-nowrap text-fg-default hover:bg-control-hover">
        <span className="flex text-fg-muted">{isPrivate ? <LockIcon size={14} /> : <RepoIcon size={14} />}</span>
        {repo}
        <span className="flex text-fg-muted"><TriangleDownIcon size={16} /></span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 rounded-xl p-0 shadow-floating ring-0">
        <form
          className="border-b border-border-muted p-2"
          onSubmit={e => { e.preventDefault(); go(value) }}
        >
          <input
            autoFocus
            value={value}
            onChange={e => { setValue(e.target.value); setInvalid(false) }}
            placeholder="owner/repo or any GitHub link"
            aria-invalid={invalid}
            aria-describedby="repo-switcher-hint"
            className="h-8 w-full rounded-md border border-border-default px-2 font-mono text-[13px] outline-none focus:border-fg-accent focus:shadow-[0_0_0_1px_var(--fgColor-accent)] aria-invalid:border-(--borderColor-danger-emphasis)"
          />
          <p id="repo-switcher-hint" role="status" className={cn("mt-1.5 text-xs", invalid ? "text-(--fgColor-danger)" : "text-fg-muted")}>
            {invalid ? "That isn’t a GitHub repository link." : pending ? "Building the tree…" : "Repository, branch, pull request or compare links all open the tree."}
          </p>
        </form>
        <div className="px-4 pt-2 pb-1 text-xs font-semibold text-fg-muted">Primer repositories</div>
        <div className="pb-2">
          {PRIMER_REPOS.map(r => {
            const row = "mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-default"
            const label = <><span className="flex text-fg-muted"><RepoIcon size={16} /></span><span className="flex-1">{r}</span></>
            return r.toLowerCase() === full.toLowerCase() ? (
              <div key={r} className={row}>{label}<span className="text-xs text-fg-muted">current</span></div>
            ) : (
              <Link key={r} href={`/${r}/branches`} className={cn(row, "hover:bg-control-hover hover:no-underline hover:text-fg-default")}>
                {label}
                <OpeningHint />
              </Link>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
