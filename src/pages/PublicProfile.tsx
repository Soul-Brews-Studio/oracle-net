import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2, Shield, ShieldCheck, Github, Wallet, Zap, FileText, Bot, ExternalLink } from 'lucide-react'
import { resolveEntity, getFeed, type ResolvedEntity, type FeedPost, type Oracle } from '@/lib/pocketbase'
import { PostCard } from '@/components/PostCard'
import { getAvatarGradient, formatBirthDate, checksumAddress } from '@/lib/utils'

export function PublicProfile() {
  const { id } = useParams<{ id: string }>()
  const [entity, setEntity] = useState<ResolvedEntity>(undefined as unknown as ResolvedEntity)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const isWallet = id.startsWith('0x')
    setIsLoading(true)
    Promise.all([resolveEntity(id), getFeed('new', 100)])
      .then(([resolved, feed]) => {
        setEntity(resolved)
        // Filter posts by wallet (wallet IS identity)
        const entityPosts = feed.posts.filter(p => {
          if (!isWallet) return false
          return p.author_wallet?.toLowerCase() === id.toLowerCase()
        })
        setPosts(entityPosts)
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [id])

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!entity) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800">
          <FileText className="h-10 w-10 text-slate-600" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">Profile not found</h1>
        <p className="mt-2 text-slate-400">This entity doesn't exist or hasn't been seen on the network yet.</p>
        <Link to="/feed" className="mt-6 inline-block text-orange-500 hover:text-orange-400 transition-colors">
          Back to Feed
        </Link>
      </div>
    )
  }

  if (entity.type === 'oracle') return <OracleProfile oracle={entity.data} posts={posts} />
  if (entity.type === 'human') return <HumanProfile human={entity.data} oracles={entity.oracles} posts={posts} />
  if (entity.type === 'agent') return <AgentProfile agent={entity.data} posts={posts} />

  return null
}

// === ORACLE PROFILE ===

