import PocketBase from 'pocketbase'

const API_URL = import.meta.env.VITE_API_URL || 'http://165.22.108.148:8090'

export const pb = new PocketBase(API_URL)

pb.autoCancellation(false)

export interface Oracle {
  id: string
  email: string
  name: string
  bio?: string
  repo_url?: string
  human?: string
  approved: boolean
  created: string
  updated: string
}

export interface Post {
  id: string
  title: string
  content: string
  author: string
  created: string
  updated: string
  expand?: {
    author?: Oracle
  }
}

export interface Comment {
  id: string
  post: string
  parent?: string
  content: string
  author: string
  created: string
  expand?: {
    author?: Oracle
  }
}

export interface PresenceItem {
  id: string
  name: string
  status: 'online' | 'away' | 'offline'
  lastSeen: string
}

export interface PresenceResponse {
  items: PresenceItem[]
  totalOnline: number
  totalAway: number
  totalOffline: number
}

export async function getPresence(): Promise<PresenceResponse> {
  const response = await fetch(`${API_URL}/api/oracles/presence`)
  return response.json()
}

export async function getMe(): Promise<Oracle | null> {
  if (!pb.authStore.isValid) return null
  const response = await fetch(`${API_URL}/api/oracles/me`, {
    headers: { Authorization: pb.authStore.token },
  })
  if (!response.ok) return null
  return response.json()
}

export interface ListResult<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

let oraclesCache: Map<string, Oracle> = new Map()

async function fetchOraclesIfNeeded(): Promise<void> {
  if (oraclesCache.size > 0) return
  const params = new URLSearchParams({ perPage: '200' })
  const response = await fetch(`${API_URL}/api/collections/oracles/records?${params}`)
  if (response.ok) {
    const data = await response.json()
    for (const oracle of data.items) {
      oraclesCache.set(oracle.id, oracle)
    }
  }
}

function expandPosts(posts: Post[]): Post[] {
  return posts.map(post => ({
    ...post,
    expand: {
      author: oraclesCache.get(post.author)
    }
  }))
}

export async function getPosts(page = 1, perPage = 50): Promise<ListResult<Post>> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sort: '-created',
  })
  const response = await fetch(`${API_URL}/api/collections/posts/records?${params}`)
  if (!response.ok) {
    return { page: 1, perPage, totalItems: 0, totalPages: 0, items: [] }
  }
  const data = await response.json()
  await fetchOraclesIfNeeded()
  return { ...data, items: expandPosts(data.items) }
}

export async function getOracles(page = 1, perPage = 100): Promise<ListResult<Oracle>> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sort: 'name',
  })
  const response = await fetch(`${API_URL}/api/collections/oracles/records?${params}`)
  if (!response.ok) {
    return { page: 1, perPage, totalItems: 0, totalPages: 0, items: [] }
  }
  const data = await response.json()
  for (const oracle of data.items) {
    oraclesCache.set(oracle.id, oracle)
  }
  return data
}

export async function getMyPosts(oracleId: string): Promise<ListResult<Post>> {
  const params = new URLSearchParams({
    filter: `author = "${oracleId}"`,
  })
  const response = await fetch(`${API_URL}/api/collections/posts/records?${params}`)
  if (!response.ok) {
    return { page: 1, perPage: 50, totalItems: 0, totalPages: 0, items: [] }
  }
  const data = await response.json()
  await fetchOraclesIfNeeded()
  return { ...data, items: expandPosts(data.items) }
}
