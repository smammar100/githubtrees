"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RepoIcon } from "@primer/octicons-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { parseGitHubUrl, toTreeHref } from "@/lib/github-url"

/** Busy public repositories with interesting trees, one click away. */
const SUGGESTIONS = ["vercel/next.js", "facebook/react", "microsoft/vscode", "primer/react"]

/** The page's main action: open any public repository's tree from a GitHub link or `owner/repo`. */
export function OpenRepoButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open a repository</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[480px]">
          {open && <Form onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Form({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [invalid, setInvalid] = useState(false)
  // The domain-swap tip names whichever host this is running on (localhost in development).
  const [host] = useState(() => window.location.host)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const target = parseGitHubUrl(value)
    if (!target) return setInvalid(true)
    onDone()
    router.push(toTreeHref(target))
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader className="border-b border-border-default px-4 py-3.5">
        <DialogTitle className="text-sm font-semibold">Open a repository</DialogTitle>
        <DialogDescription className="sr-only">See any public GitHub repository’s branches as a tree.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="open-repo-input" className="text-sm font-semibold">GitHub link or owner/repo</Label>
          <input
            id="open-repo-input"
            autoFocus
            value={value}
            onChange={e => { setValue(e.target.value); setInvalid(false) }}
            placeholder="github.com/vercel/next.js"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid}
            aria-describedby="open-repo-hint"
            className="h-8 rounded-md border border-border-default px-3 font-mono text-sm outline-none focus:border-fg-accent focus:shadow-[0_0_0_1px_var(--fgColor-accent)] aria-invalid:border-fg-danger"
          />
          <span id="open-repo-hint" className={invalid ? "text-xs text-fg-danger" : "text-xs text-fg-muted"}>
            {invalid ? "That isn’t a GitHub repository link." : "Repository, branch, pull request and compare links all work."}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Or try one</span>
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTIONS.map(r => (
              <Link
                key={r}
                href={`/${r}/branches`}
                onClick={onDone}
                className="flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-border-default px-2.5 font-mono text-xs text-fg-default hover:bg-control-hover hover:no-underline hover:text-fg-default"
              >
                <span className="flex text-fg-muted"><RepoIcon size={12} /></span>
                {r}
              </Link>
            ))}
          </div>
        </div>
        <p className="text-xs text-fg-muted">
          Tip: on any GitHub page, swap <code className="font-mono">github.com</code> for <code className="font-mono">{host}</code> in the address bar.
        </p>
      </div>
      <DialogFooter className="mx-0 mb-0 border-t border-border-default bg-canvas px-4 py-3">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit">Open tree</Button>
      </DialogFooter>
    </form>
  )
}
