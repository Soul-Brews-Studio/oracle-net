import { useState } from 'react'
import { Send, ShieldCheck } from 'lucide-react'
import { useSignMessage, useAccount, useChainId } from 'wagmi'
import { API_URL } from '@/lib/pocketbase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from './Button'
import { getAvatarGradient } from '@/lib/utils'

function buildSiweMessage(opts: {
  domain: string; address: string; statement: string;
  uri: string; version: string; chainId: number;
  nonce: string; issuedAt?: string;
}): string {
  const issuedAt = opts.issuedAt || new Date().toISOString()
  return `${opts.domain} wants you to sign in with your Ethereum account:\n${opts.address}\n\n${opts.statement}\n\nURI: ${opts.uri}\nVersion: ${opts.version}\nChain ID: ${opts.chainId}\nNonce: ${opts.nonce}\nIssued At: ${issuedAt}`
}

interface CreatePostProps {
  onPostCreated?: () => void
}

type AuthorOption = { type: 'human'; id: string; name: string } | { type: 'oracle'; id: string; name: string }

export function CreatePost({ onPostCreated }: CreatePostProps) {
  const { human, oracles } = useAuth()
  const { address } = useAccount()
  const chainId = useChainId()
  const { signMessageAsync } = useSignMessage()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedAuthor, setSelectedAuthor] = useState<AuthorOption | null>(null)

  // Can post if has github verified
  const approvedOracles = oracles.filter(o => o.approved)
  const canPost = !!human?.github_username

  // Build author options: Human first, then Oracles
  const authorOptions: AuthorOption[] = []
  if (human) {
    authorOptions.push({ type: 'human', id: human.id, name: human.github_username || human.display_name || 'Human' })
  }
  approvedOracles.forEach(o => {
    authorOptions.push({ type: 'oracle', id: o.id, name: o.oracle_name || o.name })
  })

  // Auto-select human (first option)
  if (!selectedAuthor && authorOptions.length > 0) {
    setSelectedAuthor(authorOptions[0])
  }

  if (!canPost) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim() || !selectedAuthor || !address) return

    setIsSubmitting(true)
    setError('')

    try {
      // 1. Get Chainlink nonce
      const nonceRes = await fetch(`${API_URL}/api/auth/chainlink`)
      if (!nonceRes.ok) throw new Error('Failed to get nonce')
      const nonceData = await nonceRes.json()
      if (!nonceData.roundId) throw new Error('Failed to get roundId')

      // 2. Build SIWE message
      const siweMessage = buildSiweMessage({
        domain: window.location.host,
        address,
        statement: `Post to Oracle Net: ${title.trim().slice(0, 60)}`,
        uri: window.location.origin,
        version: '1',
        chainId: chainId || 1,
        nonce: nonceData.roundId,
      })

      // 3. Sign with wallet (MetaMask popup)
      const signature = await signMessageAsync({ message: siweMessage })

      // 4. Submit with SIWE auth in body
      const postData: Record<string, string> = {
        title: title.trim(),
        content: content.trim(),
        message: siweMessage,
        signature,
      }

      if (selectedAuthor.type === 'human') {
        postData.author = selectedAuthor.id
      } else {
        postData.author = human!.id
        postData.oracle = selectedAuthor.id
      }

      const res = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create post' }))
        throw new Error(err.error || 'Failed to create post')
      }

      setTitle('')
      setContent('')
      onPostCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayAuthor = selectedAuthor || authorOptions[0]

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(displayAuthor?.name || 'H')} text-lg font-bold text-white`}>
          {displayAuthor?.name[0]?.toUpperCase() || 'H'}
        </div>
        <div className="flex items-center gap-2">
          {authorOptions.length > 1 ? (
            <select
              value={selectedAuthor?.id || ''}
              onChange={(e) => {
                const author = authorOptions.find(a => a.id === e.target.value)
                if (author) setSelectedAuthor(author)
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
            >
              {authorOptions.map(a => (
                <option key={a.id} value={a.id}>
                  {a.type === 'human' ? `@${a.name}` : a.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-medium text-slate-100">
              {displayAuthor?.type === 'human' ? `@${displayAuthor.name}` : displayAuthor?.name}
            </span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            displayAuthor?.type === 'human'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-purple-500/20 text-purple-400'
          }`}>
            {displayAuthor?.type === 'human' ? 'Human' : 'Oracle'}
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
          {isSubmitting ? (
            <><ShieldCheck className="mr-2 h-4 w-4 animate-pulse" /> Signing...</>
          ) : (
            <><Send className="mr-2 h-4 w-4" /> Sign & Post</>
          )}
        </Button>
      </div>
    </form>
  )
}
