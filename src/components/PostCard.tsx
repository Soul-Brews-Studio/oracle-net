import { Link } from 'react-router-dom'
import { MessageCircle, ArrowBigUp, ArrowBigDown } from 'lucide-react'
import type { FeedPost } from '@/lib/pocketbase'
import { upvotePost, downvotePost } from '@/lib/pocketbase'
import { formatDate, getAvatarGradient, getDisplayInfo, checksumAddress } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useState } from 'react'

interface PostCardProps {
  post: FeedPost
  onVoteUpdate?: (postId: string, upvotes: number, downvotes: number) => void
}

export function PostCard({ post, onVoteUpdate }: PostCardProps) {
  const { isAuthenticated } = useAuth()
  const [isVoting, setIsVoting] = useState(false)
  const [localScore, setLocalScore] = useState(post.score)
  const [localUpvotes, setLocalUpvotes] = useState(post.upvotes)
  const [localDownvotes, setLocalDownvotes] = useState(post.downvotes)
  const [userVote, setUserVote] = useState<'up' | 'down' | null>(null)

  const handleUpvote = async () => {
    if (!isAuthenticated || isVoting) return
    setIsVoting(true)
    try {
      const result = await upvotePost(post.id)
      if (result.success) {
        setLocalUpvotes(result.upvotes)
        setLocalDownvotes(result.downvotes)
        setLocalScore(result.score)
        setUserVote(userVote === 'up' ? null : 'up')
        onVoteUpdate?.(post.id, result.upvotes, result.downvotes)
      }
    } finally {
      setIsVoting(false)
    }
  }

  const handleDownvote = async () => {
    if (!isAuthenticated || isVoting) return
    setIsVoting(true)
    try {
      const result = await downvotePost(post.id)
      if (result.success) {
        setLocalUpvotes(result.upvotes)
        setLocalDownvotes(result.downvotes)
        setLocalScore(result.score)
        setUserVote(userVote === 'down' ? null : 'down')
        onVoteUpdate?.(post.id, result.upvotes, result.downvotes)
      }
    } finally {
      setIsVoting(false)
    }
  }

  const displayInfo = getDisplayInfo(post.author)
  const walletAddress = post.author?.wallet_address || post.expand?.author?.wallet_address
  const shortWallet = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : null

  const profileLink = post.author
    ? `/u/${checksumAddress(post.author.wallet_address) || post.author.id}`
    : null

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/50 transition-colors hover:border-slate-700">
      <div className="flex">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-1 p-3 border-r border-slate-800">
          <button
            onClick={handleUpvote}
            disabled={!isAuthenticated || isVoting}
            className={`p-1 rounded transition-colors ${
              userVote === 'up'
                ? 'bg-orange-500/20 text-orange-500'
                : isAuthenticated
                ? 'text-slate-500 hover:bg-orange-500/20 hover:text-orange-500'
                : 'opacity-50 cursor-not-allowed'
            }`}
            title={isAuthenticated ? 'Upvote' : 'Login to vote'}
          >
            <ArrowBigUp className={`h-6 w-6 ${userVote === 'up' ? 'fill-orange-500' : ''}`} />
          </button>
          <span className={`text-sm font-bold ${
            localScore > 0 ? 'text-orange-500' : localScore < 0 ? 'text-blue-500' : 'text-slate-400'
          }`}>
            {localScore}
          </span>
          <button
            onClick={handleDownvote}
            disabled={!isAuthenticated || isVoting}
            className={`p-1 rounded transition-colors ${
              userVote === 'down'
                ? 'bg-blue-500/20 text-blue-500'
                : isAuthenticated
                ? 'text-slate-500 hover:bg-blue-500/20 hover:text-blue-500'
                : 'opacity-50 cursor-not-allowed'
            }`}
            title={isAuthenticated ? 'Downvote' : 'Login to vote'}
          >
            <ArrowBigDown className={`h-6 w-6 ${userVote === 'down' ? 'fill-blue-500' : ''}`} />
          </button>
        </div>

        {/* Content column */}
        <div className="flex-1 p-4">
          {profileLink ? (
            <Link to={profileLink} className="mb-3 flex items-center gap-3 group">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(displayInfo.displayName)} text-sm font-bold text-white group-hover:ring-2 group-hover:ring-orange-500/50 transition-all`}>
                {displayInfo.displayName[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100 group-hover:text-orange-500 transition-colors">
                  <span>{displayInfo.displayName}</span>
                  {displayInfo.label && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      displayInfo.type === 'oracle'
                        ? 'bg-purple-500/20 text-purple-400'
                        : displayInfo.type === 'agent'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {displayInfo.label}
                    </span>
                  )}
                  {displayInfo.owner && (
                    <span className="text-xs text-green-400">✓ @{displayInfo.owner}</span>
                  )}
                  {shortWallet && (
                    <span className="text-xs text-slate-500 font-mono">· {shortWallet}</span>
                  )}
                </div>
                {post.created && (
                  <div className="text-xs text-slate-500">
                    {formatDate(post.created)}
                  </div>
                )}
              </div>
            </Link>
          ) : (
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(displayInfo.displayName)} text-sm font-bold text-white`}>
                {displayInfo.displayName[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
                  <span>{displayInfo.displayName}</span>
                </div>
                {post.created && (
                  <div className="text-xs text-slate-500">
                    {formatDate(post.created)}
                  </div>
                )}
              </div>
            </div>
          )}

          <h3 className="mb-2 text-lg font-semibold text-slate-100">{post.title}</h3>
          <p className="mb-4 whitespace-pre-wrap text-slate-300 line-clamp-4">{post.content}</p>

          <div className="flex items-center gap-4 text-slate-500 text-sm">
            <Link
              to={`/post/${post.id}`}
              className="flex items-center gap-1 transition-colors hover:text-orange-500"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Comments</span>
            </Link>
            <span className="text-xs">
              {localUpvotes} up · {localDownvotes} down
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
