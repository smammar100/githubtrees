"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SyncIcon } from "@primer/octicons-react"
import { toast } from "sonner"
import type { Branch, RepoGraph } from "@/lib/types"
import { isActive, isStale, relativeTime } from "@/lib/branch-utils"
import { usePrefs, useRepoStore } from "@/lib/use-repo-store"
import { Button } from "@/components/ui/button"
import { RepoHeader } from "@/components/repo-header"
import { ListView } from "./list-view"
import { NewBranchDialog } from "./new-branch-dialog"
import { UnderlineTabs } from "./primitives"
import { Segmented, TreeLegend, TreeView } from "./tree-view"

export type Tab = "overview" | "yours" | "active" | "stale" | "all"
export type View = "tree" | "list"

const byUpdated = (a: Branch, b: Branch) => b.updatedAt.localeCompare(a.updatedAt)

export function BranchesPage({ graph, initialView, initialTab }: { graph: RepoGraph; initialView: View; initialTab: Tab }) {
  const { fullName, defaultBranch, viewer } = graph
  const store = useRepoStore(fullName)
  const { update } = store
  const [prefs, setPrefs] = usePrefs()
  const [view, setView] = useState<View>(initialView)
  const [tab, setTab] = useState<Tab>(initialTab === "yours" && !viewer ? "overview" : initialTab)
  const [focus, setFocus] = useState<{ name: string } | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; source: string }>({ open: false, source: defaultBranch })
  const [now, setNow] = useState(() => new Date(graph.fetchedAt).getTime())

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 60_000)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [])

  // Keep ?view & ?tab in the URL (and drop the one-shot ?fresh).
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete("fresh")
    if (view === "tree") url.searchParams.delete("view")
    else url.searchParams.set("view", view)
    if (tab === "overview") url.searchParams.delete("tab")
    else url.searchParams.set("tab", tab)
    window.history.replaceState(null, "", url)
  }, [view, tab])

  // ---- effective branch set: server data + local branches − deletions + manual parents ----
  const deleted = useMemo(() => new Set(store.deleted), [store.deleted])
  const allRaw = useMemo(() => [...graph.branches, ...store.localBranches], [graph.branches, store.localBranches])
  const branches = useMemo(() => {
    const rawByName = new Map(allRaw.map(b => [b.name, b]))
    const live = allRaw.filter(b => !deleted.has(b.name))
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
  }, [allRaw, deleted, store.parentOverrides, defaultBranch])

  const byName = useMemo(() => new Map(branches.map(b => [b.name, b])), [branches])
  const kidsMap = useMemo(() => {
    const m = new Map<string, Branch[]>()
    for (const b of branches) if (b.parent) m.set(b.parent, [...(m.get(b.parent) ?? []), b])
    for (const list of m.values()) list.sort(byUpdated)
    return m
  }, [branches])
  const kidsOf = useCallback((name: string) => kidsMap.get(name) ?? [], [kidsMap])
  const isYours = useCallback((b: Branch) => !!b.local || (!!viewer && b.author.login === viewer.login), [viewer])

  // ---- actions ------------------------------------------------------------------
  const restore = useCallback((name: string) => update(s => ({ deleted: s.deleted.filter(n => n !== name) })), [update])
  const remove = useCallback(
    (name: string) => {
      const b = allRaw.find(x => x.name === name)
      if (!b || b.isDefault) return
      if (b.local) {
        update(s => ({ localBranches: s.localBranches.filter(x => x.name !== name) }))
        toast(`Deleted ${name}`, { action: { label: "Undo", onClick: () => update(s => ({ localBranches: [...s.localBranches, b] })) } })
        return
      }
      update(s => ({ deleted: [...s.deleted.filter(n => n !== name), name] }))
      toast(`Deleted ${name}`, { description: "Hidden in this browser only — the branch still exists on GitHub.", action: { label: "Undo", onClick: () => restore(name) } })
    },
    [allRaw, update, restore],
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
  const create = (name: string, source: string) => {
    const src = byName.get(source)
    if (!src) return
    const at = new Date().toISOString()
    const b: Branch = {
      name, sha: src.sha, isDefault: false, isProtected: false,
      parent: src.name, parentSource: "created", orphan: false,
      ahead: src.isDefault ? 0 : src.ahead, behind: src.behind, updatedAt: at, forkedAt: at,
      author: viewer ?? { login: "you", avatarUrl: null, isBot: false }, pr: null, checks: null, local: true,
    }
    update(s => ({ localBranches: [...s.localBranches, b] }))
    setDialog(d => ({ ...d, open: false }))
    toast(`Created ${name} from ${source}`, { description: "Saved in this browser — nothing was pushed to GitHub." })
    setFocus({ name })
  }
  const openNew = useCallback((from?: string) => setDialog({ open: true, source: from ?? defaultBranch }), [defaultBranch])

  // ---- list sections ----------------------------------------------------------------
  const listSections = useCallback(
    (q: string) => {
      const pool = allRaw
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
    [allRaw, byName, isYours, now, tab, viewer],
  )

  const tabs: [Tab, string][] = [["overview", "Overview"], ...(viewer ? [["yours", "Yours"] as [Tab, string]] : []), ["active", "Active"], ["stale", "Stale"], ["all", "All"]]
  const refreshHref = `?fresh=1${view === "list" ? "&view=list" : ""}${tab !== "overview" ? `&tab=${tab}` : ""}`

  return (
    <div className="flex min-h-screen flex-col">
      <RepoHeader owner={graph.owner} repo={graph.repo} isPrivate={graph.isPrivate} openIssues={graph.openIssues} openPulls={graph.openPulls} viewer={viewer} onNewBranch={() => openNew()} />
      <main className="mx-auto box-border w-full max-w-[1344px] px-4 pt-6 pb-16 md:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl leading-9 font-normal">Branches</h1>
          <Button onClick={() => openNew()}>New branch</Button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 border-b border-border-muted">
          <UnderlineTabs tabs={tabs} value={tab} onChange={setTab} />
          <div>
            <Segmented<View>
              value={view}
              onChange={v => { setView(v); if (v === "list") setFocus(null) }}
              options={[
                ["list", <><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-fg-muted"><path d="M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" /></svg>List</>],
                ["tree", <><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" className="text-fg-muted" strokeWidth="1.5" strokeLinecap="round"><rect x="1.5" y="6" width="4" height="4" rx="1" /><rect x="10.5" y="2" width="4" height="4" rx="1" /><rect x="10.5" y="10" width="4" height="4" rx="1" /><path d="M5.5 8c3 0 2-4 5-4M5.5 8c3 0 2 4 5 4" /></svg>Tree</>],
              ]}
            />
          </div>
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
            onNewBranch={openNew}
            focus={focus}
          />
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
          <span>
            {graph.branches.length < graph.totalBranches ? `${graph.branches.length} of ${graph.totalBranches}` : graph.branches.length} branches from{" "}
            <a href={graph.htmlUrl} target="_blank" rel="noreferrer">{fullName}</a> · graph built from {graph.commitsScanned.toLocaleString()} commits · fetched {relativeTime(graph.fetchedAt, now)}
          </span>
          <Link href={refreshHref} prefetch={false} className="inline-flex items-center gap-1">
            <SyncIcon size={12} />Refresh
          </Link>
        </p>
          {view === "tree" && <TreeLegend />}
        </div>
      </main>

      <NewBranchDialog
        open={dialog.open}
        onOpenChange={open => setDialog(d => ({ ...d, open }))}
        branches={branches}
        defaultSource={dialog.source}
        onCreate={create}
      />
    </div>
  )
}

