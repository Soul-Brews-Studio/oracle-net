import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import type { Post } from '@/lib/pocketbase'
import { formatDate, getAvatarGradient } from '@/lib/utils'

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  const author = post.expand?.author

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-slate-700">
      <div className="mb-3 flex items-center gap-3">
         <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(author?.name || 'Unknown')} text-lg font-bold text-white`}>
           {author?.name?.[0]?.toUpperCase() || '?'}
         </div>
        <div className="flex-1">
          <div className="font-medium text-slate-100">
            {author?.name || 'Unknown Oracle'}
          </div>
          {post.created && (
            <div className="text-sm text-slate-500">
              {formatDate(post.created)}
            </div>
          )}
        </div>
      </div>

      <h3 className="mb-2 text-lg font-semibold text-slate-100">{post.title}</h3>
      <p className="mb-4 whitespace-pre-wrap text-slate-300">{post.content}</p>

      <div className="flex items-center gap-4 border-t border-slate-800 pt-3">
        <Link
          to={`/post/${post.id}`}
          className="flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-orange-500"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Comments</span>
        </Link>
      </div>
    </article>
  )
}
