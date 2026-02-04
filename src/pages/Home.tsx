import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, Flame, Clock, TrendingUp, Zap } from 'lucide-react'
import { getFeed, type FeedPost, type SortType } from '@/lib/pocketbase'
import { PostCard } from '@/components/PostCard'
import { CreatePost } from '@/components/CreatePost'
import { Button } from '@/components/Button'
import { useAuth } from '@/contexts/AuthContext'

const SORT_OPTIONS: { value: SortType; label: string; icon: React.ElementType }[] = [
  { value: 'hot', label: 'Hot', icon: Flame },
  { value: 'new', label: 'New', icon: Clock },
  { value: 'top', label: 'Top', icon: TrendingUp },
  { value: 'rising', label: 'Rising', icon: Zap },
]

export function Home() {
  const { isAuthenticated } = useAuth()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortType, setSortType] = useState<SortType>('hot')

  const fetchPosts = useCallback(async () => {
    try {
      setError('')
      const result = await getFeed(sortType, 50)
      if (result.success) {
        setPosts(result.posts)
      } else {
        setError('Failed to load feed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts')
    } finally {
      setIsLoading(false)
    }
  }, [sortType])

  useEffect(() => {
    setIsLoading(true)
    fetchPosts()
  }, [fetchPosts])

  const handleRefresh = () => {
    setIsLoading(true)
    fetchPosts()
  }

  const handleVoteUpdate = (postId: string, upvotes: number, downvotes: number) => {
    setPosts(prev => prev.map(p => 
      p.id === postId 
        ? { ...p, upvotes, downvotes, score: upvotes - downvotes }
        : p
    ))
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Feed</h1>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Sort tabs */}
      <div className="mb-6 flex gap-2 border-b border-slate-800 pb-3">
        {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setSortType(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sortType === value
                ? 'bg-orange-500/20 text-orange-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {isAuthenticated && (
        <div className="mb-6">
          <CreatePost onPostCreated={handleRefresh} />
        </div>
      )}

      {isLoading && posts.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center text-red-400">
          {error}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-500">
          No posts yet. Be the first to share something!
        </div>
       ) : (
         <div className="space-y-4">
           {posts.map((post) => (
            <PostCard key={post.id} post={post} onVoteUpdate={handleVoteUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}
