"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CodeIcon,
  GearIcon,
  GitPullRequestIcon,
  GraphIcon,
  InboxIcon,
  IssueOpenedIcon,
  LockIcon,
  MarkGithubIcon,
  PlayIcon,
  PlusIcon,
  RepoIcon,
  ShieldIcon,
  TableIcon,
  ThreeBarsIcon,
  TriangleDownIcon,
} from "@primer/octicons-react"
import type { Person } from "@/lib/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, Counter } from "./branches/primitives"

const PRIMER_REPOS = ["primer/react", "primer/css", "primer/primitives", "primer/octicons", "primer/behaviors", "primer/view_components", "primer/brand"]

export function RepoHeader({
  owner,
  repo,
  isPrivate = false,
  openIssues,
  openPulls,
  viewer,
  onNewBranch,
}: {
  owner: string
  repo: string
  isPrivate?: boolean
  openIssues?: number
  openPulls?: number
  viewer?: Person | null
  onNewBranch?: () => void
}) {
  const full = `${owner}/${repo}`
  const gh = `https://github.com/${full}`
  const iconBtn = "grid size-8 flex-none cursor-pointer place-content-center rounded-md border border-border-default text-fg-muted hover:bg-control-hover"
  const tabs = [
    { label: "Code", Icon: CodeIcon, href: gh, active: true },
    { label: "Issues", Icon: IssueOpenedIcon, href: `${gh}/issues`, count: openIssues },
    { label: "Pull requests", Icon: GitPullRequestIcon, href: `${gh}/pulls`, count: openPulls },
    { label: "Actions", Icon: PlayIcon, href: `${gh}/actions` },
    { label: "Projects", Icon: TableIcon, href: `${gh}/projects` },
    { label: "Security", Icon: ShieldIcon, href: `${gh}/security` },
    { label: "Insights", Icon: GraphIcon, href: `${gh}/pulse` },
    { label: "Settings", Icon: GearIcon, href: `${gh}/settings` },
  ]
  return (
    <header className="border-b border-border-default bg-canvas-subtle shadow-[inset_0_-1px_0_var(--borderColor-default)]">
      <div className="flex min-w-0 items-center gap-3 px-4 pt-4 pb-2">
        <button type="button" title="Open navigation" aria-label="Open navigation" className={iconBtn}><ThreeBarsIcon size={16} /></button>
        <a href="https://github.com" aria-label="GitHub home" className="flex flex-none text-fg-default hover:text-fg-default"><MarkGithubIcon size={32} /></a>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-base">
          <a href={`https://github.com/${owner}`} target="_blank" rel="noreferrer" className="truncate rounded-md px-1.5 text-fg-default hover:bg-control-hover hover:no-underline">{owner}</a>
          <span className="text-fg-muted">/</span>
          <RepoSwitcher full={full} repo={repo} isPrivate={isPrivate} />
        </nav>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }))}
          className="hidden h-8 w-60 max-w-[30vw] flex-none cursor-text items-center gap-2 rounded-md border border-border-default bg-canvas px-2 text-sm text-fg-muted md:flex"
        >
          <span className="flex"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" /></svg></span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            Type <kbd className="rounded border border-border-default bg-canvas px-1 font-mono text-[11px] leading-4">/</kbd> to search
          </span>
        </button>
        <span className="hidden h-5 w-px flex-none bg-border-default md:block" />
        <DropdownMenu>
          <DropdownMenuTrigger title="Create new" aria-label="Create new" className="flex h-8 flex-none cursor-pointer items-center gap-0.5 rounded-md border border-border-default pr-1.5 pl-2 text-fg-muted hover:bg-control-hover aria-expanded:bg-control-hover">
            <PlusIcon size={16} /><TriangleDownIcon size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl p-2 shadow-floating ring-0">
            {onNewBranch && <DropdownMenuItem className="px-2 py-1.5" onClick={onNewBranch}>New branch</DropdownMenuItem>}
            <DropdownMenuItem className="px-2 py-1.5" onClick={() => window.open(`${gh}/issues/new`, "_blank")}>New issue</DropdownMenuItem>
            <DropdownMenuItem className="px-2 py-1.5" onClick={() => window.open(`${gh}/compare`, "_blank")}>New pull request</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <a href="https://github.com/issues" target="_blank" rel="noreferrer" title="Your issues" aria-label="Your issues" className={iconBtn}><IssueOpenedIcon size={16} /></a>
        <a href="https://github.com/pulls" target="_blank" rel="noreferrer" title="Your pull requests" aria-label="Your pull requests" className={iconBtn}><GitPullRequestIcon size={16} /></a>
        <span className="relative flex-none">
          <a href="https://github.com/notifications" target="_blank" rel="noreferrer" title="Notifications" aria-label="Notifications" className={iconBtn}><InboxIcon size={16} /></a>
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-fg-accent shadow-[0_0_0_2px_var(--bgColor-muted)]" />
        </span>
        {viewer ? (
          <a href={`https://github.com/${viewer.login}`} target="_blank" rel="noreferrer" title={viewer.login} className="flex flex-none"><Avatar person={viewer} size={32} /></a>
        ) : (
          <a href="https://github.com/login" target="_blank" rel="noreferrer" className="flex-none text-sm">Sign in</a>
        )}
      </div>
      <nav aria-label="Repository" className="flex items-center gap-2 overflow-x-auto overflow-y-hidden px-4">
        {tabs.map(t => (
          <a
            key={t.label}
            href={t.href}
            target={t.active ? undefined : "_blank"}
            rel="noreferrer"
            aria-current={t.active ? "page" : undefined}
            className="group relative flex h-12 items-center px-2 text-sm whitespace-nowrap text-fg-default hover:no-underline hover:text-fg-default"
            style={{ fontWeight: t.active ? 600 : 400 }}
          >
            <span className="flex items-center gap-2 rounded-md px-0 group-hover:bg-control-hover">
              <span className="flex text-fg-muted"><t.Icon size={16} /></span>
              {t.label}
              {t.count !== undefined && t.count > 0 && <Counter>{t.count.toLocaleString()}</Counter>}
            </span>
            {t.active && <span className="absolute right-0 bottom-0 left-0 h-0.5 rounded-md bg-underline-active" />}
          </a>
        ))}
      </nav>
    </header>
  )
}

function RepoSwitcher({ full, repo, isPrivate }: { full: string; repo: string; isPrivate: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const go = (target: string) => {
    const m = target.trim().replace(/^https?:\/\/github\.com\//, "").match(/^([\w.-]+)\/([\w.-]+)/)
    if (!m) return
    setOpen(false)
    setValue("")
    router.push(`/${m[1]}/${m[2]}/branches`)
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
            onChange={e => setValue(e.target.value)}
            placeholder="owner/repo — any public repository"
            className="h-8 w-full rounded-md border border-border-default px-2 font-mono text-[13px] outline-none focus:border-fg-accent focus:shadow-[0_0_0_1px_var(--fgColor-accent)]"
          />
        </form>
        <div className="px-4 pt-2 pb-1 text-xs font-semibold text-fg-muted">Primer repositories</div>
        <div className="pb-2">
          {PRIMER_REPOS.map(r => (
            <Link
              key={r}
              href={`/${r}/branches`}
              onClick={() => setOpen(false)}
              className="mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-default hover:bg-control-hover hover:no-underline hover:text-fg-default"
            >
              <span className="flex text-fg-muted"><RepoIcon size={16} /></span>
              <span className="flex-1">{r}</span>
              {r.toLowerCase() === full.toLowerCase() && <span className="text-xs text-fg-muted">current</span>}
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
