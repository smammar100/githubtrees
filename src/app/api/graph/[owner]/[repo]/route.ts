import { getRepoGraph } from "@/lib/github"

export async function GET(req: Request, ctx: RouteContext<"/api/graph/[owner]/[repo]">) {
  const { owner, repo } = await ctx.params
  const fresh = new URL(req.url).searchParams.has("fresh")
  const result = await getRepoGraph(owner, repo, { fresh })
  return Response.json(result, { status: result.ok ? 200 : result.reason === "not-found" ? 404 : result.reason === "rate-limited" ? 429 : 502 })
}
