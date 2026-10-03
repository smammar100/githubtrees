# githubtrees

A concept for GitHub's Branches page: alongside the familiar list, a **Tree view** that shows where every branch came from — built on live data from any public repository.

Next.js, Tailwind and shadcn/ui, themed entirely with [Primer primitives](https://primer.style/primitives) tokens using github.com's colorblind-friendly (Protanopia & Deuteranopia) light and dark themes, which follow the OS setting.

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/primer/react/branches`. Any public repo works at `/{owner}/{repo}/branches`, or switch from the repo name in the header.

## Data

Branches are read live from GitHub on the server (cached in memory for 10 minutes; **Refresh** under the canvas bypasses the cache).

- **Token** — set `GITHUB_TOKEN`, or be signed in with the GitHub CLI (`gh auth login`); the server reuses `gh auth token`. With a token, everything comes from the GraphQL API in about 15 parallel requests (3–6 s for a cold load). Without one, the server falls back to the REST API with one comparison per branch: that's much slower, GitHub's anonymous limit (60 requests/hour) runs out after a single load, and check status is skipped.
- **Parents** — Git doesn't record where a branch came from, so each branch's parent is worked out:
  1. its pull request's base branch (solid wire), or *via deleted X* when that base no longer exists;
  2. otherwise the nearest branch whose tip is inside this branch's commits ahead of the default branch (dashed amber, "inferred");
  3. otherwise the default branch.
- **Behind / ahead, owner, updated** — from comparing each branch with the default branch; the owner is the author of the head commit.
- **Check status** — the latest run of each check plus commit statuses on the head commit, as github.com counts them.

## Local-only actions

Nothing is ever written to GitHub. These are saved in this browser's localStorage per repository:

- **New branch** — creates a draft branch from any source branch.
- **Delete / Restore** — hides a branch (children re-attach to the nearest surviving ancestor).
- **Set parent manually** — overrides an inferred parent.
- Card positions after dragging, plus canvas settings (wire style, branches per group, fork labels).

Links such as *Open PR*, *Compare*, *New pull request*, *View commits* and *Activity* open the real pages on github.com.

## Deploying to Netlify

`netlify.toml` sets the build (`npm run build`, Node 22), and Netlify's Next.js runtime is applied automatically. Leave the base directory empty. Under **Site configuration → Environment variables**, add `GITHUB_TOKEN`. A fine-grained token with read-only access to public repositories is enough. Without it, the site is limited to the anonymous REST fallback, which shares one rate limit across Netlify's servers.

## Tree view controls

Drag the canvas to pan, scroll to zoom, drag a card to move it (Shift+drag moves its children too), `/` focuses the canvas search and Enter jumps to the first match, Esc clears selection → search → owner filter.
