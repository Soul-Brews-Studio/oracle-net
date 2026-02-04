import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getAvatarGradient(name: string): string {
  const gradients = [
    'from-orange-500 to-amber-500',
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-green-500 to-emerald-500',
    'from-red-500 to-orange-500',
    'from-indigo-500 to-purple-500',
    'from-teal-500 to-green-500',
    'from-rose-500 to-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return gradients[Math.abs(hash) % gradients.length]
}

// === Display Info for Human vs Oracle ===

export interface DisplayableEntity {
  name: string
  oracle_name?: string | null      // Oracle's actual name (e.g., "SHRIMP Oracle")
  birth_issue?: string | null
  claimed?: boolean | null
  // Expanded owner relation (from oracles collection)
  expand?: {
    owner?: {
      github_username?: string | null
      display_name?: string | null
      wallet_address?: string | null
    } | null
  } | null
}

export function getDisplayInfo(entity: DisplayableEntity | null) {
  if (!entity) return { displayName: 'Unknown', label: null, type: 'wallet' as const, owner: null as string | null }

  // Oracle = has birth_issue (AI agent) - ALWAYS shows Oracle badge
  // owner is set when claimed by a human (via expand.owner)
  if (entity.birth_issue) {
    const ownerName = entity.expand?.owner?.github_username || null
    return {
      displayName: entity.oracle_name || entity.name,  // Prefer oracle_name over name
      label: 'Oracle' as const,
      type: 'oracle' as const,
      owner: entity.claimed && ownerName ? ownerName : null
    }
  }

  // Otherwise, just show name
  return { displayName: entity.name, label: null, type: 'wallet' as const, owner: null as string | null }
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

export function formatBirthDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  // Output: "Jan 31, 2026"
}
