# Plan: OracleNet Frontend Improvements

**Created**: 2026-02-01 16:50 GMT+7
**Status**: Ready for execution
**Estimated Time**: 15-20 minutes

## Overview

Fix visual issues and add missing post detail page with comments functionality.

---

## Task 1: Increase Post Spacing

**File**: `web/src/pages/Home.tsx`
**Line**: 64
**Change**: `space-y-4` → `space-y-6`

```diff
- <div className="space-y-4">
+ <div className="space-y-6">
```

**Rationale**: Posts currently blend together visually. More vertical spacing improves scannability.

---

## Task 2: Create Post Detail Page

**File**: `web/src/pages/PostDetail.tsx` (NEW)

### Requirements
- Display single post with full content
- Show comments list
- Allow approved oracles to add comments
- Back navigation to feed
- Fetch post, comments, and authors data

### Implementation

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2, ArrowLeft, Send } from 'lucide-react'
import { pb, type Post, type Comment, type Oracle } from '@/lib/pocketbase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/Button'
import { formatDate } from '@/lib/utils'

const API_URL = 'http://165.22.108.148:8090'

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-slate-400 hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> Back to Feed
      </Link>

      <article className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-xl font-bold text-white">
            {postAuthor?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="font-medium text-slate-100">{postAuthor?.name || 'Unknown'}</div>
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
            return (
              <div key={comment.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-sm font-bold text-white">
                    {commentAuthor?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="font-medium text-slate-100">{commentAuthor?.name || 'Unknown'}</span>
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
```

---

## Task 3: Add Route to App.tsx

**File**: `web/src/App.tsx`

### Add Import (line 7)
```tsx
import { PostDetail } from '@/pages/PostDetail'
```

### Add Route (inside Routes, after line 19)
```tsx
<Route path="/post/:id" element={<PostDetail />} />
```

### Full Updated App.tsx

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { Navbar } from '@/components/Navbar'
import { Home } from '@/pages/Home'
import { Oracles } from '@/pages/Oracles'
import { Profile } from '@/pages/Profile'
import { Login } from '@/pages/Login'
import { PostDetail } from '@/pages/PostDetail'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-slate-950">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/oracles" element={<Oracles />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/login" element={<Login />} />
              <Route path="/post/:id" element={<PostDetail />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

---

## Task 4: Add Comment Type Export

**File**: `web/src/lib/pocketbase.ts`

Ensure `Comment` type is exported (already exists at line 33-43).

---

## Task 5: Build & Verify

```bash
cd /Users/nat/Code/github.com/Soul-Brews-Studio/oracle-net/web
npm run build
```

### Expected Outcome
- Build succeeds with no TypeScript errors
- Post detail page renders at `/post/:id`
- Comments load and display
- Approved users can add comments
- More spacing between posts on feed

---

## Task 6: Test Flow

1. Go to http://localhost:5173
2. Click "Comments" on any post
3. Verify post detail page loads
4. Login as SHRIMP (`shrimp@oracle.family` / `shrimp123456`)
5. Add a comment
6. Verify comment appears

---

## Verification Checklist

- [ ] `space-y-6` applied to feed posts
- [ ] PostDetail.tsx created
- [ ] Route added to App.tsx
- [ ] Build passes
- [ ] Post detail page renders
- [ ] Comments display
- [ ] Can add comments (when logged in + approved)
- [ ] Back button works

---

## Execution Command

```bash
/start-work
```

Or delegate to a build agent to execute this plan.
