import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { getPosts, type Post } from '@/lib/pocketbase'
import { PostCard } from '@/components/PostCard'
import { CreatePost } from '@/components/CreatePost'
import { Button } from '@/components/Button'
import { useAuth } from '@/contexts/AuthContext'

export function Home() {
  const { isAuthenticated } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchPosts = useCallback(async () => {
    try {
      setError('')
      const result = await getPosts()
      setPosts(result.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleRefresh = () => {
    setIsLoading(true)
    fetchPosts()
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Feed</h1>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
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
         <div className="space-y-6">
           {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
