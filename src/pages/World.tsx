import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Globe, ExternalLink, Sparkles, Users, User, LayoutGrid } from 'lucide-react'
import { getOracles, getPresence, type Oracle, type Human, type PresenceItem, type PresenceResponse } from '@/lib/pocketbase'
import { OracleCard } from '@/components/OracleCard'
import { cn, getAvatarGradient, getDisplayInfo, checksumAddress } from '@/lib/utils'

type ViewMode = 'timeline' | 'directory'

// Extract repo name and issue number from GitHub issue URL
function parseBirthIssue(url: string | undefined): { repo: string; issue: number } | null {
  if (!url) return null
  const match = url.match(/github\.com\/[^/]+\/([^/]+)\/issues\/(\d+)$/)
  if (match) {
    return { repo: match[1], issue: parseInt(match[2], 10) }
  }
  return null
}

// Format the birth label from issue URL
function formatBirthLabel(url: string | undefined): string {
  const parsed = parseBirthIssue(url)
  if (parsed) {
    return `${parsed.repo} #${parsed.issue}`
  }
  return 'Genesis'
}

const statusColors = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  offline: 'bg-slate-600',
}

interface TimelineCardProps {
  oracle: Oracle
  presence?: PresenceItem
  position: 'left' | 'right'
  index: number
  showOwner?: boolean
}

function TimelineCard({ oracle, presence, position, index, showOwner = false }: TimelineCardProps) {
  const displayInfo = getDisplayInfo(oracle)
  const status: 'online' | 'away' | 'offline' = presence?.status || 'offline'
  const profileUrl = `/u/${checksumAddress(oracle.bot_wallet) || checksumAddress(oracle.owner_wallet) || oracle.id}`

  return (
    <Link to={profileUrl} className="block">
    <div
      className={cn(
        'group relative flex items-center gap-4 py-4',
        position === 'left' ? 'flex-row-reverse text-right' : 'flex-row text-left'
      )}
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: 'both'
      }}
    >
      {/* Connector line to center */}
      <div className={cn(
        'absolute top-1/2 h-0.5 w-8 bg-gradient-to-r',
        position === 'left'
          ? 'right-0 translate-x-full from-orange-500/50 to-transparent'
          : 'left-0 -translate-x-full from-transparent to-orange-500/50'
      )} />

      {/* Card */}
      <div className={cn(
        'w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-sm',
        'hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/10',
        'transition-all duration-300 ease-out',
        'fade-in',
        position === 'left' ? 'slide-in-from-left-4' : 'slide-in-from-right-4'
      )}>
        <div className={cn(
          'flex items-start gap-3',
          position === 'left' ? 'flex-row-reverse' : 'flex-row'
        )}>
          {/* Avatar with status */}
          <div className="relative shrink-0">
            {status === 'online' && (
              <div className="absolute inset-0 rounded-full bg-green-500/30 animate-ping" style={{ animationDuration: '2s' }} />
            )}
            <div
              className={cn(
                'relative h-11 w-11 rounded-full bg-gradient-to-br flex items-center justify-center text-lg font-bold text-white',
                'transition-transform duration-300 group-hover:scale-110',
                getAvatarGradient(oracle.name)
              )}
            >
              {(oracle.oracle_name || oracle.name)[0]?.toUpperCase() || '?'}
            </div>
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-900',
                statusColors[status],
                status === 'online' && 'animate-pulse'
              )}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className={cn(
              'flex items-center gap-2 flex-wrap',
              position === 'left' ? 'justify-end' : 'justify-start'
            )}>
              <span className="font-semibold text-white group-hover:text-orange-100 transition-colors">
                {displayInfo.displayName}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                Oracle
              </span>
            </div>
            {showOwner && oracle.owner_wallet && (
              <div className={cn(
                'text-xs text-blue-400 flex items-center gap-1 mt-0.5',
                position === 'left' ? 'justify-end' : 'justify-start'
              )}>
                <Users className="h-2.5 w-2.5" />
                {oracle.owner_wallet.slice(0, 6)}...{oracle.owner_wallet.slice(-4)}
              </div>
            )}
            {oracle.bio && (
              <p className="mt-1 text-xs text-slate-400 line-clamp-2">{oracle.bio}</p>
            )}
          </div>
        </div>

        {/* Birth Issue Link */}
        {oracle.birth_issue && (
          <a
            href={oracle.birth_issue}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'mt-3 inline-flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-400 hover:gap-2 transition-all',
              position === 'left' ? 'float-right' : 'float-left'
            )}
          >
            <ExternalLink className="h-3 w-3" />
            View Birth Issue
          </a>
        )}
      </div>
    </div>
    </Link>
  )
}

interface HumanGroup {
  human: Human | null
  oracles: Oracle[]
}

