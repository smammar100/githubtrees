"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DotFillIcon,
  KebabHorizontalIcon,
  SearchIcon,
  ShieldCheckIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
} from "@primer/octicons-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Branch } from "@/lib/types"
import { githubUrl, relativeTime } from "@/lib/branch-utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, BranchName, PullRequestBadge } from "./primitives"
import type { Tab } from "./branches-page"

const PAGE = 20
// Column widths measured from github.com/{repo}/branches
const GRID = "grid grid-cols-[minmax(0,1fr)_70px] md:grid-cols-[minmax(0,1fr)_180px_150px_70px] lg:grid-cols-[minmax(0,1fr)_180px_125px_150px_113px_70px] items-center pl-4"

interface Section { key: string; title: string; rows: Branch[]; more?: Tab; isDefault?: boolean }

export function ListView({
  fullName, defaultBranch, tab, setTab, now, sections, deleted, onDelete, onRestore, onShowInTree,
}: {
  fullName: string
  defaultBranch: string
  tab: Tab
  setTab: (t: Tab) => void
  now: number
  sections: (q: string) => Section[]
  deleted: Set<string>
  onDelete: (name: string) => void
  onRestore: (name: string) => void
  onShowInTree: (name: string) => void
}) {
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const secs = useMemo(() => sections(q.trim().toLowerCase()), [sections, q])
  const scale = useMemo(() => {
    const all = secs.flatMap(s => s.rows)
    return { a: Math.max(1, ...all.map(b => b.ahead)), b: Math.max(1, ...all.map(b => b.behind)) }
  }, [secs])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) setQ("")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const paged = tab !== "overview" && secs.length === 1
  const total = paged ? secs[0].rows.length : 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const curPage = Math.min(page, pages - 1)

  return (
    <div className="animate-view-in">
      <label className="mt-4 flex h-8 items-center gap-2 rounded-md border border-border-default bg-canvas px-2 text-sm focus-within:border-fg-accent focus-within:shadow-[0_0_0_1px_var(--fgColor-accent)]">
        <SearchIcon size={16} className="text-fg-muted" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setPage(0) }}
          placeholder="Search branches…"
          aria-label="Search branches"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} title="Clear search" className="grid size-6 cursor-pointer place-content-center rounded-md text-fg-muted hover:bg-control-hover">
            <XIcon size={14} />
          </button>
        )}
      </label>

      {secs.every(s => !s.rows.length) && (
        <div className="mt-4 rounded-md border border-border-default px-6 py-12 text-center">
          <div className="text-base font-semibold">{q ? `No branches match “${q.trim()}”` : emptyText(tab)}</div>
          {q && <button type="button" className="mt-2 cursor-pointer text-sm text-fg-accent hover:underline" onClick={() => setQ("")}>Clear search</button>}
        </div>
      )}

      {secs.filter(s => s.rows.length).map(sec => {
        const rows = paged ? sec.rows.slice(curPage * PAGE, curPage * PAGE + PAGE) : sec.rows
        return (
          <section key={sec.key}>
            {tab === "overview" ? (
              <h2 className="mt-4 mb-2 animate-view-in text-base font-semibold [animation-delay:.05s]">{sec.title}</h2>
            ) : (
              <h2 className="sr-only">{sec.title}</h2>
            )}
            <div className={cn("overflow-hidden rounded-md border border-border-default bg-canvas", tab !== "overview" && "mt-4")}>
              <div className={cn(GRID, "h-[38px] border-b border-border-default bg-canvas-subtle text-sm text-fg-muted")}>
                <span>Branch</span>
                <span className="hidden md:block">Updated</span>
                <span className="hidden lg:block">Check status</span>
                <span className="hidden md:grid grid-cols-[56px_1px_1fr] gap-1.5"><span className="text-right">Behind</span><span className="h-4 w-px self-center bg-border-default" /><span>Ahead</span></span>
                <span className="hidden lg:block">Pull request</span>
                <span className="sr-only">Actions</span>
              </div>
              {rows.map(b => (
                <Row
                  key={b.name}
                  b={b}
                  fullName={fullName}
                  defaultBranch={defaultBranch}
                  now={now}
                  scale={scale}
                  isDeleted={deleted.has(b.name)}
                  onDelete={onDelete}
                  onRestore={onRestore}
                  onShowInTree={onShowInTree}
                />
              ))}
            </div>
            {sec.more && (
              <button type="button" onClick={() => setTab(sec.more!)} className="mt-2 cursor-pointer text-sm text-fg-accent hover:underline">
                View more branches
              </button>
            )}
          </section>
        )
      })}

      {paged && pages > 1 && (
        <nav aria-label="Pagination" className="mt-5 flex items-center justify-center gap-1 text-sm">
          <PagerButton disabled={curPage === 0} onClick={() => setPage(curPage - 1)}><ChevronLeftIcon size={16} />Previous</PagerButton>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-current={i === curPage ? "page" : undefined}
              onClick={() => setPage(i)}
              className={cn("h-8 min-w-8 cursor-pointer rounded-md px-2", i === curPage ? "bg-fg-accent text-fg-on-emphasis" : "hover:bg-control-hover")}
            >
              {i + 1}
            </button>
          ))}
          <PagerButton disabled={curPage >= pages - 1} onClick={() => setPage(curPage + 1)}>Next<ChevronRightIcon size={16} /></PagerButton>
        </nav>
      )}
    </div>
  )
}

