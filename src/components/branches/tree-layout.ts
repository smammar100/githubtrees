import type { Branch } from "@/lib/types"
import type { Offsets } from "@/lib/use-repo-store"

export const CARD_W = 270
export const COL = 410
const GAP = 32
const PORT = 19

export type Item =
  | { kind: "card"; id: string; b: Branch }
  | { kind: "stub"; id: string; parent: string; mode: "collapsed" | "more" | "fewer"; count: number }
  | { kind: "ghost"; id: string; parent: string }

export interface Pos { x: number; y: number; h: number; port: number }
export interface Edge { from: string; to: string; item: Item }
export interface Layout {
  items: Item[]
  edges: Edge[]
  P: Record<string, Pos>
  groups: { x: number; y: number; text: string }[]
}

export const hasChip = (b: Branch) => b.pr?.state === "merged" || !!b.parentDeleted || b.parentSource === "ancestry"
export const cardHeight = (b: Branch) => 114 + (hasChip(b) ? 36 : 0)

export function computeLayout(
  branches: Branch[],
  kidsOf: (name: string) => Branch[],
  opts: {
    collapsed: Record<string, boolean>
    expanded: Record<string, boolean>
    filtering: boolean
    pred: (b: Branch) => boolean
    limit: number
    offsets: Offsets
  },
): Layout {
  const { collapsed, expanded, filtering, pred, limit, offsets } = opts
  const P: Record<string, Pos> = {}
  const items: Item[] = []
  const edges: Edge[] = []
  const groups: Layout["groups"] = []

  const visibleKids = (id: string): { list: Branch[]; stub: Extract<Item, { kind: "stub" }> | null } => {
    const all = kidsOf(id)
    if (!all.length) return { list: [], stub: null }
    const stubId = `stub:${id}`
    if (collapsed[id]) {
      const hits = filtering ? all.filter(pred) : []
      return { list: hits, stub: { kind: "stub", id: stubId, parent: id, mode: "collapsed", count: all.length - hits.length } }
    }
    if (all.length <= limit) return { list: all, stub: null }
    if (expanded[id]) return { list: all, stub: { kind: "stub", id: stubId, parent: id, mode: "fewer", count: all.length - limit } }
    const shown = all.slice(0, limit)
    const extra = filtering ? all.slice(limit).filter(pred) : []
    return { list: [...shown, ...extra], stub: { kind: "stub", id: stubId, parent: id, mode: "more", count: all.length - limit - extra.length } }
  }

  const lay = (node: Item, depth: number, y: number): number => {
    const h = node.kind === "stub" ? 60 : node.kind === "ghost" ? 150 : cardHeight(node.b)
    const kids: Item[] = []
    if (node.kind === "card") {
      const vk = visibleKids(node.b.name)
      kids.push(...vk.list.map(b => ({ kind: "card" as const, id: b.name, b })))
      if (vk.stub && vk.stub.count > 0) kids.push(vk.stub)
      if (node.b.isDefault && branches.length === 1) kids.push({ kind: "ghost", id: "ghost", parent: node.b.name })
    }
    let cy = y
    for (const k of kids) cy += lay(k, depth + 1, cy)
    let ny = y
    const port = node.kind === "stub" ? 30 : node.kind === "ghost" ? 29 : PORT
    if (kids.length) {
      const f = P[kids[0].id], l = P[kids[kids.length - 1].id]
      ny = Math.max(y, (f.y + f.port + l.y + l.port) / 2 - port)
    }
    P[node.id] = { x: depth * COL, y: ny, h, port }
    items.push(node)
    for (const k of kids) edges.push({ from: node.id, to: k.id, item: k })
    return Math.max(cy - y, h + GAP)
  }

  let y = 0
  for (const r of branches.filter(b => !b.parent && !b.orphan)) y += lay({ kind: "card", id: r.name, b: r }, 0, y)
  const orphans = branches.filter(b => b.orphan)
  if (orphans.length) {
    y += 50
    groups.push({ x: 0, y: y - 6, text: "No shared history with the default branch" })
    y += 22
    for (const r of orphans) y += lay({ kind: "card", id: r.name, b: r }, 0, y)
  }
  for (const id of Object.keys(P)) {
    const o = offsets[id]
    if (o) { P[id].x += o.dx; P[id].y += o.dy }
  }
  return { items, edges, P, groups }
}

export function bounds(L: Layout) {
  const v = Object.values(L.P)
  if (!v.length) return { x0: 0, y0: 0, x1: 1100, y1: 600 }
  return {
    x0: Math.min(...v.map(p => p.x)),
    y0: Math.min(...v.map(p => p.y)),
    x1: Math.max(...v.map(p => p.x + CARD_W)),
    y1: Math.max(...v.map(p => p.y + p.h)),
  }
}

export function edgePath(p: Pos, c: Pos, orthogonal: boolean) {
  const x1 = p.x + CARD_W, y1 = p.y + p.port, x2 = c.x, y2 = c.y + c.port
  const mx = (x1 + x2) / 2, sg = Math.sign(y2 - y1)
  const d =
    orthogonal && Math.abs(y2 - y1) > 24
      ? `M${x1},${y1} H${mx - 12} Q${mx},${y1} ${mx},${y1 + sg * 12} V${y2 - sg * 12} Q${mx},${y2} ${mx + 12},${y2} H${x2}`
      : `M${x1},${y1} C${x1 + 120},${y1} ${x2 - 120},${y2} ${x2},${y2}`
  return { d, mx, my: (y1 + y2) / 2 }
}
