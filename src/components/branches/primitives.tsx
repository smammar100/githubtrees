"use client"

import { useMemo, useState } from "react"
import {
  CheckIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  TriangleDownIcon,
} from "@primer/octicons-react"
import { cn } from "@/lib/utils"
import { avatarColors, initials } from "@/lib/branch-utils"
import type { Branch, Person, PullRequestRef } from "@/lib/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function Avatar({ person, size = 20, className }: { person: Person; size?: number; className?: string }) {
  const [bg, fg] = avatarColors(person)
  const [failed, setFailed] = useState(false)
  const radius = person.isBot ? (size > 16 ? 6 : 4) : "50%"
  return (
    <span
      title={person.login}
      className={cn("inline-flex flex-none items-center justify-center overflow-hidden font-semibold shadow-[0_0_0_1px_var(--avatar-borderColor)]", className)}
      style={{ width: size, height: size, borderRadius: radius, background: bg, color: fg, fontSize: Math.max(8, Math.round(size * 0.45)) }}
    >
      {person.avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny remote avatars, no optimisation needed
        <img src={`${person.avatarUrl}${person.avatarUrl.includes("?") ? "&" : "?"}s=${size * 2}`} alt="" width={size} height={size} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials(person.login)
      )}
    </span>
  )
}

export function BranchName({ name, muted, className, size = "md" }: { name: string; muted?: boolean; className?: string; size?: "sm" | "md" }) {
  return (
    <span
      title={name}
      className={cn(
        "inline-block min-w-0 truncate rounded-md font-mono",
        size === "sm" ? "px-1.5 py-px text-xs leading-[18px]" : "px-1.5 py-0.5 text-xs leading-[18px]",
        muted ? "bg-neutral-muted text-fg-muted" : "bg-accent-subtle text-fg-accent",
        className,
      )}
    >
      {name}
    </span>
  )
}

export function Counter({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-[20px] bg-neutral-muted px-1.5 py-0.5 text-xs leading-none font-semibold text-fg-default">{children}</span>
}

const PR_STYLE: Record<PullRequestRef["state"], { color: string; border: string; Icon: typeof GitPullRequestIcon; label: string }> = {
  open: { color: "var(--fgColor-open)", border: "var(--borderColor-open-emphasis)", Icon: GitPullRequestIcon, label: "Open" },
  draft: { color: "var(--fgColor-draft)", border: "var(--borderColor-draft-emphasis)", Icon: GitPullRequestDraftIcon, label: "Draft" },
  merged: { color: "var(--fgColor-done)", border: "var(--borderColor-done-emphasis)", Icon: GitMergeIcon, label: "Merged" },
  closed: { color: "var(--fgColor-closed)", border: "var(--borderColor-closed-emphasis)", Icon: GitPullRequestClosedIcon, label: "Closed" },
}
export const prStyle = (pr: PullRequestRef) => PR_STYLE[pr.state]

type Tone = "default" | "secondary" | "attention"
const TONES: Record<Tone, [string, string]> = {
  default: ["var(--fgColor-default)", "var(--borderColor-default)"],
  secondary: ["var(--fgColor-muted)", "var(--borderColor-muted)"],
  attention: ["var(--fgColor-attention)", "var(--borderColor-attention-emphasis)"],
}

/** Primer Label used on cards: Default / PR / Stale / Active / Orphan */
export function StatusLabel({ branch, stale }: { branch: Branch; stale: boolean }) {
  let color: string, border: string, text: string, Icon: typeof GitPullRequestIcon | null = null
  if (branch.isDefault) [color, border, text] = [...TONES.default, "Default"]
  else if (branch.orphan) [color, border, text] = [...TONES.secondary, "Orphan"]
  else if (branch.pr) {
    const s = prStyle(branch.pr)
    ;[color, border, text, Icon] = [s.color, s.border, `#${branch.pr.number}`, s.Icon]
  } else if (stale) [color, border, text] = [...TONES.attention, "Stale"]
  else [color, border, text] = [...TONES.secondary, "Active"]
  return (
    <span
      title={branch.pr ? `${prStyle(branch.pr).label} pull request: ${branch.pr.title}` : undefined}
      className="inline-flex h-5 flex-none items-center gap-1 rounded-full border px-1.5 text-xs leading-none font-medium whitespace-nowrap"
      style={{ color, borderColor: border }}
    >
      {Icon && <Icon size={12} />}
      {text}
    </span>
  )
}

/** Primer PR badge used in the list view's "Pull request" column. */
export function PullRequestBadge({ pr }: { pr: PullRequestRef }) {
  const s = prStyle(pr)
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      title={`${s.label}: ${pr.title}`}
      className="inline-flex h-6 items-center gap-1 rounded-full border border-border-default bg-canvas px-2 text-xs font-medium text-fg-default hover:no-underline hover:bg-canvas-subtle"
    >
      <span style={{ color: s.color }} className="inline-flex"><s.Icon size={14} /></span>#{pr.number}
    </a>
  )
}

/** GitHub-style branch selector: a button that opens a filterable list of branches. */
export function BranchPicker({
  branches,
  value,
  onChange,
  exclude,
  label,
}: {
  branches: Branch[]
  value: string | null
  onChange: (name: string) => void
  exclude?: Set<string>
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const options = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return branches.filter(b => !exclude?.has(b.name) && (!ql || b.name.toLowerCase().includes(ql))).slice(0, 100)
  }, [branches, exclude, q])
  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQ("") }}>
      <PopoverTrigger className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border-default bg-canvas-subtle px-3 text-sm font-medium text-(--button-default-fgColor-rest) shadow-resting hover:bg-canvas-inset">
        <span className="text-fg-muted font-normal">{label}:</span>
        <span className="min-w-0 flex-1 truncate text-left font-mono text-[13px]">{value ?? "—"}</span>
        <TriangleDownIcon size={16} className="text-fg-muted" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] gap-0 rounded-xl p-0 shadow-floating ring-0">
        <div className="border-b border-border-muted p-2">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Find a branch…"
            className="h-8 w-full rounded-md border border-border-default px-2 font-mono text-[13px] outline-none focus:border-fg-accent focus:shadow-[0_0_0_1px_var(--fgColor-accent)]"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1.5">
          {options.length === 0 && <div className="px-4 py-3 text-xs text-fg-muted">Nothing to show</div>}
          {options.map(b => (
            <button
              key={b.name}
              type="button"
              onClick={() => { onChange(b.name); setOpen(false); setQ("") }}
              className="mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-control-hover"
            >
              <CheckIcon size={16} className={cn("flex-none", value === b.name ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{b.name}</span>
              {b.isDefault && <span className="rounded-full border border-border-default px-1.5 text-xs text-fg-muted">default</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Primer UnderlineNav, spaced like github.com/{repo}/branches */
export function UnderlineTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value?: T; onChange?: (t: T) => void }) {
  return (
    <nav aria-label="Branches navigation" className="flex h-12 items-center gap-2 px-4">
      {tabs.map(([key, label]) => {
        const on = value === key
        return (
          <button
            key={key}
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={() => onChange?.(key)}
            className={cn("relative flex h-12 cursor-pointer items-center bg-transparent px-2 text-sm text-fg-default", on ? "font-semibold" : "font-normal")}
          >
            <span className="rounded-md px-0 hover:bg-control-hover">{label}</span>
            {on && <span className="absolute right-0 -bottom-px left-0 h-0.5 rounded-md bg-underline-active" />}
          </button>
        )
      })}
    </nav>
  )
}