const emptyText = (tab: Tab) =>
  tab === "yours" ? "You haven’t pushed any branches to this repository." : tab === "stale" ? "There aren’t any stale branches." : tab === "active" ? "There aren’t any active branches." : "There aren’t any branches."

function PagerButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-fg-accent hover:bg-control-hover disabled:cursor-default disabled:text-fg-subtle disabled:hover:bg-transparent">
      {children}
    </button>
  )
}

function Row({
  b, fullName, defaultBranch, now, scale, isDeleted, onDelete, onRestore, onShowInTree,
}: {
  b: Branch
  fullName: string
  defaultBranch: string
  now: number
  scale: { a: number; b: number }
  isDeleted: boolean
  onDelete: (name: string) => void
  onRestore: (name: string) => void
  onShowInTree: (name: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(b.name)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn’t copy to the clipboard")
    }
  }
  return (
    <div className={cn(GRID, "h-[50px] border-b border-border-muted text-sm last:border-b-0", isDeleted && "bg-canvas-subtle")}>
      <span className="flex min-w-0 items-center gap-2">
        {isDeleted ? (
          <span className="truncate font-mono text-xs text-fg-muted line-through">{b.name}</span>
        ) : (
          <a href={b.local ? undefined : githubUrl.tree(fullName, b.name)} target="_blank" rel="noreferrer" className="flex min-w-0 hover:no-underline">
            <BranchName name={b.name} />
          </a>
        )}
        <button type="button" onClick={copy} title="Copy branch name to clipboard" aria-label="Copy branch name to clipboard" className="grid size-7 flex-none cursor-pointer place-content-center rounded-md text-fg-muted hover:bg-control-hover">
          {copied ? <CheckIcon size={16} className="text-fg-success" /> : <CopyIcon size={16} />}
        </button>
        {!b.local && !isDeleted && (
          <a href={githubUrl.rules(fullName, b.name)} target="_blank" rel="noreferrer" title="View rules" aria-label={`View rules for ${b.name}`} className="grid size-7 flex-none place-content-center rounded-md text-fg-muted hover:bg-control-hover hover:text-fg-muted">
            <ShieldCheckIcon size={16} />
          </a>
        )}
        {b.local && <span className="rounded-full border border-accent-muted px-1.5 text-xs text-fg-accent">Local</span>}
      </span>
      <span className="hidden min-w-0 items-center gap-2 md:flex">
        <Avatar person={b.author} />
        <span className="truncate text-fg-default">{relativeTime(b.updatedAt, now)}</span>
      </span>
      <span className="hidden text-[13px] lg:block">
        {b.checks ? (
          <a href={githubUrl.checks(fullName, b.sha)} target="_blank" rel="noreferrer" title={`${b.checks.passed} / ${b.checks.total} checks OK`} className="inline-flex items-center gap-2 text-fg-default hover:text-fg-accent hover:no-underline">
            <CheckMark state={b.checks.state} />
            {b.checks.passed} / {b.checks.total}
          </a>
        ) : null}
      </span>
      <span className="hidden md:block">
        {b.isDefault ? (
          <span className="inline-flex h-5 items-center rounded-full border border-border-default px-1.5 text-xs font-medium">Default</span>
        ) : b.orphan ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <span title={`${b.behind} commits behind, ${b.ahead} commits ahead of ${defaultBranch}`} className="grid grid-cols-[56px_1px_1fr] gap-x-1.5 text-xs tabular-nums">
            <span className="text-right text-fg-muted">{b.behind}</span>
            <span className="row-span-2 h-7 w-px bg-border-default" />
            <span className="text-fg-muted">{b.ahead}</span>
            <span className="flex h-1 justify-end"><span className="rounded-l-sm bg-fg-subtle" style={{ width: `${(b.behind / scale.b) * 100}%` }} /></span>
            <span className="flex h-1"><span className="rounded-r-sm bg-fg-subtle" style={{ width: `${(b.ahead / scale.a) * 100}%` }} /></span>
          </span>
        )}
      </span>
      <span className="hidden lg:block">{b.pr && <PullRequestBadge pr={b.pr} />}</span>
      <span className="flex items-center justify-end gap-1 pr-2">
        {b.isDefault ? null : isDeleted ? (
          <button type="button" onClick={() => onRestore(b.name)} className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border-default bg-canvas-subtle px-2 text-xs font-medium shadow-resting hover:bg-canvas-inset">
            <UndoIcon size={14} />Restore
          </button>
        ) : (
          <button type="button" onClick={() => onDelete(b.name)} title={`Delete ${b.name}`} aria-label={`Delete ${b.name}`} className="grid size-7 cursor-pointer place-content-center rounded-md text-fg-muted hover:bg-danger-subtle hover:text-fg-danger">
            <TrashIcon size={16} />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Branch menu" className="grid size-7 cursor-pointer place-content-center rounded-md text-fg-muted hover:bg-control-hover aria-expanded:bg-control-hover">
            <KebabHorizontalIcon size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl p-2 shadow-floating ring-0">
            {!isDeleted && <DropdownMenuItem className="px-2 py-1.5" onClick={() => onShowInTree(b.name)}>Show in tree</DropdownMenuItem>}
            {!b.local && (
              <>
                <DropdownMenuItem className="px-2 py-1.5" onClick={() => window.open(githubUrl.activity(fullName, b.name), "_blank")}>Activity</DropdownMenuItem>
                <DropdownMenuItem className="px-2 py-1.5" onClick={() => window.open(githubUrl.commits(fullName, b.name), "_blank")}>View commits</DropdownMenuItem>
                {!b.isDefault && !b.orphan && (
                  <DropdownMenuItem className="px-2 py-1.5" onClick={() => window.open(githubUrl.compare(fullName, b.parent ?? defaultBranch, b.name), "_blank")}>Compare</DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="px-2 py-1.5" onClick={copy}>Copy branch name</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  )
}

/** github.com's list uses bare check / x marks rather than filled circles */
function CheckMark({ state }: { state: "success" | "failure" | "pending" }) {
  if (state === "success") return <span className="flex text-fg-success"><CheckIcon size={16} /></span>
  if (state === "failure") return <span className="flex text-fg-danger"><XIcon size={16} /></span>
  return <span className="flex text-(--borderColor-attention-emphasis)"><DotFillIcon size={16} /></span>
}
