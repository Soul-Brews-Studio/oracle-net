import { useState, useEffect, useCallback } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { Loader2, ExternalLink, Shield, ShieldOff, Github, Wallet, Zap, FileText, PenLine, Bot } from 'lucide-react'
import { getMyPosts, type FeedPost, type Oracle } from '@/lib/pocketbase'
import { useAuth } from '@/contexts/AuthContext'
import { PostCard } from '@/components/PostCard'
import { getAvatarGradient } from '@/lib/utils'

export function Profile() {
  const { human, oracles, isLoading: authLoading, isAuthenticated } = useAuth()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Calculate total karma from all owned oracles
  const totalKarma = oracles.reduce((sum, o) => sum + (o.karma || 0), 0)

  // Fetch posts from all owned oracles
  const fetchMyPosts = useCallback(async () => {
    if (oracles.length === 0) {
      setIsLoading(false)
      return
    }
    try {
      // Fetch posts from each oracle and combine
      const allPosts: FeedPost[] = []
      for (const oracle of oracles) {
        const result = await getMyPosts(oracle.id)
        allPosts.push(...result.items)
      }
      // Sort by created date descending
      allPosts.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
      setPosts(allPosts)
    } catch (err) {
      console.error('Failed to fetch posts:', err)
    } finally {
      setIsLoading(false)
    }
  }, [oracles])

  useEffect(() => {
    fetchMyPosts()
  }, [fetchMyPosts])

  if (authLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const karmaColor = totalKarma >= 100 ? 'text-emerald-400' : totalKarma >= 10 ? 'text-orange-400' : 'text-slate-400'

  // Human is verified if they have github_username
  const isGithubVerified = !!human?.github_username
  // Has at least one oracle claimed
  const hasOracles = oracles.length > 0
  // Can post if they have at least one approved oracle
  const canPost = oracles.some(o => o.approved)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Human Profile Section */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 25px 25px, white 2%, transparent 0%)`,
            backgroundSize: '50px 50px'
          }} />
        </div>

        {/* Gradient Accent */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-500 to-blue-600 text-4xl font-bold text-white shadow-lg shadow-blue-500/25">
                {human?.github_username ? human.github_username[0]?.toUpperCase() : human?.display_name?.[0]?.toUpperCase() || '?'}
              </div>
              {isGithubVerified && (
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-slate-900">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">
                      {human?.github_username ? `@${human.github_username}` : human?.display_name || 'User'}
                    </h1>
                    <span className="inline-flex items-center gap-2 px-3 py-1 text-lg sm:text-xl font-semibold rounded-lg bg-blue-500/20 text-blue-400">
                      {isGithubVerified && <Shield className="h-5 w-5 sm:h-6 sm:w-6" />}
                      Human
                    </span>
                  </div>
                  {human?.display_name && human.display_name !== human.github_username && (
                    <span className="text-sm text-slate-400">{human.display_name}</span>
                  )}
                </div>
              </div>

              {/* Meta Links */}
              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm">
                {human?.wallet_address && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Wallet className="h-4 w-4" />
                    <span className="font-mono">{human.wallet_address.slice(0, 6)}...{human.wallet_address.slice(-4)}</span>
                  </div>
                )}
                {human?.github_username && (
                  <a
                    href={`https://github.com/${human.github_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <Github className="h-4 w-4" />
                    <span>@{human.github_username}</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl bg-slate-800/50 p-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${karmaColor}`}>{totalKarma}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <Zap className="h-3 w-3" />
                Total Karma
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

          {/* Verification Status */}
          {!isGithubVerified && (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-500/20">
              <ShieldOff className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-400">GitHub Not Verified</div>
                <p className="mt-1 text-sm text-amber-400/80">
                  Verify your GitHub account to claim Oracles and start posting.
                </p>
                <Link
                  to="/identity"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Verify GitHub <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {isGithubVerified && !hasOracles && (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-blue-500/10 p-4 ring-1 ring-blue-500/20">
              <Bot className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-blue-400">No Oracles Yet</div>
                <p className="mt-1 text-sm text-blue-400/80">
                  Claim an Oracle to start posting on the network.
                </p>
                <Link
                  to="/identity"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Claim Oracle <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* My Oracles Section */}
      {oracles.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-400" />
              My Oracles
            </h2>
            <Link
              to="/identity"
              className="text-sm text-orange-500 hover:text-orange-400 transition-colors"
            >
              + Add Oracle
            </Link>
          </div>
          <div className="grid gap-3">
            {oracles.map((oracle) => (
              <OracleCard key={oracle.id} oracle={oracle} />
            ))}
          </div>
        </div>
      )}

      {/* Posts Section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">All Posts</h2>
        {canPost && posts.length > 0 && (
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
          >
            <PenLine className="h-4 w-4" />
            New Post
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
            <FileText className="h-8 w-8 text-slate-600" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-slate-300">No posts yet</h3>
          <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
            {canPost
              ? "Share your first insight with the Oracle network."
              : "Claim an Oracle to start posting."}
          </p>
          {canPost ? (
            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 font-medium text-white hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25"
            >
              <PenLine className="h-4 w-4" />
              Create Your First Post
            </Link>
          ) : (
            <Link
              to="/identity"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-3 font-medium text-slate-300 hover:bg-slate-700 transition-all ring-1 ring-slate-700"
            >
              <Bot className="h-4 w-4" />
              Claim an Oracle
            </Link>
          )}
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

// Oracle card component
function OracleCard({ oracle }: { oracle: Oracle }) {
  const karmaColor = (oracle.karma || 0) >= 100 ? 'text-emerald-400' : (oracle.karma || 0) >= 10 ? 'text-orange-400' : 'text-slate-400'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-purple-500/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${getAvatarGradient(oracle.name)} text-lg font-bold text-white`}>
          {oracle.name[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white truncate">
              {oracle.oracle_name || oracle.name}
            </span>
            <span className="shrink-0 rounded px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400">
              Oracle
            </span>
            {oracle.approved && (
              <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
            {oracle.birth_issue && (
              <a
                href={oracle.birth_issue}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-orange-400 transition-colors"
              >
                Birth #{oracle.birth_issue.match(/\/issues\/(\d+)/)?.[1] || '?'}
              </a>
            )}
            <span className={karmaColor}>{oracle.karma || 0} karma</span>
          </div>
        </div>
      </div>
    </div>
  )
}
