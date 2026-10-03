# githubtrees

A concept for GitHub's Branches page: alongside the familiar list, a **Tree view** that shows where every branch came from — built on live data from any public repository.

Next.js, Tailwind and shadcn/ui, themed entirely with [Primer primitives](https://primer.style/primitives) tokens using github.com's colorblind-friendly (Protanopia & Deuteranopia) light and dark themes, which follow the OS setting.

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/primer/react/branches`. Any public repo works at `/{owner}/{repo}/branches`, or switch from the repo name in the header.

## Share any GitHub link

Swap `github.com` for this site's domain in any public repository link and the tree opens on what it points at:

| GitHub link | Opens |
|---|---|
| `/owner/repo` | the tree |
| `/owner/repo/tree/<branch>` (also `/blob/…`, `/commits/…`) | the tree with that branch selected and centred |
| `/owner/repo/pull/<n>` | the pull request's branch (or its base branch, for PRs from forks) |
| `/owner/repo/compare/<base>...<head>` | the head branch |
| `/owner/repo/branches/stale` (or `active`, `all`, `yours`) | that tab |

A whole URL pasted after the domain works too (`…/https://github.com/owner/repo/pull/123`), and so does pasting any of these into the repo switcher. Selecting a branch keeps `?branch=` in the address bar, so the current URL is always a link to what you're looking at. Large repositories load their first 150 branches; a linked branch outside them is fetched and added.

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

`netlify.toml` sets the build (`npm run build`, Node 22) and declares Netlify's Next.js runtime (`@netlify/plugin-nextjs`). Leave the base directory empty. Under **Site configuration → Environment variables**, add `GITHUB_TOKEN`. A fine-grained token with read-only access to public repositories is enough. Without it, the site is limited to the anonymous REST fallback, which shares one rate limit across Netlify's servers.

## Tree view controls

Drag the canvas to pan, scroll to zoom, drag a card to move it (Shift+drag moves its children too), `/` focuses the canvas search and Enter jumps to the first match, Esc clears selection → search → owner filter.

### Keyboard

The canvas is a single Tab stop that follows the [WAI-ARIA tree pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/); the camera pans to keep the focused branch in view.

| Key | Action |
|---|---|
| ↑ / ↓ | Previous / next branch in reading order |
| → | Open a collapsed group, or move to its first branch |
| ← | Close an open group, or move to the parent |
| Home / End | First / last branch |
| Enter or Space | Open the branch's details (or expand a "+N more" item) |
| A–Z | Jump to the next branch starting with that letter |
| Tab | From the tree into its details panel; Esc there closes it and returns to the branch |

## Accessibility

- **Screen readers.** The canvas is a `tree`: each card is a `treeitem` with its level, position among siblings and expanded state, and a label that reads out what the card shows: *"liuliu/fix-selectpanel-announcement, 19 ahead, 0 behind, pull request 8482 draft, 40 of 55 checks passing, updated 2 days ago by liuliu-dev"*. Wires and their labels repeat that information, so they're hidden from assistive tech. Search results are announced through a live region, and the details panel is a labelled region.
- **Motion.** `prefers-reduced-motion` turns off every animation and transition, including camera moves.
- **Colour.** github.com's colorblind-friendly themes; text meets WCAG AA contrast in light and dark, and links inside sentences are underlined.
- **Verified** with [axe-core](https://github.com/dequelabs/axe-core) against WCAG 2.2 A/AA and best practices: no violations in the tree, the tree with its details panel open, and the list, in both light and dark themes.
