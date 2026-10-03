import {
  CodeIcon,
  GearIcon,
  GitPullRequestIcon,
  GraphIcon,
  InboxIcon,
  IssueOpenedIcon,
  MarkGithubIcon,
  PlayIcon,
  ShieldIcon,
  TableIcon,
  ThreeBarsIcon,
} from "@primer/octicons-react"
import type { Person } from "@/lib/types"
import { Avatar, Counter } from "./branches/primitives"
import { CreateMenu, RepoSwitcher, SearchButton } from "./repo-header-islands"

/**
 * github.com's repository header. A Server Component: everything but the repo switcher, the search button and the
 * create menu is static, so it ships as HTML with nothing to hydrate.
 */
export function RepoHeader({
  owner,
  repo,
  isPrivate = false,
  openIssues,
  openPulls,
  viewer,
}: {
  owner: string
  repo: string
  isPrivate?: boolean
  openIssues?: number
  openPulls?: number
  viewer?: Person | null
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
        <SearchButton />
        <span className="hidden h-5 w-px flex-none bg-border-default md:block" />
        <CreateMenu repoUrl={gh} />
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
