# githubtrees

A concept for GitHub's Branches page: alongside the familiar list, a **Tree view** that shows where every branch came from — built on live data from any public repository.

The app lives in [`branches-tree-view/`](branches-tree-view) (Next.js, Tailwind, shadcn/ui, Primer tokens).

```bash
cd branches-tree-view
npm install
npm run dev
```

Open http://localhost:3000 — it opens `primer/react`'s branches; any public repo works at `/{owner}/{repo}/branches`. See [`branches-tree-view/README.md`](branches-tree-view/README.md) for how parents are inferred, the GitHub token setup and what's stored locally.
