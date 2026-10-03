"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertIcon,
  CheckCircleFillIcon,
  CheckIcon,
  DotFillIcon,
  GearIcon,
  GitBranchIcon,
  GitMergeIcon,
  LinkIcon,
  PersonIcon,
  SearchIcon,
  TriangleDownIcon,
  XCircleFillIcon,
  XIcon,
} from "@primer/octicons-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toTreeHref } from "@/lib/github-url"
import type { Branch, Person } from "@/lib/types"
import { branchColor, githubUrl, isActive, isStale, relativeTime } from "@/lib/branch-utils"
import type { Offsets, Prefs } from "@/lib/use-repo-store"
import { Button, buttonVariants } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Avatar, BranchName, BranchPicker, Counter, StatusLabel, prStyle } from "./primitives"
import { CARD_W, COL, bounds, computeLayout, edgePath, hasChip, type Item, type Layout } from "./tree-layout"
import type { Tab } from "./branches-page"

const EASE = "cubic-bezier(.2,.8,.2,1)"
const CONTROL = "flex h-(--control-medium-size) items-center gap-2 rounded-md border px-(--control-medium-paddingInline-condensed) text-sm whitespace-nowrap shadow-resting"
const controlBorder = (state: "rest" | "active" | "danger") =>
  state === "danger" ? "border-(--borderColor-danger-emphasis)" : state === "active" ? "border-accent-emphasis" : "border-(--control-borderColor-rest)"
const INFO_PATH = "M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"

export interface TreeViewProps {
  fullName: string
  defaultBranch: string
  branches: Branch[]
  byName: Map<string, Branch>
  kidsOf: (name: string) => Branch[]
  viewer: Person | null
  tab: Tab
  now: number
  offsets: Offsets
  setOffsets: (o: Offsets) => void
  prefs: Prefs
  setPrefs: (p: Prefs) => void
  isYours: (b: Branch) => boolean
  onDelete: (name: string) => void
  onSetParent: (name: string, parent: string | null) => void
  onNewBranch: (from?: string) => void
  /** Select (and reveal) a branch, e.g. from the list view's "Show in tree" or a shared link */
  focus: { name: string } | null
  /** Called whenever the selected branch changes (null when cleared), so the page can keep it in the URL. */
  onSelect?: (name: string | null) => void
}

type Cam = { z: number; px: number; py: number }
type NodeDrag = { id: string; x: number; y: number; base: Offsets; ids: string[]; moved: boolean }

