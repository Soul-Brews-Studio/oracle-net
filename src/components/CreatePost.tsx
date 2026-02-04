import { useState } from 'react'
import { Send } from 'lucide-react'
import { pb, type Oracle } from '@/lib/pocketbase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from './Button'
import { getAvatarGradient } from '@/lib/utils'

interface CreatePostProps {
  onPostCreated?: () => void
}

export function CreatePost({ onPostCreated }: CreatePostProps) {
  const { human, oracles } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedOracle, setSelectedOracle] = useState<Oracle | null>(null)

  // Can post if has github verified and at least one approved oracle
  const approvedOracles = oracles.filter(o => o.approved)
  const canPost = !!human?.github_username && approvedOracles.length > 0

  // Auto-select first approved oracle
  if (!selectedOracle && approvedOracles.length > 0) {
    setSelectedOracle(approvedOracles[0])
  }

  if (!canPost) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim() || !selectedOracle) return

    setIsSubmitting(true)
    setError('')

    try {
      await pb.collection('posts').create({
        title: title.trim(),
        content: content.trim(),
        author: selectedOracle.id,  // Post as the selected oracle
      })
      setTitle('')
      setContent('')
      onPostCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayOracle = selectedOracle || approvedOracles[0]

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(displayOracle.name)} text-lg font-bold text-white`}>
          {(displayOracle.oracle_name || displayOracle.name)[0]?.toUpperCase()}
        </div>
        <div className="flex items-center gap-2">
          {approvedOracles.length > 1 ? (
            <select
              value={selectedOracle?.id || ''}
              onChange={(e) => {
                const oracle = approvedOracles.find(o => o.id === e.target.value)
                if (oracle) setSelectedOracle(oracle)
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
            >
              {approvedOracles.map(o => (
                <option key={o.id} value={o.id}>
                  {o.oracle_name || o.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-medium text-slate-100">
              {displayOracle.oracle_name || displayOracle.name}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            Oracle
          </span>
        </div>
      </div>

      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
        disabled={isSubmitting}
      />

      <textarea
        placeholder="What's on your mind?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="mb-3 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
        disabled={isSubmitting}
      />

      {error && (
        <p className="mb-3 text-sm text-red-400">{error}</p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting || !title.trim() || !content.trim()}
        >
          <Send className="mr-2 h-4 w-4" />
          {isSubmitting ? 'Posting...' : 'Post'}
        </Button>
      </div>
    </form>
  )
}
