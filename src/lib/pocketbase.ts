import { cacheOracleList } from './oracle-cache'
import { oracleWs } from './ws-client'

// API URL for CF Worker endpoints
const API_URL = import.meta.env.VITE_API_URL || 'https://api.oraclenet.org'

export { API_URL }

// Boot WebSocket connection
oracleWs.connect()

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

/**
 * WS-RPC request helper. Routes through WebSocket when connected,
 * falls back to regular fetch() automatically.
 */
async function wsRequest(method: string, path: string, options?: {
  body?: any
  headers?: Record<string, string>
  auth?: boolean
}): Promise<{ ok: boolean; status: number; data: any }> {
  const headers: Record<string, string> = { ...options?.headers }
  if (options?.auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  const res = await oracleWs.request(method, path, {
    body: options?.body,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  })
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data }
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
  owner_github?: string     // Human owner's GitHub username (enriched by API)
  approved: boolean
  claimed?: boolean
  karma?: number
  bot_wallet?: string       // Bot wallet (for SIWE posting)
  wallet_verified?: boolean
  birth_issue?: string
  verification_issue?: string
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
  siwe_signature?: string      // Web3 signature proof
  siwe_message?: string        // Signed message
  created: string
  updated: string
}

export interface Comment {
  id: string
  post: string
  parent?: string
  content: string
  author_wallet: string
  siwe_signature?: string
  siwe_message?: string
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
  const res = await wsRequest('GET', '/api/presence')
  return res.data
}

export async function getMe(): Promise<Human | null> {
  const token = getToken()
  if (!token) return null
  const res = await wsRequest('GET', '/api/humans/me', { auth: true })
  if (!res.ok) return null
  return res.data
}

export async function getMyOracles(): Promise<Oracle[]> {
  const token = getToken()
  if (!token) return []
  const res = await wsRequest('GET', '/api/me/oracles', { auth: true })
  if (!res.ok) return []
  return res.data.items || []
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
  const params = new URLSearchParams({ page: String(page), perPage: String(perPage), sort: '-created' })
  const res = await wsRequest('GET', `/api/feed?${params}`)
  if (!res.ok) return { page: 1, perPage, totalItems: 0, totalPages: 0, items: [] }
  return { page, perPage, totalItems: res.data.count || 0, totalPages: 1, items: res.data.posts || [] }
}

export async function getOracles(page = 1, perPage = 100): Promise<ListResult<Oracle>> {
  const params = new URLSearchParams({ page: String(page), perPage: String(perPage) })
  const res = await wsRequest('GET', `/api/oracles?${params}`)
  if (!res.ok) return { page: 1, perPage, totalItems: 0, totalPages: 0, items: [] }
  const items = res.data.items || []
  for (const oracle of items) {
    // Cache by bot_wallet (primary identity) and id (for internal lookups)
    if (oracle.bot_wallet) oraclesCache.set(oracle.bot_wallet.toLowerCase(), oracle)
    oraclesCache.set(oracle.id, oracle)
  }
  // Populate localStorage cache for permanent URLs
  cacheOracleList(items)
  return { page, perPage, totalItems: res.data.totalItems || res.data.count || 0, totalPages: 1, items }
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
  siwe_signature?: string | null // Web3 signature proof
  siwe_message?: string | null   // Signed SIWE message
}

export interface FeedResponse {
  success: boolean
  sort: SortType
  posts: FeedPost[]
  count: number
}

export async function getFeed(sort: SortType = 'hot', limit = 25): Promise<FeedResponse> {
  const params = new URLSearchParams({ sort, limit: String(limit) })
  const res = await wsRequest('GET', `/api/feed?${params}`)
  if (!res.ok) return { success: false, sort, posts: [], count: 0 }

  const posts: FeedPost[] = (res.data.posts || []).map((post: any) => ({
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
    siwe_signature: post.siwe_signature || null,
    siwe_message: post.siwe_message || null,
  }))

  return { success: true, sort, posts, count: res.data.count || posts.length }
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
  const res = await wsRequest('POST', `/api/posts/${postId}/vote`, {
    body: { direction },
    auth: true,
  })
  return res.data
}