export function TreeView(props: TreeViewProps) {
  const { branches, byName, kidsOf, viewer, tab, now, offsets, setOffsets, prefs, setPrefs, isYours, defaultBranch, fullName, onNewBranch } = props

  const [sel, setSel] = useState<string | null>(props.focus?.name ?? null)
  const [q, setQ] = useState("")
  const [owner, setOwner] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [cam, setCam] = useState<Cam>({ z: 0.8, px: 70, py: 24 })
  const [camAnim, setCamAnim] = useState(false)
  const [pan, setPan] = useState<{ x: number; y: number; px: number; py: number } | null>(null)
  const [nodeDrag, setNodeDrag] = useState<NodeDrag | null>(null)
  const [intro, setIntro] = useState(true)
  const canvasRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1700)
    return () => clearTimeout(t)
  }, [])

  // ---- filtering -------------------------------------------------------------
  const ql = q.trim().toLowerCase()
  const filtering = !!ql || !!owner
  const pred = useCallback((b: Branch) => (!ql || b.name.toLowerCase().includes(ql)) && (!owner || b.author.login === owner), [ql, owner])
  const matchesTab = useCallback(
    (b: Branch) => {
      if (b.isDefault) return true
      if (tab === "yours") return isYours(b)
      if (tab === "active") return isActive(b, now)
      if (tab === "stale") return isStale(b, now)
      return true
    },
    [tab, isYours, now],
  )

  // ---- layout ----------------------------------------------------------------
  const layout = useMemo(
    () => computeLayout(branches, kidsOf, { collapsed, expanded, filtering, pred, limit: prefs.collapseAfter, offsets }),
    [branches, kidsOf, collapsed, expanded, filtering, pred, prefs.collapseAfter, offsets],
  )
  const layoutRef = useRef<Layout>(layout)
  useEffect(() => { layoutRef.current = layout }, [layout])

  const fit = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = bounds(layoutRef.current)
    const w = b.x1 - b.x0, h = b.y1 - b.y0
    const z = Math.max(0.62, Math.min((r.width - 160) / w, (r.height - 150) / h, 1.05))
    const fitsW = w * z <= r.width - 120, fitsH = h * z <= r.height - 110
    setCamAnim(true)
    setCam({
      z,
      px: fitsW ? (r.width - w * z) / 2 - b.x0 * z + 24 : 70 - b.x0 * z,
      py: fitsH ? (r.height - h * z) / 2 - b.y0 * z + 6 : 70 - b.y0 * z,
    })
  }, [])
  const refit = useCallback(() => setTimeout(fit, 20), [fit])

  useEffect(() => {
    const t = setTimeout(fit, 60)
    return () => clearTimeout(t)
  }, [fit])

  const zoomBy = useCallback((f: number) => {
    const el = canvasRef.current
    if (!el) return
    const r = el.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2
    setCamAnim(true)
    setCam(s => {
      const nz = Math.min(1.8, Math.max(0.2, s.z * f))
      return { z: nz, px: mx - ((mx - s.px) * nz) / s.z, py: my - ((my - s.py) * nz) / s.z }
    })
  }, [])

  /** Expand every ancestor so the branch is laid out, select it, then centre the camera on it. */
  const reveal = useCallback(
    (name: string) => {
      const ancestors: string[] = []
      for (let p = byName.get(name)?.parent; p; p = byName.get(p)?.parent) ancestors.push(p)
      setCollapsed(s => ({ ...s, ...Object.fromEntries(ancestors.map(a => [a, false])) }))
      setExpanded(s => ({ ...s, ...Object.fromEntries(ancestors.map(a => [a, true])) }))
      setSel(name)
      setTimeout(() => {
        const el = canvasRef.current, pos = layoutRef.current.P[name]
        if (!el || !pos) return
        const r = el.getBoundingClientRect()
        setCamAnim(true)
        setCam(c => {
          const z = Math.max(c.z, 0.85)
          return { z, px: (r.width - 340) / 2 - (pos.x + CARD_W / 2) * z, py: r.height / 2 - (pos.y + pos.h / 2) * z }
        })
      }, 60)
    },
    [byName],
  )
  const focus = props.focus
  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => reveal(focus.name), 80)
    return () => clearTimeout(t)
  }, [focus, reveal])

  const onSelect = props.onSelect
  useEffect(() => { onSelect?.(sel) }, [sel, onSelect])

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top
      setCamAnim(false)
      setCam(s => {
        const nz = Math.min(1.8, Math.max(0.2, s.z * Math.exp(-e.deltaY * 0.0015)))
        return { z: nz, px: mx - ((mx - s.px) * nz) / s.z, py: my - ((my - s.py) * nz) / s.z }
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  // Keyboard: "/" focuses search, Esc clears selection → search → owner.
  const escState = useRef({ sel, q, owner })
  useEffect(() => { escState.current = { sel, q, owner } }, [sel, q, owner])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      if (e.key === "/" && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === "Escape") {
        const s = escState.current
        if (s.sel) setSel(null)
        else if (s.q) setQ("")
        else if (s.owner) setOwner(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ---- derived highlight state ----------------------------------------------
  const path = useCallback(
    (id: string) => {
      const p: Branch[] = []
      let c = byName.get(id)
      while (c) { p.unshift(c); c = c.parent ? byName.get(c.parent) : undefined }
      return p
    },
    [byName],
  )
  const selBranch = sel ? byName.get(sel) ?? null : null
  const pathIds = useMemo(() => (selBranch ? path(selBranch.name).map(p => p.name) : []), [selBranch, path])
  const hits = useMemo(() => (filtering ? branches.filter(pred) : []), [filtering, branches, pred])
  const keep = useMemo(() => {
    const k = new Set<string>()
    hits.forEach(h => path(h.name).forEach(p => k.add(p.name)))
    return k
  }, [hits, path])
  const faded = useCallback(
    (id: string) => {
      if (selBranch) return !pathIds.includes(id)
      if (filtering) return !keep.has(id)
      const b = byName.get(id)
      return b ? !matchesTab(b) : false
    },
    [selBranch, pathIds, filtering, keep, byName, matchesTab],
  )
  const maxAhead = useMemo(() => Math.max(1, ...branches.map(b => b.ahead)), [branches])
  const maxBehind = useMemo(() => Math.max(1, ...branches.map(b => b.behind)), [branches])

  // ---- pointer handling -------------------------------------------------------
  const onCanvasDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setCamAnim(false)
    setPan({ x: e.clientX, y: e.clientY, px: cam.px, py: cam.py })
  }
  const onCanvasMove = (e: React.PointerEvent) => {
    if (nodeDrag) {
      const dx = (e.clientX - nodeDrag.x) / cam.z, dy = (e.clientY - nodeDrag.y) / cam.z
      const moved = nodeDrag.moved || Math.hypot(e.clientX - nodeDrag.x, e.clientY - nodeDrag.y) > 3
      const next = { ...nodeDrag.base }
      nodeDrag.ids.forEach(id => {
        const b = nodeDrag.base[id] ?? { dx: 0, dy: 0 }
        next[id] = { dx: b.dx + dx, dy: b.dy + dy }
      })
      if (moved) setOffsets(next)
      if (moved !== nodeDrag.moved) setNodeDrag({ ...nodeDrag, moved })
      return
    }
    if (pan) setCam(c => ({ ...c, px: pan.px + e.clientX - pan.x, py: pan.py + e.clientY - pan.y }))
  }
  const onCanvasUp = () => {
    if (nodeDrag) {
      if (nodeDrag.moved) suppressClick.current = true
      setNodeDrag(null)
      return
    }
    if (pan) setPan(null)
  }

  const startNodeDrag = useCallback(
    (e: React.PointerEvent, b: Branch) => {
      e.stopPropagation()
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      const ids = [b.name]
      if (e.shiftKey) {
        const walk = (id: string) => kidsOf(id).forEach(c => { ids.push(c.name); walk(c.name) })
        walk(b.name)
      }
      setCamAnim(false)
      setNodeDrag({ id: b.name, x: e.clientX, y: e.clientY, base: { ...offsets }, ids, moved: false })
    },
    [kidsOf, offsets],
  )

  const toggleCollapsed = useCallback(
    (name: string) => {
      setCollapsed(s => ({ ...s, [name]: !s[name] }))
      refit()
    },
    [refit],
  )

  const onStubClick = useCallback(
    (it: Extract<Item, { kind: "stub" }>) => {
      if (it.mode === "collapsed") setCollapsed(s => ({ ...s, [it.parent]: false }))
      else setExpanded(s => ({ ...s, [it.parent]: it.mode !== "fewer" }))
      refit()
    },
    [refit],
  )

  const onCardClick = useCallback((name: string) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    setSel(s => (s === name ? null : name))
  }, [])

  // ---- world (memoised so panning/zooming doesn't re-render the cards) --------
  const dragIds = nodeDrag?.ids
  const dragging = !!nodeDrag
  const orthogonal = prefs.wireStyle === "orthogonal"
  const world = useMemo(() => {
    const { P } = layout
    const wireTrans = dragging ? "none" : `d .4s ${EASE}`
    const nodeDelay = (id: string) => Math.min(900, Math.round((P[id].x / COL) * 160 + Math.max(0, P[id].y) / 8))
    const posTrans = dragging ? "opacity .2s" : `opacity .25s, left .4s ${EASE}, top .4s ${EASE}`
    const edgeGeo = layout.edges.map(e => ({ ...e, ...edgePath(P[e.from], P[e.to], orthogonal) }))
    const dimOthers = !!selBranch || !!ql

    const wires = (
      <svg width={10} height={10} className="pointer-events-none absolute top-0 left-0 overflow-visible">
        {edgeGeo.map(e => {
          const b = e.item.kind === "card" ? e.item.b : null
          const hot = !!b && !!selBranch && pathIds.includes(b.name)
          const warm = !!b && (b.parentSource === "ancestry" || !!b.parentDeleted)
          const dashed = !b || warm
          const stroke = hot ? "var(--fgColor-accent)" : warm ? "var(--borderColor-attention-emphasis)" : "var(--borderColor-emphasis)"
          const off = b ? faded(b.name) : dimOthers
          const delay = nodeDelay(e.to) + 120
          const style = { d: `path("${e.d}")`, transition: wireTrans } as React.CSSProperties
          return (
            <g key={e.to} opacity={off ? 0.28 : 1}>
              <path
                d={e.d}
                fill="none"
                strokeWidth={hot ? 2.25 : 1.5}
                strokeDasharray={dashed && !hot ? "5 5" : intro ? 1 : undefined}
                pathLength={dashed && !hot ? undefined : intro ? 1 : undefined}
                style={{ ...style, stroke, animation: intro ? (dashed ? `fade-in .5s ease ${delay}ms backwards` : `wire-draw .7s ${EASE} ${delay}ms backwards`) : "none" }}
              />
              {hot && (
                <path d={e.d} fill="none" strokeWidth={1.75} strokeDasharray="4 16" strokeLinecap="round" style={{ ...style, stroke: "var(--bgColor-default)", animation: "wireflow .9s linear infinite" }} />
              )}
            </g>
          )
        })}
      </svg>
    )

    const labels: { key: string; x: number; y: number; text: string; color: string; border: string }[] = []
    edgeGeo.forEach(e => {
      if (e.item.kind !== "card") return
      const b = e.item.b
      const hot = !!selBranch && pathIds.includes(b.name)
      if (selBranch && !hot) return
      if (b.parentSource === "ancestry") labels.push({ key: b.name, x: e.mx, y: e.my, text: "inferred parent", color: "var(--fgColor-attention)", border: "var(--borderColor-attention-muted)" })
      else if (b.parentDeleted) labels.push({ key: b.name, x: e.mx, y: e.my, text: `via deleted ${b.parentDeleted}`, color: "var(--fgColor-attention)", border: "var(--borderColor-attention-muted)" })
      else if (hot && prefs.wireLabels)
        labels.push({ key: b.name, x: e.mx, y: e.my, text: b.parentSource === "manual" ? "parent set manually" : `${b.parentSource === "created" ? "created" : "forked"} ${relativeTime(b.forkedAt, now)}`, color: "var(--fgColor-accent)", border: "var(--borderColor-accent-muted)" })
    })

    return (
      <>
        {wires}
        {layout.groups.map(g => (
          <div key={g.text} className="absolute flex items-center gap-2 text-xs font-semibold whitespace-nowrap text-fg-muted" style={{ left: g.x, top: g.y }}>
            <span className="h-px w-6 bg-(--borderColor-emphasis)" />
            {g.text}
          </div>
        ))}
        {labels.map(w => (
          <div
            key={w.key}
            className="absolute -translate-x-1/2 -translate-y-1/2 animate-fade-in rounded-[20px] border bg-canvas px-2 py-[3px] font-mono text-[11px] whitespace-nowrap [animation-delay:.15s]"
            style={{ left: w.x, top: w.y, color: w.color, borderColor: w.border }}
          >
            {w.text}
          </div>
        ))}
        {layout.items.map(it => {
          const p = P[it.id]
          if (it.kind === "stub") {
            const total = kidsOf(it.parent).length
            return (
              <div
                key={it.id}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onStubClick(it)}
                className="absolute cursor-pointer"
                style={{ left: p.x, top: p.y, width: CARD_W, opacity: dimOthers ? 0.5 : 1, transition: posTrans }}
              >
                <div
                  className="relative flex h-[60px] items-center justify-between gap-2.5 rounded-xl border border-dashed border-fg-subtle bg-canvas px-4 transition-colors hover:border-fg-muted"
                  style={{ animation: `node-in .4s ${EASE} ${intro ? nodeDelay(it.id) : 0}ms backwards` }}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium">{it.mode === "fewer" ? "Show fewer" : `+${it.count} more ${it.count === 1 ? "branch" : "branches"}`}</span>
                    <span className="text-[11.5px] text-fg-muted">
                      {it.mode === "collapsed" ? `Collapsed · ${total} total` : it.mode === "fewer" ? `Showing all ${total}` : "Sorted by last update"}
                    </span>
                  </span>
                  <span className="text-xs font-medium whitespace-nowrap text-fg-accent">{it.mode === "fewer" ? "Collapse" : "Show all"}</span>
                  <span className="absolute top-[25px] -left-1.5 size-2.5 rounded-full border-[1.5px] border-fg-subtle bg-canvas" />
                </div>
              </div>
            )
          }
          if (it.kind === "ghost") {
            return (
              <div key={it.id} onPointerDown={e => e.stopPropagation()} className="absolute" style={{ left: p.x, top: p.y, width: CARD_W }}>
                <div className="relative flex flex-col gap-2.5 rounded-xl border border-dashed border-(--borderColor-emphasis) bg-canvas/60 p-4" style={{ animation: `node-in .5s ${EASE} 200ms backwards` }}>
                  <span className="text-[13px] font-medium">No other branches yet</span>
                  <span className="text-xs text-pretty text-fg-muted">Branches you create from {defaultBranch} will appear here, connected to it.</span>
                  <div className="flex">
                    <Button size="sm" onClick={() => onNewBranch(defaultBranch)}>New branch</Button>
                  </div>
                  <span className="absolute top-6 -left-1.5 size-2.5 rounded-full border-[1.5px] border-dashed border-fg-subtle bg-canvas" />
                </div>
              </div>
            )
          }
          const b = it.b
          const selected = sel === b.name
          const hot = !!selBranch && pathIds.includes(b.name)
          const hit = filtering && hits.includes(b)
          const inDrag = !!dragIds?.includes(b.name)
          return (
            <BranchCard
              key={it.id}
              b={b}
              x={p.x}
              y={p.y}
              now={now}
              color={branchColor(b)}
              kidsCount={kidsOf(b.name).length}
              parentName={b.parent}
              isCollapsed={!!collapsed[b.name]}
              selected={selected}
              hot={hot}
              hit={hit}
              faded={faded(b.name)}
              dimStrong={!!selBranch || filtering}
              stale={isStale(b, now)}
              aw={Math.min(100, (b.ahead / maxAhead) * 100)}
              bw={Math.min(100, (b.behind / maxBehind) * 100)}
              trans={inDrag ? "opacity .2s" : posTrans}
              anim={intro ? `node-in .5s ${EASE} ${nodeDelay(it.id)}ms backwards` : selected ? "ping-ring .9s ease-out 1" : "none"}
              grabbing={inDrag && !!nodeDrag?.moved}
              lifted={inDrag}
              onPointerDown={startNodeDrag}
              onClick={onCardClick}
              onToggle={toggleCollapsed}
            />
          )
        })}
      </>
    )
  }, [layout, orthogonal, dragging, dragIds, nodeDrag?.moved, selBranch, pathIds, ql, faded, intro, prefs.wireLabels, now, kidsOf, onStubClick, defaultBranch, onNewBranch, sel, filtering, hits, collapsed, maxAhead, maxBehind, startNodeDrag, onCardClick, toggleCollapsed])

  // ---- owners menu -------------------------------------------------------------
  const owners = useMemo(() => {
    const m = new Map<string, { person: Person; count: number }>()
    branches.forEach(b => {
      const cur = m.get(b.author.login)
      if (cur) cur.count++
      else m.set(b.author.login, { person: b.author, count: 1 })
    })
    return [...m.values()].sort((a, b) => (viewer && a.person.login === viewer.login ? -1 : viewer && b.person.login === viewer.login ? 1 : b.count - a.count || a.person.login.localeCompare(b.person.login)))
  }, [branches, viewer])
  const ownerPerson = owner ? owners.find(o => o.person.login === owner)?.person ?? null : null

  const parentsWithKids = branches.filter(b => kidsOf(b.name).length && !b.isDefault)
  const anyOpen = parentsWithKids.some(b => !collapsed[b.name])
  const noResults = filtering && hits.length === 0
  const hasOffsets = Object.keys(offsets).length > 0
  const stop = (e: React.PointerEvent) => e.stopPropagation()

  return (
    <div
      ref={canvasRef}
      onPointerDown={onCanvasDown}
      onPointerMove={onCanvasMove}
      onPointerUp={onCanvasUp}
      onPointerLeave={onCanvasUp}
      className="relative mt-4 h-[680px] animate-view-in touch-none overflow-hidden rounded-[14px] border border-border-default bg-canvas-subtle select-none"
      style={{
        backgroundImage: "radial-gradient(var(--borderColor-default) 1px, transparent 1px)",
        backgroundSize: `${18 * cam.z}px ${18 * cam.z}px`,
        backgroundPosition: `${cam.px}px ${cam.py}px`,
        transition: camAnim ? `background-position .45s ${EASE}, background-size .45s ${EASE}` : "none",
        cursor: pan ? "grabbing" : "grab",
      }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${cam.px}px, ${cam.py}px) scale(${cam.z})`, transition: camAnim ? `transform .45s ${EASE}` : "none" }}
      >
        {world}
      </div>

      {/* Owner filter + search */}
      <div className="absolute top-3.5 left-3.5 z-[4] flex flex-wrap items-start gap-2" onPointerDown={stop}>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              CONTROL,
              "cursor-pointer bg-(--bgColor-default) font-medium text-(--button-default-fgColor-rest) hover:bg-(--control-bgColor-hover) aria-expanded:bg-(--control-bgColor-active)",
              controlBorder(owner ? "active" : "rest"),
            )}
          >
            {ownerPerson ? <Avatar person={ownerPerson} /> : <PersonIcon size={16} className="text-fg-muted" />}
            <span>
              <span className="font-normal text-fg-muted">Owner:</span> {owner ?? "All owners"}
            </span>
            <TriangleDownIcon size={16} className="text-fg-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[420px] w-[260px] rounded-xl p-0 py-2 shadow-floating ring-0">
            <div className="px-4 pt-1.5 pb-2 text-xs font-semibold text-fg-muted">Filter by branch owner</div>
            {[{ person: null as Person | null, count: branches.length }, ...owners].map(o => {
              const key = o.person?.login ?? null
              const on = owner === key
              return (
                <DropdownMenuItem
                  key={key ?? "__all"}
                  onClick={() => { setOwner(key); setSel(null) }}
                  className={cn("mx-2 flex min-h-8 cursor-pointer gap-2 rounded-md px-2 py-1.5 text-sm text-fg-default focus:bg-control-hover", on && "bg-control-hover")}
                >
                  <CheckIcon size={16} className={cn("flex-none", on ? "opacity-100" : "opacity-0")} />
                  {o.person && <Avatar person={o.person} />}
                  <span className="min-w-0 flex-1 truncate">
                    {o.person ? o.person.login : "All owners"}
                    {o.person && viewer?.login === o.person.login && <span className="text-fg-muted"> (you)</span>}
                  </span>
                  <Counter>{o.count}</Counter>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <label
          className={cn(
            CONTROL,
            "relative w-[280px] cursor-text bg-(--bgColor-default) pr-1 focus-within:border-accent-emphasis focus-within:shadow-[inset_0_0_0_1px_var(--borderColor-accent-emphasis)]",
            controlBorder(ql && !hits.length ? "danger" : ql ? "active" : "rest"),
          )}
        >
          <SearchIcon size={16} className="flex-none text-fg-muted" />
          <input
            ref={searchRef}
            value={q}
            onChange={e => { setQ(e.target.value); setSel(null) }}
            onKeyDown={e => { if (e.key === "Enter" && hits.length) reveal(hits[0].name) }}
            placeholder="Find a branch on the canvas"
            aria-label="Find a branch on the canvas"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-fg-default outline-none"
          />
          {ql ? (
            <>
              <span className="text-xs whitespace-nowrap text-fg-muted">{hits.length} {hits.length === 1 ? "match" : "matches"}</span>
              <button type="button" onClick={() => setQ("")} title="Clear search" className="grid size-6 cursor-pointer place-content-center rounded-md text-fg-muted hover:bg-control-hover">
                <XIcon size={14} />
              </button>
            </>
          ) : (
            <kbd className="mr-1 rounded border border-border-default px-1 font-mono text-[11px] leading-4 text-fg-muted">/</kbd>
          )}
        </label>
      </div>

      {/* Zoom / layout toolbar */}
      <div onPointerDown={stop} className="absolute top-1/2 left-3.5 z-[3] flex -translate-y-1/2 flex-col gap-0.5 rounded-md border border-(--control-borderColor-rest) bg-(--bgColor-default) p-1 shadow-resting">
        <ToolButton title="Zoom in" onClick={() => zoomBy(1.2)}><span className="text-lg leading-none">+</span></ToolButton>
        <ToolButton title="Zoom out" onClick={() => zoomBy(1 / 1.2)}><span className="text-lg leading-none">−</span></ToolButton>
        <div className="mx-1 my-0.5 h-px bg-border-default" />
        <ToolButton title="Fit to screen" onClick={fit}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
        </ToolButton>
        <ToolButton
          title={anyOpen ? "Collapse all groups" : "Expand all groups"}
          onClick={() => {
            setCollapsed(anyOpen ? Object.fromEntries(parentsWithKids.map(b => [b.name, true])) : {})
            refit()
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={anyOpen ? "M4 6l4-3 4 3M4 10l4 3 4-3" : "M4 4l4 3 4-3M4 12l4-3 4 3"} />
          </svg>
        </ToolButton>
        <Popover>
          <PopoverTrigger title="Canvas settings" aria-label="Canvas settings" className="grid size-8 cursor-pointer place-content-center rounded-md text-fg-muted hover:bg-control-hover aria-expanded:bg-control-hover">
            <GearIcon size={16} />
          </PopoverTrigger>
          <PopoverContent side="right" align="center" sideOffset={10} className="w-64 gap-3 rounded-xl p-3.5 shadow-floating ring-0">
            <div className="text-xs font-semibold text-fg-muted">Canvas settings</div>
            <Setting label="Wires">
              <Segmented fullWidth value={prefs.wireStyle} options={[["curved", "Curved"], ["orthogonal", "Orthogonal"]]} onChange={v => setPrefs({ ...prefs, wireStyle: v })} />
            </Setting>
            <Setting label="Branches per group">
              <Segmented fullWidth value={String(prefs.collapseAfter)} options={[["4", "4"], ["6", "6"], ["10", "10"], ["20", "20"]]} onChange={v => { setPrefs({ ...prefs, collapseAfter: Number(v) }); refit() }} />
            </Setting>
            <label className="flex cursor-pointer items-center justify-between text-sm">
              Fork labels on selected path
              <Switch checked={prefs.wireLabels} onCheckedChange={v => setPrefs({ ...prefs, wireLabels: v })} />
            </label>
          </PopoverContent>
        </Popover>
        {hasOffsets && (
          <>
            <div className="mx-1 my-0.5 h-px bg-border-default" />
            <ToolButton title="Reset card positions" onClick={() => { setOffsets({}); refit() }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z" /></svg>
            </ToolButton>
          </>
        )}
      </div>

      <div className="absolute right-3.5 bottom-3.5 flex h-7 items-center rounded-md border border-(--control-borderColor-rest) bg-(--bgColor-default) px-2 text-xs text-fg-default tabular-nums shadow-resting">{Math.round(cam.z * 100)}%</div>

      {noResults && (
        <div onPointerDown={stop} className="absolute top-16 left-1/2 flex -translate-x-1/2 animate-fade-in items-center gap-3 rounded-[10px] border border-border-default bg-canvas px-3.5 py-2.5 text-[13px] whitespace-nowrap shadow-floating-lg [animation-duration:.2s]">
          <span>{ql && owner ? `No branches by ${owner} match “${q.trim()}”` : ql ? `No branches match “${q.trim()}”` : `${owner} has no branches here`}</span>
          <Button variant="outline" size="sm" onClick={() => { setQ(""); setOwner(null) }}>Clear</Button>
        </div>
      )}

      {selBranch && (
        <SelectionPanel
          key={selBranch.name}
          b={selBranch}
          lineage={path(selBranch.name)}
          fullName={fullName}
          defaultBranch={defaultBranch}
          branches={branches}
          kidsOf={kidsOf}
          now={now}
          onClose={() => setSel(null)}
          onDelete={name => { setSel(null); props.onDelete(name) }}
          onSetParent={(name, parent) => { props.onSetParent(name, parent); refit() }}
          onNewBranch={onNewBranch}
        />
      )}
    </div>
  )
}

/** Wire key for the tree canvas; rendered under the canvas so it never covers cards. */
export function TreeLegend() {
  return (
    <div role="group" aria-label="Legend" className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-fg-muted">
      <LegendWire label="Known parent" stroke="var(--borderColor-emphasis)" />
      <LegendWire label="Inferred parent" stroke="var(--borderColor-attention-emphasis)" dashed />
      <LegendWire label="Selected path" stroke="var(--fgColor-accent)" width={2} />
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[3px] border-[1.5px] border-dashed border-border-strong" />
        No shared history
      </span>
    </div>
  )
}

/** A short wire ending in a card's input port, drawn like the canvas wires. */
function LegendWire({ label, stroke, dashed, width = 1.5 }: { label: string; stroke: string; dashed?: boolean; width?: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden className="flex-none overflow-visible">
        <path d="M1 5 H13" fill="none" strokeLinecap="round" strokeDasharray={dashed ? "3 2.5" : undefined} style={{ stroke, strokeWidth: width }} />
        <circle cx="16.5" cy="5" r="3" style={{ fill: "var(--bgColor-default)", stroke, strokeWidth: 1.5 }} />
      </svg>
      {label}
    </span>
  )
}

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="grid size-8 cursor-pointer place-content-center rounded-md text-fg-muted hover:bg-control-hover">
      {children}
    </button>
  )
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  )
}

/**
 * Primer SegmentedControl. `fullWidth` splits the container's width evenly between the options; it uses equal grid
 * columns because the selected option has less padding than the others, which flex would count against it.
 */
export function Segmented<T extends string>({ value, options, onChange, size = "sm", fullWidth = false }: { value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void; size?: "sm" | "md"; fullWidth?: boolean }) {
  return (
    <div role="group" className={cn("rounded-md border border-transparent bg-canvas-inset text-xs", fullWidth ? "grid w-full auto-cols-fr grid-flow-col" : "inline-flex", size === "sm" ? "h-7" : "h-8")}>
      {options.map(([v, label], i) => {
        const on = v === value
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v)}
            className={cn("-my-px h-[calc(100%+2px)] cursor-pointer rounded-md border-0 bg-transparent text-fg-default", fullWidth && "min-w-0",on ? "p-0 font-semibold" : "p-1 font-normal", i === 0 ? "-ml-px" : "ml-px", i === options.length - 1 && "-mr-px")}
          >
            <span
              className={cn(
                "flex h-full items-center justify-center gap-1 rounded-[5px] border",
                on ? "border-fg-subtle bg-canvas px-3" : "border-transparent px-2 hover:bg-(--controlTrack-bgColor-hover)",
              )}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface CardProps {
  b: Branch
  x: number
  y: number
  now: number
  color: string
  kidsCount: number
  parentName: string | null
  isCollapsed: boolean
  selected: boolean
  hot: boolean
  hit: boolean
  faded: boolean
  dimStrong: boolean
  stale: boolean
  aw: number
  bw: number
  trans: string
  anim: string
  grabbing: boolean
  lifted: boolean
  onPointerDown: (e: React.PointerEvent, b: Branch) => void
  onClick: (name: string) => void
  onToggle: (name: string) => void
}

function BranchCard(p: CardProps) {
  const { b } = p
  const merged = b.pr?.state === "merged"
  const upToDate = !b.isDefault && !b.orphan && b.ahead === 0 && b.behind === 0
  let note = "", noteColor = "var(--borderColor-emphasis)", noteIcon = INFO_PATH
  if (b.isDefault) note = `Base for all branches · ${p.kidsCount} direct`
  else if (b.orphan) { note = "No common commit with the default branch"; noteColor = "var(--fgColor-muted)" }
  else if (upToDate) { note = "Up to date with the default branch"; noteColor = "var(--fgColor-success)"; noteIcon = "" }

  let chip: React.ReactNode = null
  if (hasChip(b)) {
    const purple = merged
    chip = (
      <div
        className="flex h-7 items-center gap-1.5 overflow-hidden rounded-md border px-2 text-xs whitespace-nowrap text-fg-default"
        style={{ background: purple ? "var(--bgColor-done-muted)" : "var(--bgColor-attention-muted)", borderColor: purple ? "var(--borderColor-done-muted)" : "var(--borderColor-attention-muted)" }}
      >
        <span className="flex flex-none" style={{ color: purple ? "var(--fgColor-done)" : "var(--fgColor-attention)" }}>{purple ? <GitMergeIcon size={12} /> : <AlertIcon size={12} />}</span>
        <span className="truncate">
          {merged ? `Merged into ${b.pr!.base} · safe to delete` : b.parentDeleted ? `Parent ${b.parentDeleted} was deleted` : "Parent inferred from commit history"}
        </span>
      </div>
    )
  }

  const border = p.selected || p.hit ? "var(--fgColor-accent)" : p.hot ? "var(--borderColor-accent-muted)" : b.orphan ? "var(--borderColor-emphasis)" : "var(--borderColor-default)"
  const shadow = p.selected
    ? "0 0 0 1px var(--borderColor-accent-emphasis), var(--shadow-floating-small)"
    : p.hit ? "0 0 0 1px var(--fgColor-accent)" : "var(--shadow-resting-small)"
  const portColor = p.hot ? "var(--fgColor-accent)" : "var(--borderColor-emphasis)"

  return (
    <div
      onPointerDown={e => p.onPointerDown(e, b)}
      onClick={() => p.onClick(b.name)}
      className="absolute touch-none"
      style={{ left: p.x, top: p.y, width: CARD_W, opacity: p.faded ? (p.dimStrong ? 0.35 : 0.3) : 1, cursor: p.grabbing ? "grabbing" : "grab", zIndex: p.lifted ? 3 : 1, transition: p.trans }}
    >
      <div
        className="relative rounded-md border bg-canvas transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-0.5 hover:border-(--hover-border)!"
        style={{ borderStyle: b.orphan || b.local ? "dashed" : "solid", borderColor: border, boxShadow: shadow, animation: p.anim, ["--hover-border" as string]: p.selected || p.hit ? "var(--fgColor-accent)" : "var(--borderColor-emphasis)" }}
      >
        <div className={cn("flex h-10 min-w-0 items-center gap-2 rounded-t-[5px] border-b border-border-default pr-2.5 pl-3", p.selected ? "bg-accent-subtle" : "bg-canvas-subtle")}>
          <span className="flex flex-none" style={{ color: p.color }}><GitBranchIcon size={16} /></span>
          <BranchName name={b.name} muted={merged} size="sm" />
          <Avatar person={b.author} className="ml-auto" />
        </div>
        <div className="flex flex-col gap-2 p-3">
          <div className="flex h-5 min-w-0 items-center justify-between gap-2 text-xs text-fg-muted">
            <span className="truncate">{b.author.login} · {relativeTime(b.updatedAt, p.now)}</span>
            <StatusLabel branch={b} stale={p.stale} />
          </div>
          {!b.isDefault && !b.orphan && !upToDate && (
            <div title={`${b.behind} behind, ${b.ahead} ahead of the default branch`} className="grid h-5 grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center gap-x-1.5 gap-y-[3px] text-xs tabular-nums">
              <span className="text-right leading-none text-fg-muted">{b.behind} <span className="text-fg-subtle">behind</span></span>
              <span className="row-span-2 h-5 w-px bg-border-default" />
              <span className="leading-none text-fg-muted">{b.ahead} <span className="text-fg-subtle">ahead</span></span>
              <span className="flex h-1 justify-end rounded-sm bg-canvas-inset"><span className="rounded-sm bg-fg-subtle" style={{ width: `${p.bw}%` }} /></span>
              <span className="flex h-1 rounded-sm bg-canvas-inset"><span className="rounded-sm" style={{ width: `${p.aw}%`, background: p.color }} /></span>
            </div>
          )}
          {note && (
            <div className="flex h-5 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-fg-muted">
              <span className="flex flex-none" style={{ color: noteColor }}>
                {noteIcon ? <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d={noteIcon} /></svg> : <CheckIcon size={12} />}
              </span>
              <span className="truncate">{note}</span>
            </div>
          )}
          {chip}
        </div>
        {p.parentName && (
          <span
            className="absolute top-3.5 -left-1.5 size-2.5 rounded-full bg-canvas"
            style={{ border: `1.5px ${b.parentSource === "ancestry" || b.parentDeleted ? "dashed" : "solid"} ${portColor}` }}
          />
        )}
        {p.kidsCount > 0 && (
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); p.onToggle(b.name) }}
            title={p.isCollapsed ? `Expand ${p.kidsCount} branches` : "Collapse children"}
            className="absolute top-2.5 left-full flex h-5 min-w-5 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border px-1.5 text-[11px] leading-none font-semibold shadow-resting"
            style={{ borderColor: portColor, background: p.isCollapsed ? "var(--bgColor-emphasis)" : "var(--bgColor-default)", color: p.isCollapsed ? "var(--fgColor-onEmphasis)" : "var(--fgColor-muted)" }}
          >
            {p.isCollapsed ? `+${p.kidsCount}` : "−"}
          </button>
        )}
      </div>
    </div>
  )
}

/** Copies a link that opens this tree with the branch selected. Like GitHub's copy buttons, the icon turns into a check. */
function CopyLinkButton({ fullName, branch }: { fullName: string; branch: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  const copy = async () => {
    const [owner, repo] = fullName.split("/")
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${toTreeHref({ owner, repo, ref: branch })}`)
      setCopied(true)
    } catch {
      toast.error("Couldn’t copy the link", { description: "The address bar has the same link." })
    }
  }
  const label = copied ? "Copied!" : "Copy link to this branch"
  return (
    <button
      type="button"
      onClick={copy}
      title={label}
      aria-label={label}
      className={cn("grid size-7 flex-none cursor-pointer place-content-center rounded-md hover:bg-control-hover", copied ? "text-(--fgColor-success)" : "text-fg-muted")}
    >
      {copied ? <CheckIcon size={16} /> : <LinkIcon size={16} />}
      <span role="status" className="sr-only">{copied ? "Link copied" : ""}</span>
    </button>
  )
}

