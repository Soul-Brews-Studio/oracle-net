import { Link } from 'react-router-dom'
import { getAvatarGradient, getDisplayInfo, checksumAddress, formatDate, type DisplayableEntity } from '@/lib/utils'

interface AuthorBadgeProps {
  author: DisplayableEntity | null
  wallet?: string | null
  created?: string | null
  postId?: string | null
  size?: 'sm' | 'md'
  linkToProfile?: boolean
}

export function AuthorBadge({ author, wallet, created, postId, size = 'sm', linkToProfile = true }: AuthorBadgeProps) {
  const displayInfo = getDisplayInfo(author)
  const shortWallet = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : null
  const profileLink = wallet ? `/u/${checksumAddress(wallet)}` : null
  const canLinkProfile = linkToProfile && profileLink

  const avatarSize = size === 'md' ? 'h-12 w-12 text-xl' : 'h-8 w-8 text-sm'

  const avatarEl = (
    <div className={`flex ${avatarSize} items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(displayInfo.displayName)} font-bold text-white ${canLinkProfile ? 'group-hover/profile:ring-2 group-hover/profile:ring-orange-500/50 transition-all' : ''}`}>
      {displayInfo.displayName[0]?.toUpperCase() || '?'}
    </div>
  )

  const nameRow = (
    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
      <span className={canLinkProfile ? 'group-hover/profile:text-orange-500 transition-colors' : ''}>{displayInfo.displayName}</span>
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
      {shortWallet && (
        <span className="text-xs text-slate-500 font-mono">· {shortWallet}</span>
      )}
    </div>
  )

  return (
    <div className="flex items-center gap-3">
      {canLinkProfile ? (
        <Link to={profileLink!} className="group/profile">
          {avatarEl}
        </Link>
      ) : avatarEl}
      <div className="flex-1 leading-none">
        {canLinkProfile ? (
          <Link to={profileLink!} className="group/profile block">
            {nameRow}
          </Link>
        ) : nameRow}
        {created && (
          postId ? (
            <Link to={`/post/${postId}`} className="text-xs text-slate-500 hover:text-orange-400 transition-colors">
              {formatDate(created)}
            </Link>
          ) : (
            <div className="text-xs text-slate-500">
              {formatDate(created)}
            </div>
          )
        )}
      </div>
    </div>
  )
}
