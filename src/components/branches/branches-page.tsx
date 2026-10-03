"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link, { useLinkStatus } from "next/link"
import { ListUnorderedIcon, SyncIcon, WorkflowIcon } from "@primer/octicons-react"
import { toast } from "sonner"
import type { Branch, RepoGraph } from "@/lib/types"
import { isActive, isStale, relativeTime } from "@/lib/branch-utils"
import { resolveRef } from "@/lib/github-url"
import { usePrefs, useRepoStore } from "@/lib/use-repo-store"
import { OpenRepoButton } from "@/components/open-repo-dialog"
import { RepoHeader } from "@/components/repo-header"
import { UnderlineTabs } from "./primitives"
import { Segmented, TreeLegend, TreeView } from "./tree-view"

export type Tab = "overview" | "yours" | "active" | "stale" | "all"
export type View = "tree" | "list"

// The tree is the default view, so the list's code loads only when it's shown.
const ListView = dynamic(() => import("./list-view").then(m => m.ListView))

const byUpdated = (a: Branch, b: Branch) => b.updatedAt.localeCompare(a.updatedAt)

export function BranchesPage({ graph, initialView, initialTab, initialBranch, notice }: {
  graph: RepoGraph
  initialView: View
  initialTab: Tab
  /** Branch from a shared link (may carry a trailing path, e.g. from a /tree/<branch>/<path> URL). */
  initialBranch?: string
  /** One-off message about the shared link, e.g. a pull request from a fork. */
  notice?: string
}) {
  const { fullName, defaultBranch, viewer } = graph
  const store = useRepoStore(fullName)
  const { update } = store
  const [prefs, setPrefs] = usePrefs()
  const [view, setView] = useState<View>(initialView)
  const [tab, setTab] = useState<Tab>(initialTab === "yours" && !viewer ? "overview" : initialTab)
  const [linked] = useState(() => (initialBranch ? resolveRef(initialBranch, graph.branches.map(b => b.name)) : null))
  const [focus, setFocus] = useState<{ name: string } | null>(linked ? { name: linked } : null)
  const [selected, setSelected] = useState<string | null>(linked)
  const [now, setNow] = useState(() => new Date(graph.fetchedAt).getTime())

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 60_000)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [])

  // Say once if the shared link couldn't be followed exactly. Deferred: this effect runs before the layout's
  // <Toaster> has subscribed, and the message reads better once the tree has settled anyway.
  useEffect(() => {
    const t = setTimeout(() => {
      if (notice) toast(notice, { duration: 8000 })
      else if (initialBranch && !linked)
        toast.warning(`No branch called “${initialBranch}” in ${fullName}`, { description: "It may have been deleted or renamed. Showing the whole tree.", duration: 8000 })
    }, 400)
    return () => clearTimeout(t)
  }, [notice, initialBranch, linked, fullName])

  // Keep ?view, ?tab and the selected ?branch in the URL so the address is always shareable
  // (and drop the one-shot ?fresh and ?pr).
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete("fresh")
    url.searchParams.delete("pr")
    if (view === "tree") url.searchParams.delete("view")
    else url.searchParams.set("view", view)
    if (tab === "overview") url.searchParams.delete("tab")
    else url.searchParams.set("tab", tab)
    const shared = view === "tree" ? selected : null
    if (shared) url.searchParams.set("branch", shared)
    else url.searchParams.delete("branch")
    window.history.replaceState(null, "", url.toString().replace(/%2F/gi, "/"))
    document.title = shared ? `${shared} · Branches · ${fullName}` : `Branches · ${fullName}`
  }, [view, tab, selected, fullName])

  // ---- effective branch set: server data − deletions + manual parents ----
  const deleted = useMemo(() => new Set(store.deleted), [store.deleted])
  const branches = useMemo(() => {
    const rawByName = new Map(graph.branches.map(b => [b.name, b]))
    const live = graph.branches.filter(b => !deleted.has(b.name))
    const names = new Set(live.map(b => b.name))
    const out = live.map(b => {
      let { parent, parentSource, parentDeleted } = b
      const override = store.parentOverrides[b.name]
      if (override && override !== b.name && names.has(override) && !b.isDefault && !b.orphan) {
        parent = override
        parentSource = "manual"
        parentDeleted = undefined
      }
      // Re-attach children of locally deleted branches to the nearest surviving ancestor.
      for (let guard = 0; parent && !names.has(parent) && guard < 50; guard++) parent = rawByName.get(parent)?.parent ?? null
      if (!parent && !b.isDefault && !b.orphan) parent = defaultBranch
      return { ...b, parent, parentSource, parentDeleted }
    })
    const byName = new Map(out.map(b => [b.name, b]))
    for (const b of out) {
      const seen = new Set([b.name])
      for (let p = b.parent; p; p = byName.get(p)?.parent ?? null) {
        if (seen.has(p)) { b.parent = defaultBranch; b.parentSource = "default"; break }
        seen.add(p)
      }
    }
    return out
  }, [graph.branches, deleted, store.parentOverrides, defaultBranch])

  const byName = useMemo(() => new Map(branches.map(b => [b.name, b])), [branches])
  const kidsMap = useMemo(() => {
    const m = new Map<string, Branch[]>()
    for (const b of branches) if (b.parent) m.set(b.parent, [...(m.get(b.parent) ?? []), b])
    for (const list of m.values()) list.sort(byUpdated)
    return m
  }, [branches])
  const kidsOf = useCallback((name: string) => kidsMap.get(name) ?? [], [kidsMap])
  const isYours = useCallback((b: Branch) => !!viewer && b.author.login === viewer.login, [viewer])

  // ---- actions ------------------------------------------------------------------
  const restore = useCallback((name: string) => update(s => ({ deleted: s.deleted.filter(n => n !== name) })), [update])
  const remove = useCallback(
    (name: string) => {
      if (name === defaultBranch) return
      update(s => ({ deleted: [...s.deleted.filter(n => n !== name), name] }))
      toast(`Deleted ${name}`, { description: "Hidden in this browser only — the branch still exists on GitHub.", action: { label: "Undo", onClick: () => restore(name) } })
    },
    [defaultBranch, update, restore],
  )
  const setParent = useCallback(
    (name: string, parent: string | null) =>
      update(s => {
        const next = { ...s.parentOverrides }
        if (parent) next[name] = parent
        else delete next[name]
        return { parentOverrides: next }
      }),
    [update],
  )

  // ---- list sections ----------------------------------------------------------------
  const listSections = useCallback(
    (q: string) => {
      const pool = graph.branches
        .map(b => byName.get(b.name) ?? b)
        .filter(b => !q || b.name.toLowerCase().includes(q))
        .sort(byUpdated)
      const nonDefault = pool.filter(b => !b.isDefault)
      const yours = nonDefault.filter(isYours)
      const active = nonDefault.filter(b => isActive(b, now))
      const stale = nonDefault.filter(b => isStale(b, now))
      if (tab === "overview" && !q) {
        return [
          { key: "default", title: "Default", rows: pool.filter(b => b.isDefault) },
          ...(viewer ? [{ key: "yours", title: "Your branches", rows: yours.slice(0, 5), more: yours.length > 5 ? ("yours" as const) : undefined }] : []),
          { key: "active", title: "Active branches", rows: active.slice(0, 5), more: active.length > 5 ? ("active" as const) : undefined },
        ]
      }
      if (tab === "overview") return [{ key: "results", title: "Search results", rows: pool }]
      const rows = tab === "yours" ? yours : tab === "active" ? active : tab === "stale" ? stale : [...pool.filter(b => b.isDefault), ...nonDefault]
      const title = tab === "yours" ? "Your branches" : tab === "active" ? "Active branches" : tab === "stale" ? "Stale branches" : "All branches"
      return [{ key: tab, title, rows }]
    },
    [graph.branches, byName, isYours, now, tab, viewer],
  )

  const tabs: [Tab, string][] = [["overview", "Overview"], ...(viewer ? [["yours", "Yours"] as [Tab, string]] : []), ["active", "Active"], ["stale", "Stale"], ["all", "All"]]
  // A new ?fresh value each time, so the request misses the edge cache.
  const refreshHref = `?fresh=${now}${view === "list" ? "&view=list" : ""}${tab !== "overview" ? `&tab=${tab}` : ""}`

  return (
    <div className="flex min-h-screen flex-col">
      <RepoHeader owner={graph.owner} repo={graph.repo} isPrivate={graph.isPrivate} openIssues={graph.openIssues} openPulls={graph.openPulls} viewer={viewer} />
      <main className="mx-auto box-border w-full max-w-[1344px] px-4 pt-6 pb-16 md:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl leading-9 font-normal">Branches</h1>
          <OpenRepoButton />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 border-b border-border-muted">
          <UnderlineTabs tabs={tabs} value={tab} onChange={setTab} />
          <Segmented<View>
            value={view}
            onChange={v => { setView(v); if (v === "list") setFocus(null) }}
            options={[
              ["list", <><ListUnorderedIcon size={16} className="text-fg-muted" />List</>],
              ["tree", <><WorkflowIcon size={16} className="text-fg-muted" />Tree</>],
            ]}
          />
        </div>

        {view === "list" ? (
          <ListView
            fullName={fullName}
            defaultBranch={defaultBranch}
            tab={tab}
            setTab={setTab}
            now={now}
            sections={listSections}
            deleted={deleted}
            onDelete={remove}
            onRestore={restore}
            onShowInTree={name => { setFocus({ name }); setView("tree") }}
          />
        ) : (
          <TreeView
            fullName={fullName}
            defaultBranch={defaultBranch}
            branches={branches}
            byName={byName}
            kidsOf={kidsOf}
            viewer={viewer}
            tab={tab}
            now={now}
            offsets={store.offsets}
            setOffsets={offsets => update(() => ({ offsets }))}
            prefs={prefs}
            setPrefs={setPrefs}
            isYours={isYours}
            onDelete={remove}
            onSetParent={setParent}
            focus={focus}
            onSelect={setSelected}
          />
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
            <span>
              {graph.branches.length < graph.totalBranches ? `${graph.branches.length} of ${graph.totalBranches}` : graph.branches.length} branches from{" "}
              {/* Underlined because, inside a sentence, colour alone doesn't mark a link (WCAG 1.4.1). */}
              <a href={graph.htmlUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{fullName}</a> · graph built from {graph.commitsScanned.toLocaleString()} commits · fetched {relativeTime(graph.fetchedAt, now)}
            </span>
            <Link href={refreshHref} prefetch={false} className="inline-flex items-center gap-1">
              <RefreshLabel />
            </Link>
          </p>
          {view === "tree" && <TreeLegend />}
        </div>
      </main>
    </div>
  )
}

/** Rebuilding the graph takes a few seconds; the icon spins until the fresh page arrives. */
function RefreshLabel() {
  const { pending } = useLinkStatus()
  return (
    <>
      <SyncIcon size={12} className={pending ? "animate-spin" : undefined} />
      {pending ? "Refreshing…" : "Refresh"}
    </>
  )
}