function SelectionPanel({
  b, lineage, fullName, defaultBranch, branches, kidsOf, now, onClose, onDelete, onSetParent, onNewBranch,
}: {
  b: Branch
  lineage: Branch[]
  fullName: string
  defaultBranch: string
  branches: Branch[]
  kidsOf: (n: string) => Branch[]
  now: number
  onClose: () => void
  onDelete: (name: string) => void
  onSetParent: (name: string, parent: string | null) => void
  onNewBranch: (from?: string) => void
}) {
  const [reparenting, setReparenting] = useState(false)
  const kids = kidsOf(b.name)
  const merged = b.pr?.state === "merged"
  const canEditParent = !b.isDefault && !b.orphan
  const descendants = useMemo(() => {
    const s = new Set<string>([b.name])
    const walk = (n: string) => kidsOf(n).forEach(c => { s.add(c.name); walk(c.name) })
    walk(b.name)
    return s
  }, [b.name, kidsOf])

  let warn = ""
  if (b.parentSource === "ancestry") warn = `Parent inferred from commit history: this branch contains the tip of ${b.parent}. If either branch was rebased, its true origin may differ.`
  else if (b.parentDeleted) warn = `Its pull request targeted ${b.parentDeleted}, which has since been deleted. Shown attached to ${defaultBranch}.`
  else if (b.orphan) warn = `This branch shares no commits with ${defaultBranch}, so behind/ahead and compare are unavailable.`
  else if (merged) warn = `PR #${b.pr!.number} was merged into ${b.pr!.base}. This branch is safe to delete.`
  else if (b.pr?.state === "closed") warn = `PR #${b.pr.number} was closed without merging.`
  else if (b.local) warn = "Created in this browser only — it hasn’t been pushed to GitHub."

  const kind = b.isDefault ? "Default branch" : b.orphan ? "Orphan branch" : b.local ? "Local branch" : merged ? `Merged · PR #${b.pr!.number}` : isStale(b, now) ? "Stale branch" : b.pr ? `Branch · PR #${b.pr.number}` : "Branch"
  const base = b.parent ?? defaultBranch

  const danger = buttonVariants({ variant: "destructive", className: "flex-1" })
  const primary = buttonVariants({ variant: "default", className: "flex-1" })
  const secondary = buttonVariants({ variant: "outline", className: "flex-1" })

  let cta: React.ReactNode
  if (b.local || merged || (!b.isDefault && !b.orphan && b.ahead === 0 && !b.pr)) cta = <button type="button" className={danger} onClick={() => onDelete(b.name)}>Delete branch</button>
  else if (b.pr) cta = <a className={cn(primary, "hover:no-underline hover:text-fg-on-emphasis")} href={b.pr.url} target="_blank" rel="noreferrer">Open PR #{b.pr.number}</a>
  else if (b.isDefault || b.orphan) cta = <a className={cn(primary, "hover:no-underline hover:text-fg-on-emphasis")} href={githubUrl.tree(fullName, b.name)} target="_blank" rel="noreferrer">Browse code</a>
  else cta = <a className={cn(primary, "hover:no-underline hover:text-fg-on-emphasis")} href={githubUrl.compare(fullName, base, b.name, true)} target="_blank" rel="noreferrer">New pull request</a>

  const cta2 = b.local ? (
    <button type="button" className={secondary} onClick={() => onNewBranch(b.name)}>New branch from here</button>
  ) : b.orphan || b.isDefault ? (
    <a className={cn(secondary, "hover:no-underline text-(--button-default-fgColor-rest) hover:text-(--button-default-fgColor-rest)")} href={githubUrl.commits(fullName, b.name)} target="_blank" rel="noreferrer">View commits</a>
  ) : (
    <a className={cn(secondary, "hover:no-underline text-(--button-default-fgColor-rest) hover:text-(--button-default-fgColor-rest)")} href={githubUrl.compare(fullName, base, b.name)} target="_blank" rel="noreferrer">Compare</a>
  )

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      className="absolute top-3.5 right-3.5 z-[5] max-h-[calc(100%-70px)] w-[340px] animate-panel-in cursor-default overflow-x-hidden overflow-y-auto rounded-xl border border-border-default bg-canvas shadow-floating-lg"
    >
      <div className="flex items-start justify-between gap-2.5 border-b border-border-muted px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-fg-muted">{kind}</span>
          <span className="font-mono text-sm font-semibold break-all">{b.name}</span>
        </div>
        <div className="flex flex-none items-center gap-0.5">
          {/* Local branches exist only in this browser, so there's nothing to share. */}
          {!b.local && <CopyLinkButton key={b.name} fullName={fullName} branch={b.name} />}
          <button type="button" onClick={onClose} title="Close" className="grid size-7 flex-none cursor-pointer place-content-center rounded-md text-fg-muted hover:bg-control-hover">
            <XIcon size={16} />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-4 py-3.5 text-[13px]">
        {warn && (
          <div className="flex flex-col gap-1.5 rounded-md bg-attention-subtle px-3 py-2.5 text-[12.5px] text-pretty text-fg-attention-strong">
            <span>{warn}</span>
            {(b.parentSource === "ancestry" || b.parentDeleted) && !reparenting && (
              <button type="button" onClick={() => setReparenting(true)} className="cursor-pointer self-start font-medium underline">Set parent manually</button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Lineage</span>
            {canEditParent && !reparenting && (
              <button type="button" onClick={() => setReparenting(true)} className="cursor-pointer text-xs text-fg-accent hover:underline">Change parent</button>
            )}
          </div>
          <ol aria-label="Lineage" className="flex flex-col gap-1.5">
            {lineage.map((p, i) => (
              <li key={p.name} className="relative flex h-5 min-w-0 items-center gap-2.5" style={{ paddingLeft: i * 14 }}>
                {i > 0 && (
                  // Elbow from the parent's dot (one row up, one indent left) into this row's dot.
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-2.5 h-[20.75px] rounded-bl-md border-b-[1.5px] border-l-[1.5px] border-border-strong"
                    style={{ left: (i - 1) * 14 + 3.25, width: 14 - 3.25 - 2 }}
                  />
                )}
                <span className="relative size-2 flex-none rounded-full" style={{ background: branchColor(p) }} />
                <span title={p.name} className={cn("truncate font-mono text-[12.5px]", p.name === b.name ? "text-fg-default" : "text-fg-muted")}>{p.name}</span>
              </li>
            ))}
          </ol>
          {reparenting && (
            <div className="mt-1 flex flex-col gap-2 rounded-md border border-border-default bg-canvas-subtle p-2.5">
              <BranchPicker label="Parent" branches={branches.filter(x => !x.orphan)} value={b.parent} exclude={descendants} onChange={name => { onSetParent(b.name, name); setReparenting(false) }} />
              <div className="flex justify-between">
                {b.parentSource === "manual" ? (
                  <button type="button" className="cursor-pointer text-xs text-fg-accent hover:underline" onClick={() => { onSetParent(b.name, null); setReparenting(false) }}>Reset to detected parent</button>
                ) : <span />}
                <button type="button" className="cursor-pointer text-xs text-fg-muted hover:underline" onClick={() => setReparenting(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-fg-default">
          <span className="text-fg-muted">Forked</span>
          <span>
            {b.orphan ? "No common ancestor" : b.isDefault ? "Root of the repository" : `from ${b.parent}${b.parentSource === "ancestry" ? " (inferred)" : ""}${b.forkedAt ? `, ${relativeTime(b.forkedAt, now)}` : ""}`}
          </span>
          <span className="text-fg-muted">vs {defaultBranch}</span>
          <span>{b.isDefault ? "—" : b.orphan ? "Not comparable" : b.ahead === 0 && b.behind === 0 ? "Up to date" : `${b.behind} behind, ${b.ahead} ahead`}</span>
          <span className="text-fg-muted">Updated</span>
          <span>{relativeTime(b.updatedAt, now)}</span>
          <span className="text-fg-muted">Children</span>
          <span>{kids.length ? `${kids.length} ${kids.length === 1 ? "branch" : "branches"}` : "None"}</span>
          <span className="text-fg-muted">Owner</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar person={b.author} />
            <a href={githubUrl.user(b.author.login)} target="_blank" rel="noreferrer" className="truncate text-fg-default hover:text-fg-accent">{b.author.login}</a>
          </span>
          {b.checks && (
            <>
              <span className="text-fg-muted">Checks</span>
              <a href={githubUrl.checks(fullName, b.sha)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-fg-default hover:text-fg-accent">
                <CheckState state={b.checks.state} />
                {b.checks.passed} / {b.checks.total} passing
              </a>
            </>
          )}
          {b.pr && (
            <>
              <span className="text-fg-muted">Pull request</span>
              <a href={b.pr.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 text-fg-default hover:text-fg-accent" title={b.pr.title}>
                <span className="flex flex-none" style={{ color: prStyle(b.pr).color }}>{(() => { const I = prStyle(b.pr).Icon; return <I size={14} /> })()}</span>
                <span className="truncate">{b.pr.title}</span>
              </a>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {cta2}
          {cta}
        </div>
      </div>
    </div>
  )
}

export function CheckState({ state }: { state: "success" | "failure" | "pending" }) {
  if (state === "success") return <span className="flex text-fg-success"><CheckCircleFillIcon size={14} /></span>
  if (state === "failure") return <span className="flex text-fg-danger"><XCircleFillIcon size={14} /></span>
  return <span className="flex text-(--borderColor-attention-emphasis)"><DotFillIcon size={14} /></span>
}

