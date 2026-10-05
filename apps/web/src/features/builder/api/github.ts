import type { PortfolioProject } from '@makable/shared'

// Public, unauthenticated REST endpoints (60 requests/hour per IP).
// TODO: go through the Worker with the user's GitHub App token to also get pinned repos.
const GITHUB_API = 'https://api.github.com'

export type GithubProfile = {
  login: string
  name: string | null
  avatarUrl: string
  bio: string | null
  location: string | null
  blog: string | null
  twitterUsername: string | null
  email: string | null
  htmlUrl: string
}

export type GithubData = {
  profile: GithubProfile
  /** Owned, non-fork repos, most-starred first. */
  repos: PortfolioProject[]
}

type RawUser = {
  login: string
  name: string | null
  avatar_url: string
  bio: string | null
  location: string | null
  blog: string | null
  twitter_username: string | null
  email: string | null
  html_url: string
}

type RawRepo = {
  name: string
  description: string | null
  html_url: string
  homepage: string | null
  language: string | null
  stargazers_count: number
  fork: boolean
  archived: boolean
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub API ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

export async function fetchGithubData(login: string): Promise<GithubData> {
  const user = encodeURIComponent(login)
  const [rawUser, rawRepos] = await Promise.all([
    getJson<RawUser>(`/users/${user}`),
    getJson<RawRepo[]>(`/users/${user}/repos?type=owner&sort=updated&per_page=100`),
  ])

  const repos = rawRepos
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 12)
    .map(
      (r): PortfolioProject => ({
        name: r.name,
        description: r.description ?? '',
        repoUrl: r.html_url,
        homepageUrl: r.homepage ?? '',
        language: r.language,
        stars: r.stargazers_count,
      }),
    )

  return {
    profile: {
      login: rawUser.login,
      name: rawUser.name,
      avatarUrl: rawUser.avatar_url,
      bio: rawUser.bio,
      location: rawUser.location,
      blog: rawUser.blog,
      twitterUsername: rawUser.twitter_username,
      email: rawUser.email,
      htmlUrl: rawUser.html_url,
    },
    repos,
  }
}
