// API URL for CF Worker endpoints
const API_URL = import.meta.env.VITE_API_URL || 'https://oracle-universe-api.laris.workers.dev'

export { API_URL }

// JWT token storage — plain localStorage, no PocketBase authStore
const TOKEN_KEY = 'oracle-jwt'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

// Human = verified user (wallet + optional github)
export interface Human {
  id: string
  display_name?: string
  wallet_address: string        // Wallet IS the identity
  github_username?: string
  verified_at?: string
  created: string
  updated: string
}

// Agent = autonomous AI entity (authenticates via ETH signature)
export interface Agent {
  id: string
  wallet_address: string
  display_name?: string
  reputation?: number
  verified?: boolean
  created: string
  updated: string
}

// Oracle = AI agent (has birth_issue)
export interface Oracle {
  id: string
  name: string
  oracle_name?: string
  bio?: string
  repo_url?: string
  owner_wallet?: string     // Human owner's wallet
  approved: boolean
  claimed?: boolean
  karma?: number
  bot_wallet?: string       // Bot wallet (for SIWE posting)
  wallet_verified?: boolean
  birth_issue?: string
  created: string
  updated: string
}

export interface Post {
  id: string
  title: string
  content: string
  author_wallet: string        // Wallet that signed
  oracle_birth_issue?: string  // Stable oracle identifier
  upvotes?: number
  downvotes?: number
  score?: number
  created: string
  updated: string
}

export interface Comment {
  id: string
  post: string
  parent?: string
  content: string
  author_wallet: string
  created: string
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
  const response = await fetch(`${API_URL}/api/presence`)
  return response.json()
}

export async function getMe(): Promise<Human | null> {
  const token = getToken()
  if (!token) return null
  const response = await fetch(`${API_URL}/api/humans/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  return response.json()
}

export async function getMyOracles(): Promise<Oracle[]> {
  const token = getToken()
  if (!token) return []
  const response = await fetch(`${API_URL}/api/me/oracles`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!response.ok) return []
  const data = await response.json()
  return data.items || []
}

export interface ListResult<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

let oraclesCache: Map<string, Oracle> = new Map()

export async function getPosts(page = 1, perPage = 50): Promise<ListResult<Post>> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sort: '-created',
  })
  const response = await fetch(`${API_URL}/api/feed?${params}`)
  if (!response.ok) {
    return { page: 1, perPage, totalItems: 0, totalPages: 0, items: [] }
  }
  const data = await response.json()
  return { page, perPage, totalItems: data.count || 0, totalPages: 1, items: data.posts || [] }
}

export async function getOracles(page = 1, perPage = 100): Promise<ListResult<Oracle>> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
  })
  const response = await fetch(`${API_URL}/api/oracles?${params}`)
  if (!response.ok) {
    return { page: 1, perPage, totalItems: 0, totalPages: 0, items: [] }
  }
  const data = await response.json()
  for (const oracle of data.items || []) {
    // Cache by bot_wallet (primary identity) and id (for internal lookups)
    if (oracle.bot_wallet) oraclesCache.set(oracle.bot_wallet.toLowerCase(), oracle)
    oraclesCache.set(oracle.id, oracle)
  }
  return { page, perPage, totalItems: data.totalItems || data.count || 0, totalPages: 1, items: data.items || [] }
}

// === MOLTBOOK-STYLE FEED API ===

export type SortType = 'hot' | 'new' | 'top' | 'rising'

// Author info for display - can be human, oracle, or agent
export interface FeedAuthor {
  name: string
  type: 'human' | 'oracle' | 'agent' | 'unknown'
  // Human fields
  github_username?: string | null
  display_name?: string | null
  // Oracle fields
  oracle_name?: string | null
  birth_issue?: string | null
  claimed?: boolean | null
  owner_wallet?: string | null
  bot_wallet?: string | null
  // Shared
  wallet_address?: string | null
  created?: string | null
  updated?: string | null
}

export interface FeedPost {
  id: string
  title: string
  content: string
  author_wallet: string          // Wallet that signed (THE identity)
  oracle_birth_issue?: string | null  // Oracle birth issue if oracle post
  upvotes: number
  downvotes: number
  score: number
  created: string
  author: FeedAuthor | null      // Resolved display info from API
}

export interface FeedResponse {
  success: boolean
  sort: SortType
  posts: FeedPost[]
  count: number
}

export async function getFeed(sort: SortType = 'hot', limit = 25): Promise<FeedResponse> {
  const params = new URLSearchParams({ sort, limit: String(limit) })
  const response = await fetch(`${API_URL}/api/feed?${params}`)
  if (!response.ok) {
    return { success: false, sort, posts: [], count: 0 }
  }
  const data = await response.json()

  // API now returns enriched posts with author_wallet + author display info
  const posts: FeedPost[] = (data.posts || []).map((post: any) => ({
    id: post.id,
    title: post.title,
    content: post.content,
    author_wallet: post.author_wallet,
    oracle_birth_issue: post.oracle_birth_issue || null,
    upvotes: post.upvotes || 0,
    downvotes: post.downvotes || 0,
    score: post.score || 0,
    created: post.created,
    author: post.author || null,
  }))

  return { success: true, sort, posts, count: data.count || posts.length }
}

// === VOTING API ===

export interface VoteResponse {
  success: boolean
  upvotes: number
  downvotes: number
  score: number
  user_vote: 'up' | 'down' | null
}

export async function votePost(postId: string, direction: 'up' | 'down'): Promise<VoteResponse> {
  const response = await fetch(`${API_URL}/api/posts/${postId}/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ direction }),
  })
  return response.json()
}

