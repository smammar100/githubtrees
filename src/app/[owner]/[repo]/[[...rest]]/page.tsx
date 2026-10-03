import { notFound, redirect } from "next/navigation"
import { parseGitHubPath, toTreeHref } from "@/lib/github-url"

/**
 * Any GitHub link works with this site's domain swapped in: /owner/repo, …/tree/<branch>, …/pull/<n>,
 * …/compare/<base>...<head>, …/branches/<tab>. So does a whole URL pasted after the domain
 * (/https://github.com/owner/repo/…). Each one lands on the tree with that branch selected.
 */
export default async function Page(props: PageProps<"/[owner]/[repo]/[[...rest]]">) {
  const { owner, repo, rest = [] } = await props.params
  const target = parseGitHubPath([owner, repo, ...rest])
  if (!target) notFound()
  redirect(toTreeHref(target))
}
