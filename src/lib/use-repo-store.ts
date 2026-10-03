"use client"

import { useCallback, useEffect, useState } from "react"
import type { Branch } from "./types"

export type Offsets = Record<string, { dx: number; dy: number }>

export interface RepoLocalState {
  /** Branches created with "New branch" in this browser (never pushed). */
  localBranches: Branch[]
  /** Branches deleted in this browser; restorable. */
  deleted: string[]
  /** Parents chosen with "Set parent manually". */
  parentOverrides: Record<string, string>
  /** Card positions moved by dragging on the canvas. */
  offsets: Offsets
}

export interface Prefs {
  wireStyle: "curved" | "orthogonal"
  wireLabels: boolean
  collapseAfter: number
}

const EMPTY: RepoLocalState = { localBranches: [], deleted: [], parentOverrides: {}, offsets: {} }
export const DEFAULT_PREFS: Prefs = { wireStyle: "curved", wireLabels: true, collapseAfter: 6 }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/** localStorage-backed state, loaded after mount so server and client markup match. */
function usePersisted<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once on mount
    setValue(read(key, fallback))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // Persist only on explicit updates, so mounting can never overwrite what's stored.
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue(prev => {
        const v = typeof next === "function" ? (next as (prev: T) => T)(prev) : next
        write(key, v)
        return v
      }),
    [key],
  )
  return [value, set] as const
}

export function useRepoStore(fullName: string) {
  const [state, setState] = usePersisted<RepoLocalState>(`branch-tree:${fullName.toLowerCase()}`, EMPTY)
  const update = useCallback(
    (fn: (s: RepoLocalState) => Partial<RepoLocalState>) => setState(s => ({ ...s, ...fn(s) })),
    [setState],
  )
  return { ...state, update }
}

export function usePrefs() {
  return usePersisted<Prefs>("branch-tree:prefs", DEFAULT_PREFS)
}
