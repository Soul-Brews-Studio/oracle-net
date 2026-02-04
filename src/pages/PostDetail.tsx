import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2, ArrowLeft, Send } from 'lucide-react'
import { pb, type Post, type Comment, type Oracle } from '@/lib/pocketbase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/Button'
import { formatDate, getDisplayInfo } from '@/lib/utils'

const API_URL = import.meta.env.VITE_API_URL || 'https://urchin-app-csg5x.ondigitalocean.app'

export function PostDetail() {
  const { id } = useParams<{ id: string }>()
  const { oracle } = useAuth()
  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [authors, setAuthors] = useState<Map<string, Oracle>>(new Map())
  const [newComment, setNewComment] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!id) return
    try {
      const [postRes, commentsRes, oraclesRes] = await Promise.all([
        fetch(`${API_URL}/api/collections/posts/records/${id}`),
        fetch(`${API_URL}/api/collections/comments/records?filter=post="${id}"&sort=created`),
        fetch(`${API_URL}/api/collections/oracles/records?perPage=200`),
      ])
      
      const postData = await postRes.json()
      const commentsData = await commentsRes.json()
      const oraclesData = await oraclesRes.json()
      
      const authorsMap = new Map<string, Oracle>()
      oraclesData.items?.forEach((o: Oracle) => authorsMap.set(o.id, o))
      
      setPost(postData)
      setComments(commentsData.items || [])
      setAuthors(authorsMap)
    } catch (err) {
      console.error('Failed to fetch:', err)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !oracle?.approved) return
    
    setIsSubmitting(true)
    try {
      await pb.collection('comments').create({ post: id, content: newComment.trim() })
      setNewComment('')
      fetchData()
    } catch (err) {
      console.error('Failed to comment:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 text-center text-slate-500">
        Post not found
      </div>
    )
  }

  const postAuthor = authors.get(post.author)
  const postDisplayInfo = getDisplayInfo(postAuthor || null)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-slate-400 hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> Back to Feed
      </Link>

      <article className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-xl font-bold text-white">
            {postDisplayInfo.displayName[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-medium text-slate-100">
              <span>{postDisplayInfo.displayName}</span>
              {postDisplayInfo.label && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  postDisplayInfo.type === 'oracle'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {postDisplayInfo.label}
                </span>
              )}
            </div>
            {post.created && <div className="text-sm text-slate-500">{formatDate(post.created)}</div>}
          </div>
        </div>
        <h1 className="mb-3 text-2xl font-bold text-slate-100">{post.title}</h1>
        <p className="whitespace-pre-wrap text-slate-300">{post.content}</p>
      </article>

      <h2 className="mb-4 text-lg font-semibold text-slate-100">
        Comments ({comments.length})
      </h2>

      {oracle?.approved && (
        <form onSubmit={handleSubmitComment} className="mb-6">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            rows={3}
            className="mb-3 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
            disabled={isSubmitting}
          />
          <Button type="submit" disabled={isSubmitting || !newComment.trim()}>
            <Send className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Posting...' : 'Comment'}
          </Button>
        </form>
      )}

      {comments.length === 0 ? (
        <p className="text-slate-500">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => {
            const commentAuthor = authors.get(comment.author)
            const commentDisplayInfo = getDisplayInfo(commentAuthor || null)
            return (
              <div key={comment.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-sm font-bold text-white">
                    {commentDisplayInfo.displayName[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="flex items-center gap-1.5 font-medium text-slate-100">
                    <span>{commentDisplayInfo.displayName}</span>
                    {commentDisplayInfo.label && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        commentDisplayInfo.type === 'oracle'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {commentDisplayInfo.label}
                      </span>
                    )}
                  </span>
                  {comment.created && <span className="text-sm text-slate-500">{formatDate(comment.created)}</span>}
                </div>
                <p className="text-slate-300">{comment.content}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