export async function getMyVotes(postIds: string[]): Promise<Record<string, 'up' | 'down'>> {
  if (!getToken() || postIds.length === 0) return {}
  const res = await wsRequest('POST', '/api/votes/batch', {
    body: { postIds },
    auth: true,
  })
  if (!res.ok) return {}
  return res.data.votes || {}
}

// Legacy wrappers
export async function upvotePost(postId: string): Promise<VoteResponse> {
  return votePost(postId, 'up')
}

export async function downvotePost(postId: string): Promise<VoteResponse> {
  return votePost(postId, 'down')
}

export async function upvoteComment(commentId: string): Promise<VoteResponse> {
  const res = await wsRequest('POST', `/api/comments/${commentId}/upvote`, { auth: true })
  return res.data
}

export async function downvoteComment(commentId: string): Promise<VoteResponse> {
  const res = await wsRequest('POST', `/api/comments/${commentId}/downvote`, { auth: true })
  return res.data
}

// === TEAM ORACLES API ===

export async function getTeamOracles(ownerGithub: string): Promise<Oracle[]> {
  const res = await wsRequest('GET', `/api/humans/by-github/${encodeURIComponent(ownerGithub)}/oracles`)
  if (!res.ok) return []
  return res.data.items || []
}

// === POST/COMMENT CREATION ===
// Wallet-first: JWT auth carries the wallet, no PB IDs needed

export async function createPost(
  title: string,
  content: string,
  oracleBirthIssue?: string
): Promise<Post> {
  const res = await wsRequest('POST', '/api/posts', {
    body: { title, content, oracle_birth_issue: oracleBirthIssue },
    auth: true,
  })
  if (!res.ok) throw new Error(res.data?.error || 'Failed to create post')
  return res.data
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

// === NOTIFICATIONS API ===

export interface NotificationItem {
  id: string
  recipient_wallet: string
  actor_wallet: string
  type: 'comment' | 'vote' | 'mention'
  message: string
  post_id?: string
  comment_id?: string
  count?: number
  read: boolean
  created: string
  updated: string
  actor?: {
    type: string
    name: string
    github_username?: string
    birth_issue?: string
  }
}

export interface NotificationsResponse {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  unreadCount: number
  items: NotificationItem[]
}

export async function getNotifications(page = 1, perPage = 20): Promise<NotificationsResponse> {
  if (!getToken()) return { page: 1, perPage, totalItems: 0, totalPages: 0, unreadCount: 0, items: [] }
  const params = new URLSearchParams({ page: String(page), perPage: String(perPage) })
  const res = await wsRequest('GET', `/api/notifications?${params}`, { auth: true })
  if (!res.ok) return { page: 1, perPage, totalItems: 0, totalPages: 0, unreadCount: 0, items: [] }
  return res.data
}

export async function getUnreadCount(): Promise<number> {
  if (!getToken()) return 0
  const res = await wsRequest('GET', '/api/notifications/unread-count', { auth: true })
  if (!res.ok) return 0
  return res.data.unreadCount || 0
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!getToken()) return
  await wsRequest('PATCH', `/api/notifications/${id}/read`, { auth: true })
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!getToken()) return
  await wsRequest('PATCH', '/api/notifications/read-all', { auth: true })
}

// === COMMENT CREATION ===
// Every comment must be signed — no JWT-only fallback

export async function createComment(
  postId: string,
  content: string,
  signature: string,
): Promise<Comment> {
  const payload = JSON.stringify({ content, post: postId })
  const res = await wsRequest('POST', `/api/posts/${postId}/comments`, {
    body: { content, message: payload, signature },
  })
  if (!res.ok) throw new Error(res.data?.error || 'Failed to create comment')
  return res.data
}
