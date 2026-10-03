"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { Branch } from "@/lib/types"
import { BranchPicker } from "./primitives"

// git check-ref-format rules, simplified
const invalidRef = (n: string) =>
  !n || /(^[./-])|([./]$)|\.\.|[\s~^:?*[\\]|@\{|\/\/|\.lock$/.test(n)

export function NewBranchDialog({
  open,
  onOpenChange,
  branches,
  defaultSource,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  branches: Branch[]
  defaultSource: string
  onCreate: (name: string, source: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[440px]">
        {open && <Form key={defaultSource} branches={branches} defaultSource={defaultSource} onCreate={onCreate} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ branches, defaultSource, onCreate, onCancel }: { branches: Branch[]; defaultSource: string; onCreate: (name: string, source: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("")
  const [source, setSource] = useState(defaultSource)
  const [touched, setTouched] = useState(false)
  const trimmed = name.trim()
  const exists = branches.some(b => b.name === trimmed)
  const error = !trimmed ? "Name can’t be blank" : exists ? `A branch named ${trimmed} already exists` : invalidRef(trimmed) ? "That isn’t a valid branch name" : ""

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (error) return
    onCreate(trimmed, source)
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader className="border-b border-border-default px-4 py-3.5">
        <DialogTitle className="text-sm font-semibold">Create a branch</DialogTitle>
        <DialogDescription className="sr-only">Name the branch and choose the branch it starts from.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-branch-name" className="text-sm font-semibold">New branch name</Label>
          <input
            id="new-branch-name"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !!error}
            className="h-8 rounded-md border border-border-default px-3 font-mono text-sm outline-none focus:border-fg-accent focus:shadow-[0_0_0_1px_var(--fgColor-accent)] aria-invalid:border-fg-danger"
          />
          {touched && error && <span className="text-xs text-fg-danger">{error}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Source</span>
          <BranchPicker label="Branch" branches={branches.filter(b => !b.orphan || b.name === source)} value={source} onChange={setSource} />
          <span className="text-xs text-fg-muted">
            Choose a source branch to start from. The new branch stays in this browser — nothing is pushed to GitHub.
          </span>
        </div>
      </div>
      <DialogFooter className="mx-0 mb-0 border-t border-border-default bg-canvas px-4 py-3">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Create new branch</Button>
      </DialogFooter>
    </form>
  )
}
