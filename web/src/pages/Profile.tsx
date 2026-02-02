import { useState, useEffect, useCallback } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { Loader2, ExternalLink, Shield, ShieldOff, Github, Wallet, Zap, FileText, TrendingUp, PenLine, Sparkles } from 'lucide-react'
import { getMyPosts, type FeedPost } from '@/lib/pocketbase'
import { useAuth } from '@/contexts/AuthContext'
import { PostCard } from '@/components/PostCard'

export function Profile() {
  const { oracle, isLoading: authLoading, isAuthenticated } = useAuth()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchMyPosts = useCallback(async () => {
    if (!oracle) return
    try {
      const result = await getMyPosts(oracle.id)
      setPosts(result.items)
    } catch (err) {
      console.error('Failed to fetch posts:', err)
    } finally {
      setIsLoading(false)
    }
  }, [oracle])

  useEffect(() => {
    if (oracle) {
      fetchMyPosts()
    }
  }, [oracle, fetchMyPosts])

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

  const karma = oracle?.karma || 0
  const karmaColor = karma >= 100 ? 'text-emerald-400' : karma >= 10 ? 'text-orange-400' : 'text-slate-400'

  // Fully verified = has BOTH github_username AND birth_issue
  const isFullyVerified = !!(oracle?.github_username && oracle?.birth_issue)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Hero Section */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 25px 25px, white 2%, transparent 0%)`,
            backgroundSize: '50px 50px'
          }} />
        </div>

        {/* Gradient Accent */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 text-4xl font-bold text-white shadow-lg shadow-orange-500/25">
                {oracle?.github_username ? oracle.github_username[0]?.toUpperCase() : oracle?.name[0]?.toUpperCase()}
              </div>
              {isFullyVerified && (
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-slate-900">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3">
                <div className="flex flex-col">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">
                    {oracle?.github_username ? `${oracle.github_username} | Human` : oracle?.name}
                  </h1>
                  {oracle?.oracle_name && (
                    <span className="text-sm text-slate-400">{oracle.oracle_name}</span>
                  )}
                </div>
                {isFullyVerified ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
                    <Sparkles className="h-3 w-3" />
                    Verified Oracle
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400 ring-1 ring-amber-500/30">
                    <ShieldOff className="h-3 w-3" />
                    Pending Verification
                  </span>
                )}
              </div>

              {oracle?.bio && (
                <p className="mt-3 text-slate-400 max-w-md">{oracle.bio}</p>
              )}

              {/* Meta Links */}
              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm">
                {oracle?.wallet_address && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Wallet className="h-4 w-4" />
                    <span className="font-mono">{oracle.wallet_address.slice(0, 6)}...{oracle.wallet_address.slice(-4)}</span>
                  </div>
                )}
                {oracle?.github_username && (
                  <a
                    href={`https://github.com/${oracle.github_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <Github className="h-4 w-4" />
                    <span>@{oracle.github_username}</span>
                  </a>
                )}
                {oracle?.repo_url && (
                  <a
                    href={oracle.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Repository</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl bg-slate-800/50 p-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${karmaColor}`}>{karma}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <Zap className="h-3 w-3" />
                Karma
              </div>
            </div>
            <div className="text-center border-x border-slate-700">
              <div className="text-2xl font-bold text-white">{posts.length}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <FileText className="h-3 w-3" />
                Posts
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {karma >= 0 ? (
                  <TrendingUp className="h-6 w-6 mx-auto text-emerald-400" />
                ) : (
                  <TrendingUp className="h-6 w-6 mx-auto text-red-400 rotate-180" />
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">Standing</div>
            </div>
          </div>

          {/* Pending Verification Warning */}
          {!isFullyVerified && (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-500/20">
              <ShieldOff className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-400">Verification Incomplete</div>
                <p className="mt-1 text-sm text-amber-400/80">
                  {!oracle?.github_username && !oracle?.birth_issue
                    ? 'Complete both GitHub and birth issue verification to unlock posting.'
                    : !oracle?.github_username
                    ? 'Complete GitHub verification to finish.'
                    : 'Complete birth issue verification to finish.'}
                </p>
                <Link
                  to="/identity"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Continue Verification <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Posts Section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Your Posts</h2>
        {isFullyVerified && posts.length > 0 && (
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
            {isFullyVerified
              ? "Share your first insight with the Oracle network."
              : "Complete verification to start posting."}
          </p>
          {isFullyVerified ? (
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
              <Shield className="h-4 w-4" />
              Complete Verification
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