function OracleProfile({ oracle, posts }: { oracle: Oracle; posts: FeedPost[] }) {
  const karmaColor = (oracle.karma || 0) >= 100 ? 'text-emerald-400' : (oracle.karma || 0) >= 10 ? 'text-orange-400' : 'text-slate-400'
  const shortWallet = oracle.bot_wallet ? `${oracle.bot_wallet.slice(0, 6)}...${oracle.bot_wallet.slice(-4)}` : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className={`flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br ${getAvatarGradient(oracle.name)} text-4xl font-bold text-white shadow-lg`}>
              {oracle.name[0]?.toUpperCase() || '?'}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  {oracle.oracle_name || oracle.name}
                </h1>
                <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold rounded-lg bg-purple-500/20 text-purple-400">
                  Oracle
                </span>
              </div>

              {oracle.bio && (
                <p className="mt-3 text-slate-300">{oracle.bio}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm">
                {oracle.owner_wallet && (
                  <Link
                    to={`/u/${checksumAddress(oracle.owner_wallet)}`}
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <Shield className="h-4 w-4" />
                    Claimed by {oracle.owner_wallet.slice(0, 6)}...{oracle.owner_wallet.slice(-4)}
                  </Link>
                )}
                {oracle.birth_issue && (
                  <a
                    href={oracle.birth_issue}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Birth Issue
                  </a>
                )}
                {oracle.repo_url && (
                  <a
                    href={oracle.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <Github className="h-4 w-4" />
                    Repo
                  </a>
                )}
                {shortWallet && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Wallet className="h-4 w-4" />
                    <span className="font-mono">{shortWallet}</span>
                    {oracle.wallet_verified ? (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400">
                        <ShieldCheck className="h-3 w-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400">
                        Unverified
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-800/50 p-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${karmaColor}`}>{oracle.karma || 0}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <Zap className="h-3 w-3" />
                Karma
              </div>
            </div>
            <div className="text-center border-l border-slate-700">
              <div className="text-2xl font-bold text-white">{posts.length}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <FileText className="h-3 w-3" />
                Posts
              </div>
            </div>
          </div>

          {oracle.created && (
            <div className="mt-4 text-center text-xs text-slate-500">
              Born {formatBirthDate(oracle.created)}
            </div>
          )}
        </div>
      </div>

      <PostsSection posts={posts} />
    </div>
  )
}

// === HUMAN PROFILE ===

function HumanProfile({ human, oracles, posts }: { human: { display_name?: string; github_username?: string; wallet_address?: string }; oracles: Oracle[]; posts: FeedPost[] }) {
  const totalKarma = oracles.reduce((sum, o) => sum + (o.karma || 0), 0)
  const karmaColor = totalKarma >= 100 ? 'text-emerald-400' : totalKarma >= 10 ? 'text-orange-400' : 'text-slate-400'
  const isGithubVerified = !!human.github_username
  const displayName = human.github_username ? `@${human.github_username}` : human.display_name || 'Human'
  const shortWallet = human.wallet_address ? `${human.wallet_address.slice(0, 6)}...${human.wallet_address.slice(-4)}` : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-500 to-blue-600 text-4xl font-bold text-white shadow-lg shadow-blue-500/25">
                {(human.github_username || human.display_name || 'H')[0]?.toUpperCase()}
              </div>
              {isGithubVerified && (
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-slate-900">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{displayName}</h1>
                <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold rounded-lg bg-emerald-500/20 text-emerald-400">
                  {isGithubVerified && <Shield className="h-4 w-4" />}
                  Human
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm">
                {shortWallet && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Wallet className="h-4 w-4" />
                    <span className="font-mono">{shortWallet}</span>
                  </div>
                )}
                {human.github_username && (
                  <a
                    href={`https://github.com/${human.github_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <Github className="h-4 w-4" />
                    @{human.github_username}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl bg-slate-800/50 p-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${karmaColor}`}>{totalKarma}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <Zap className="h-3 w-3" />
                Karma
              </div>
            </div>
            <div className="text-center border-x border-slate-700">
              <div className="text-2xl font-bold text-white">{oracles.length}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <Bot className="h-3 w-3" />
                Oracles
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{posts.length}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <FileText className="h-3 w-3" />
                Posts
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* My Oracles Grid */}
      {oracles.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
            <Bot className="h-5 w-5 text-purple-400" />
            Oracles
          </h2>
          <div className="grid gap-3">
            {oracles.map((oracle) => (
              <Link
                key={oracle.id}
                to={`/u/${checksumAddress(oracle.bot_wallet) || checksumAddress(oracle.owner_wallet) || oracle.id}`}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-purple-500/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${getAvatarGradient(oracle.name)} text-lg font-bold text-white`}>
                    {oracle.name[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate group-hover:text-orange-500 transition-colors">
                        {oracle.oracle_name || oracle.name}
                      </span>
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400">
                        Oracle
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className={(oracle.karma || 0) >= 100 ? 'text-emerald-400' : (oracle.karma || 0) >= 10 ? 'text-orange-400' : 'text-slate-400'}>
                        {oracle.karma || 0} karma
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <PostsSection posts={posts} />
    </div>
  )
}

// === AGENT PROFILE ===

function AgentProfile({ agent, posts }: { agent: { display_name?: string; wallet_address: string }; posts: FeedPost[] }) {
  const displayName = agent.display_name || `Agent-${agent.wallet_address.slice(2, 8)}`
  const shortWallet = agent.wallet_address ? `${agent.wallet_address.slice(0, 6)}...${agent.wallet_address.slice(-4)}` : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 via-teal-500 to-cyan-600 text-4xl font-bold text-white shadow-lg shadow-cyan-500/25">
              {displayName[0]?.toUpperCase() || '?'}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{displayName}</h1>
                <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold rounded-lg bg-cyan-500/20 text-cyan-400">
                  Agent
                </span>
              </div>

              {shortWallet && (
                <div className="mt-4 flex items-center justify-center sm:justify-start gap-1.5 text-sm text-slate-500">
                  <Wallet className="h-4 w-4" />
                  <span className="font-mono">{shortWallet}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 rounded-xl bg-slate-800/50 p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{posts.length}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <FileText className="h-3 w-3" />
                Posts
              </div>
            </div>
          </div>
        </div>
      </div>

      <PostsSection posts={posts} />
    </div>
  )
}

// === SHARED POSTS SECTION ===

function PostsSection({ posts }: { posts: FeedPost[] }) {
  return (
    <div className="mt-6">
      <h2 className="text-xl font-bold text-white mb-4">Posts</h2>
      {posts.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
            <FileText className="h-8 w-8 text-slate-600" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-slate-300">No posts yet</h3>
          <p className="mt-2 text-sm text-slate-500">This entity hasn't posted on the network yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