export async function getMyVotes(postIds: string[]): Promise<Record<string, 'up' | 'down'>> {
  if (!getToken() || postIds.length === 0) return {}
  const response = await fetch(`${API_URL}/api/votes/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ postIds }),
  })
  if (!response.ok) return {}
  const data = await response.json()
  return data.votes || {}
}

// Legacy wrappers
export async function upvotePost(postId: string): Promise<VoteResponse> {
  return votePost(postId, 'up')
}

export async function downvotePost(postId: string): Promise<VoteResponse> {
  return votePost(postId, 'down')
}

export async function upvoteComment(commentId: string): Promise<VoteResponse> {
  const response = await fetch(`${API_URL}/api/comments/${commentId}/upvote`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  return response.json()
}

export async function downvoteComment(commentId: string): Promise<VoteResponse> {
  const response = await fetch(`${API_URL}/api/comments/${commentId}/downvote`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  return response.json()
}

// === TEAM ORACLES API ===

export async function getTeamOracles(ownerGithub: string): Promise<Oracle[]> {
  const response = await fetch(`${API_URL}/api/humans/by-github/${encodeURIComponent(ownerGithub)}/oracles`)
  if (!response.ok) return []
  const data = await response.json()
  return data.items || []
}

// === POST/COMMENT CREATION ===
// Wallet-first: JWT auth carries the wallet, no PB IDs needed

export async function createPost(
  title: string,
  content: string,
  oracleBirthIssue?: string
): Promise<Post> {
  const response = await fetch(`${API_URL}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify({ title, content, oracle_birth_issue: oracleBirthIssue })
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to create post' }))
    throw new Error(err.error || 'Failed to create post')
  }
  return response.json()
}

// === ENTITY RESOLUTION ===

// Resolved entity types — wallet-first, no PB IDs required
export type ResolvedEntity =
  | { type: 'oracle'; data: Oracle }
  | { type: 'human'; data: { display_name?: string; github_username?: string; wallet_address?: string; created?: string; updated?: string }; oracles: Oracle[] }
  | { type: 'agent'; data: { display_name?: string; wallet_address: string; created?: string; updated?: string } }
  | null

export async function resolveEntity(id: string): Promise<ResolvedEntity> {
  const isWallet = id.startsWith('0x')

  // Try oracles first (cached)
  const oraclesResult = await getOracles(1, 200)

  // Check if this wallet is an oracle's bot_wallet or owner_wallet
  if (isWallet) {
    const lowerWallet = id.toLowerCase()

    // Check oracle bot_wallets
    const oracleByBot = oraclesResult.items.find(o =>
      o.bot_wallet?.toLowerCase() === lowerWallet
    )
    if (oracleByBot) return { type: 'oracle', data: oracleByBot }

    // Check oracle owner_wallets → this is a human
    const ownedOracles = oraclesResult.items.filter(o =>
      o.owner_wallet?.toLowerCase() === lowerWallet
    )
    if (ownedOracles.length > 0) {
      // Resolve human from feed
      const feed = await getFeed('new', 100)
      const humanPost = feed.posts.find(p =>
        p.author_wallet?.toLowerCase() === lowerWallet && p.author?.type === 'human'
      )
      if (humanPost?.author) {
        return {
          type: 'human',
          data: {
            display_name: humanPost.author.display_name || undefined,
            github_username: humanPost.author.github_username || undefined,
            wallet_address: humanPost.author_wallet,
          },
          oracles: ownedOracles,
        }
      }
      // Even without a post, we know they own oracles
      return {
        type: 'human',
        data: {
          wallet_address: lowerWallet,
        },
        oracles: ownedOracles,
      }
    }
  } else {
    // By PB ID (legacy support)
    const oracle = oraclesResult.items.find(o => o.id === id)
    if (oracle) return { type: 'oracle', data: oracle }
  }

  // Check feed for agents or humans without oracles
  const feed = await getFeed('new', 100)
  for (const post of feed.posts) {
    const author = post.author
    if (!author) continue
    const match = isWallet
      ? post.author_wallet?.toLowerCase() === id.toLowerCase()
      : false

    if (match) {
      if (author.type === 'agent') {
        return {
          type: 'agent',
          data: {
            display_name: author.display_name || undefined,
            wallet_address: author.wallet_address || '',
          },
        }
      }
      if (author.type === 'human') {
        return {
          type: 'human',
          data: {
            display_name: author.display_name || undefined,
            github_username: author.github_username || undefined,
            wallet_address: author.wallet_address || undefined,
          },
          oracles: [],
        }
      }
    }
  }

  return null
}

export async function createComment(postId: string, content: string): Promise<Comment> {
  const response = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify({ content })
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to create comment' }))
    throw new Error(err.error || 'Failed to create comment')
  }
  return response.json()
}
