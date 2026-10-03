"use client"

import { useEffect, useRef, useState, useTransition } from "react"
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
  // Building a tree for a repository nobody has opened recently takes a few seconds, so the dialog stays up,
  // saying which one is on its way, until the new page has rendered.
  const [opening, setOpening] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const started = useRef(false)
  useEffect(() => {
    if (pending) started.current = true
    // Opening the repository already on screen doesn't remount this dialog, so close it here.
    else if (started.current) onDone()
  }, [pending, onDone])
  // The domain-swap tip names whichever host this is running on (localhost in development).
  const [host] = useState(() => window.location.host)

  const go = (target: NonNullable<ReturnType<typeof parseGitHubUrl>>) => {
    setOpening(`${target.owner}/${target.repo}`)
    startTransition(() => router.push(toTreeHref(target)))
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const target = parseGitHubUrl(value)
    if (target) go(target)
    else setInvalid(true)
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
          <span id="open-repo-hint" role="status" className={invalid ? "text-xs text-fg-danger" : "text-xs text-fg-muted"}>
            {invalid
              ? "That isn’t a GitHub repository link."
              : pending
                ? `Building the tree for ${opening}…`
                : "Repository, branch, pull request and compare links all work."}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Or try one</span>
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTIONS.map(r => {
              const [owner, repo] = r.split("/")
              return (
                <button
                  key={r}
                  type="button"
                  disabled={pending}
                  onClick={() => go({ owner, repo })}
                  className="flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-border-default px-2.5 font-mono text-xs text-fg-default hover:bg-control-hover disabled:cursor-default disabled:opacity-60"
                >
                  <span className="flex text-fg-muted"><RepoIcon size={12} /></span>
                  {r}
                </button>
              )
            })}
          </div>
        </div>
        <p className="text-xs text-fg-muted">
          Tip: on any GitHub page, swap <code className="font-mono">github.com</code> for <code className="font-mono">{host}</code> in the address bar.
        </p>
      </div>
      <DialogFooter className="mx-0 mb-0 border-t border-border-default bg-canvas px-4 py-3">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Opening…" : "Open tree"}</Button>
      </DialogFooter>
    </form>
  )
}