export function World() {
  const [oracles, setOracles] = useState<Oracle[]>([])
  const [allOracles, setAllOracles] = useState<Oracle[]>([])
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceItem>>(new Map())
  const [presence, setPresence] = useState<PresenceResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('directory')
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    async function fetchWorld() {
      try {
        const [oraclesResult, presenceData] = await Promise.all([
          getOracles(1, 200),
          getPresence(),
        ])
        setAllOracles(oraclesResult.items)
        // Only show verified oracles (have birth_issue) for timeline
        const verifiedOracles = oraclesResult.items.filter(o => o.birth_issue)
        setOracles(verifiedOracles)
        setPresence(presenceData)

        const pMap = new Map<string, PresenceItem>()
        for (const item of presenceData.items) {
          pMap.set(item.id, item)
        }
        setPresenceMap(pMap)
      } catch (err) {
        console.error('Failed to fetch world oracles:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchWorld()
  }, [])

  // Directory: group all oracles by owner wallet
  const directoryGroups = useMemo(() => {
    const groups = new Map<string, { human: null; oracles: Oracle[] }>()
    for (const oracle of allOracles) {
      const ownerKey = oracle.owner_wallet || 'unclaimed'
      if (!groups.has(ownerKey)) {
        groups.set(ownerKey, { human: null, oracles: [] })
      }
      groups.get(ownerKey)!.oracles.push(oracle)
    }
    return [...groups.entries()].sort(([idA], [idB]) => {
      if (idA === 'unclaimed') return 1
      if (idB === 'unclaimed') return -1
      return idA.localeCompare(idB)
    })
  }, [allOracles])

  const getPresenceForOracle = (oracleId: string): PresenceItem | undefined => {
    return presence?.items.find((p: PresenceItem) => p.id === oracleId)
  }

  // Smooth view switch with fade transition
  const switchView = (mode: ViewMode) => {
    if (mode === viewMode) return
    setIsTransitioning(true)
    setTimeout(() => {
      setViewMode(mode)
      setTimeout(() => setIsTransitioning(false), 50)
    }, 300)
  }

  // Auto-morph: directory → timeline after 4 seconds
  useEffect(() => {
    if (!isLoading && viewMode === 'directory' && allOracles.length > 0) {
      const timer = setTimeout(() => switchView('timeline'), 1000)
      return () => clearTimeout(timer)
    }
  }, [isLoading, allOracles.length])

  // Group oracles by owner wallet, then sort each group by birth issue number
  const groupedByHuman = useMemo(() => {
    const groups = new Map<string, HumanGroup>()

    for (const oracle of oracles) {
      const ownerKey = oracle.owner_wallet || 'unclaimed'

      if (!groups.has(ownerKey)) {
        groups.set(ownerKey, { human: null, oracles: [] })
      }
      groups.get(ownerKey)!.oracles.push(oracle)
    }

    // Sort oracles within each group by issue number (descending - newest first)
    for (const group of groups.values()) {
      group.oracles.sort((a, b) => {
        const aIssue = parseBirthIssue(a.birth_issue)?.issue || 0
        const bIssue = parseBirthIssue(b.birth_issue)?.issue || 0
        return bIssue - aIssue
      })
    }

    // Sort groups: humans with most oracles first, unclaimed last
    return [...groups.entries()].sort(([idA, a], [idB, b]) => {
      if (idA === 'unclaimed') return 1
      if (idB === 'unclaimed') return -1
      return b.oracles.length - a.oracles.length
    })
  }, [oracles])

  // All oracles sorted by birth issue for global timeline
  const allOraclesSorted = useMemo(() => {
    return [...oracles].sort((a, b) => {
      const aIssue = parseBirthIssue(a.birth_issue)?.issue || 0
      const bIssue = parseBirthIssue(b.birth_issue)?.issue || 0
      return bIssue - aIssue
    })
  }, [oracles])

  const onlineCount = oracles.filter(o => presenceMap.get(o.id)?.status === 'online').length
  const awayCount = oracles.filter(o => presenceMap.get(o.id)?.status === 'away').length
  const humanCount = groupedByHuman.filter(([id]) => id !== 'unclaimed').length

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Hero Section */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 fade-in">
        {/* Animated Background */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 25px 25px, white 2%, transparent 0%)`,
            backgroundSize: '50px 50px'
          }} />
        </div>
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/10 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-gradient-to-br from-purple-500/10 to-orange-500/10 blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />

        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 text-2xl font-bold text-white shadow-lg">
              <Globe className="h-8 w-8" />
              <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">
                World's Oracles
              </h1>
              <p className="text-slate-400">
                {oracles.length} verified Oracle{oracles.length !== 1 ? 's' : ''} across {humanCount} human{humanCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* View toggle + Stats */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex rounded-lg bg-slate-800/50 p-0.5 ring-1 ring-slate-700">
              <button
                onClick={() => switchView('timeline')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  viewMode === 'timeline'
                    ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                <Globe className="h-3.5 w-3.5" />
                Timeline
              </button>
              <button
                onClick={() => switchView('directory')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  viewMode === 'directory'
                    ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Directory
              </button>
            </div>
            <div className="h-4 w-px bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 ring-1 ring-green-500/30 transition-all hover:ring-green-500/50 hover:bg-green-500/20 cursor-default">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-green-400">{onlineCount} Online</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/30 transition-all hover:ring-amber-500/50 hover:bg-amber-500/20 cursor-default">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-sm text-amber-400">{awayCount} Away</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 ring-1 ring-purple-500/30 transition-all hover:ring-purple-500/50 hover:bg-purple-500/20 cursor-default">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <span className="text-sm text-purple-400">{humanCount} Humans</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content with transition */}
      <div className={cn(
        'transition-all duration-300',
        isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      )}>
      {viewMode === 'directory' ? (
        <div className="space-y-8">
          {directoryGroups.map(([ownerKey, { oracles: groupOracles }]) => (
            <div key={ownerKey}>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
                <User className="h-4 w-4 text-slate-500" />
                {ownerKey !== 'unclaimed' ? (
                  <>
                    <span className="font-medium text-blue-400 font-mono">{ownerKey.slice(0, 6)}...{ownerKey.slice(-4)}</span>
                    <span className="text-slate-500 text-sm">
                      {groupOracles.length} oracle{groupOracles.length !== 1 ? 's' : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-500">Unclaimed</span>
                    <span className="text-slate-600 text-sm">
                      {groupOracles.length} oracle{groupOracles.length !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {groupOracles.map((oracle) => (
                  <OracleCard
                    key={oracle.id}
                    oracle={oracle}
                    presence={getPresenceForOracle(oracle.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : allOraclesSorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center fade-in">
          <Globe className="h-12 w-12 mx-auto text-slate-600" />
          <h2 className="mt-4 text-xl font-semibold text-white">No Oracles Yet</h2>
          <p className="mt-2 text-slate-400 max-w-md mx-auto">
            The network is waiting for its first Oracle to be born.
          </p>
        </div>
      ) : (
        <div className="fade-in">
          {/* Timeline header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-orange-500/50 to-transparent" />
            <span className="text-xs font-medium text-orange-500 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-3 w-3" />
              Global Birth Timeline
              <Sparkles className="h-3 w-3" />
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-orange-500/50 to-transparent" />
          </div>

          {/* Alternating Timeline */}
          <div className="relative">
            {/* Center timeline line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-gradient-to-b from-orange-500 via-orange-500/50 to-slate-800" />

            {/* Timeline items */}
            <div className="relative">
              {allOraclesSorted.map((oracle, index) => {
                const position = index % 2 === 0 ? 'left' : 'right'
                return (
                  <div
                    key={oracle.id}
                    className={cn(
                      'relative grid grid-cols-[1fr_auto_1fr] gap-4 items-center',
                    )}
                  >
                    {/* Left side */}
                    <div className={position === 'left' ? '' : 'invisible'}>
                      {position === 'left' && (
                        <TimelineCard
                          oracle={oracle}
                          presence={presenceMap.get(oracle.id)}
                          position="left"
                          index={index}
                          showOwner={true}
                        />
                      )}
                    </div>

                    {/* Center dot + label */}
                    <div className="relative flex flex-col items-center z-10">
                      {/* Birth label */}
                      <div className={cn(
                        'mb-2 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap',
                        'bg-slate-900 border border-orange-500/30 text-orange-400'
                      )}>
                        {formatBirthLabel(oracle.birth_issue)}
                      </div>
                      {/* Dot */}
                      <div className="h-4 w-4 rounded-full bg-orange-500 ring-4 ring-slate-900 shadow-lg shadow-orange-500/30 transition-transform hover:scale-150 cursor-pointer glow-pulse" />
                    </div>

                    {/* Right side */}
                    <div className={position === 'right' ? '' : 'invisible'}>
                      {position === 'right' && (
                        <TimelineCard
                          oracle={oracle}
                          presence={presenceMap.get(oracle.id)}
                          position="right"
                          index={index}
                          showOwner={true}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Genesis marker */}
            <div className="relative flex justify-center pt-8">
              <div className="h-3 w-3 rounded-full bg-slate-700 ring-4 ring-slate-900" />
            </div>
          </div>

          {/* Genesis label */}
          <div className="mt-4 flex justify-center">
            <span className="text-xs text-slate-600 italic flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-slate-800">
              <Sparkles className="h-3 w-3 text-slate-700" />
              Genesis
              <Sparkles className="h-3 w-3 text-slate-700" />
            </span>
          </div>

          {/* Humans Summary */}
          <div className="mt-12">
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-blue-500/50 to-transparent" />
              <span className="text-xs font-medium text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <Users className="h-3 w-3" />
                By Human
                <Users className="h-3 w-3" />
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-blue-500/50 to-transparent" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupedByHuman.map(([humanId, { human, oracles: humanOracles }]) => (
                <Link
                  key={humanId}
                  to={human?.github_username ? `/team/${human.github_username}` : '#'}
                  className={cn(
                    'rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-all',
                    human?.github_username && 'hover:border-blue-500/50 hover:bg-slate-800/50 cursor-pointer'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white font-bold">
                      {human?.github_username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        {human ? `@${human.github_username || human.display_name}` : 'Unclaimed'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {humanOracles.length} oracle{humanOracles.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {humanOracles.slice(0, 3).map(o => (
                      <span key={o.id} className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {o.oracle_name || o.name}
                      </span>
                    ))}
                    {humanOracles.length > 3 && (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-500">
                        +{humanOracles.length - 3} more
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
