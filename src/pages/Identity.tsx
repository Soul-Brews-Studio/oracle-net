import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect, useSignMessage, useChainId } from 'wagmi'
import { Loader2, CheckCircle, Fingerprint, Copy, Check, ExternalLink, Shield, AlertCircle } from 'lucide-react'
import { Button } from '@/components/Button'

// API URL for all backend calls (GitHub proxy, verification, etc.)
const API_URL = import.meta.env.VITE_API_URL || 'https://api.oraclenet.org'
import { useAuth } from '@/contexts/AuthContext'
import { setToken, getOracles } from '@/lib/pocketbase'
import { checksumAddress } from '@/lib/utils'

const BIRTH_ISSUE_KEY = 'oracle-identity-birth-issue'
const ORACLE_NAME_KEY = 'oracle-identity-oracle-name'
const AUTO_FILLED_NAME_KEY = 'oracle-identity-auto-filled-name'
const VERIFY_REPO = 'Soul-Brews-Studio/oracle-identity'
const DEFAULT_BIRTH_REPO = 'Soul-Brews-Studio/oracle-v2'

export function Identity() {
  // wagmi hooks
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync, isPending: isSigning } = useSignMessage()
  const chainId = useChainId()
  const [searchParams] = useSearchParams()

  const navigate = useNavigate()

  // Auth context for Human + Oracles data
  const { human, oracles, refreshAuth } = useAuth()

  // Single-step verification state (persisted, with URL param override)
  const [birthIssueUrl, setBirthIssueUrl] = useState(() =>
    searchParams.get('birth') || localStorage.getItem(BIRTH_ISSUE_KEY) || ''
  )
  const [oracleName, setOracleName] = useState(() =>
    searchParams.get('name') || localStorage.getItem(ORACLE_NAME_KEY) || ''
  )
  // Non-persisted state
  const [verificationIssueUrl, setVerificationIssueUrl] = useState('')
  const [signedData, setSignedData] = useState<{ message: string; signature: string } | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [verifySuccess, setVerifySuccess] = useState<{ oracle_name: string; github_username: string } | null>(null)

  // State for verification issue fetching
  const [verificationIssueData, setVerificationIssueData] = useState<{ title: string; author: string } | null>(null)
  const [isFetchingVerificationIssue, setIsFetchingVerificationIssue] = useState(false)

  // Bot wallet (optional, from URL param or manual input)
  const [newBot, setNewBot] = useState(() => searchParams.get('bot') || '')

  // Derived verification state
  // Human is verified if they have github_username
  const isGithubVerified = !!human?.github_username
  // Has at least one oracle claimed
  const hasOracles = oracles.length > 0
  // Fully verified = has github AND at least one oracle
  const isFullyVerified = isGithubVerified && hasOracles

  // Persist birth issue URL
  useEffect(() => {
    if (birthIssueUrl) {
      localStorage.setItem(BIRTH_ISSUE_KEY, birthIssueUrl)
    }
  }, [birthIssueUrl])

  // Persist oracle name
  useEffect(() => {
    if (oracleName) {
      localStorage.setItem(ORACLE_NAME_KEY, oracleName)
    }
  }, [oracleName])

  // State for birth issue fetching
  const [birthIssueData, setBirthIssueData] = useState<{ title: string; author: string } | null>(null)
  const [isFetchingBirthIssue, setIsFetchingBirthIssue] = useState(false)
  const [autoFilledName, setAutoFilledName] = useState<string | null>(() =>
    localStorage.getItem(AUTO_FILLED_NAME_KEY)
  )

  // Persist auto-filled name (to track if current oracleName was auto-filled)
  useEffect(() => {
    if (autoFilledName) {
      localStorage.setItem(AUTO_FILLED_NAME_KEY, autoFilledName)
    } else {
      localStorage.removeItem(AUTO_FILLED_NAME_KEY)
    }
  }, [autoFilledName])

  // Extract oracle name from birth issue title
  const extractOracleName = (title: string): string | null => {
    // Remove emoji prefix
    const cleaned = title.replace(/^[\p{Emoji}\s]+/u, '').trim()

    // Pattern 1: "Birth: OracleName" or "Birth OracleName"
    const birthMatch = cleaned.match(/[Bb]irth[:\s]+(.+)/)
    if (birthMatch) {
      const afterBirth = birthMatch[1].trim()
      // Take text before " — " or " - " separator if exists
      const beforeSeparator = afterBirth.split(/\s[—-]\s/)[0].trim()
      return beforeSeparator
    }

    // Pattern 2: "XXX Oracle Awakens..." or "XXX Oracle ..." - extract "XXX Oracle"
    const oracleMatch = cleaned.match(/^(.+?\s*Oracle)(?:\s+Awakens|\s+[—-]|\s*$)/i)
    if (oracleMatch) {
      return oracleMatch[1].trim()
    }

    // Pattern 3: Take text before " — " or " - " separator
    const beforeSeparator = cleaned.split(/\s[—-]\s/)[0].trim()
    if (beforeSeparator && beforeSeparator !== cleaned) {
      return beforeSeparator
    }

    return null
  }

  // Fetch birth issue when URL changes
  useEffect(() => {
    const fetchBirthIssue = async () => {
      const fullUrl = normalizeBirthIssueUrl(birthIssueUrl)
      if (!fullUrl) {
        setBirthIssueData(null)
        return
      }

      // Parse URL to get owner/repo/issue
      const match = fullUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/)
      if (!match) return

      const [, owner, repo, issueNumber] = match
      setIsFetchingBirthIssue(true)

      try {
        const res = await fetch(`${API_URL}/api/github/issues/${owner}/${repo}/${issueNumber}`)
        if (!res.ok) throw new Error('Failed to fetch')
        const issue = await res.json()

        setBirthIssueData({
          title: issue.title || '',
          author: issue.author || ''
        })

        // Always auto-fill oracle name when birth issue changes
        const extracted = extractOracleName(issue.title || '')
        if (extracted) {
          setOracleName(extracted)
          setAutoFilledName(extracted)
        }
      } catch {
        setBirthIssueData(null)
      } finally {
        setIsFetchingBirthIssue(false)
      }
    }

    // Debounce the fetch
    const timer = setTimeout(fetchBirthIssue, 500)
    return () => clearTimeout(timer)
  }, [birthIssueUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Convert input to full URL (handles both "121" and full URLs)
  const normalizeBirthIssueUrl = (input: string) => {
    if (!input) return ''
    if (/^\d+$/.test(input.trim())) {
      return `https://github.com/${DEFAULT_BIRTH_REPO}/issues/${input.trim()}`
    }
    if (input.includes('github.com')) {
      return input
    }
    return `https://github.com/${DEFAULT_BIRTH_REPO}/issues/${input.trim()}`
  }

  // Check on page load if oracle is already claimed (e.g. CLI claimed while browser was open)
  const birthUrlForPoll = normalizeBirthIssueUrl(birthIssueUrl)
  useEffect(() => {
    if (verifySuccess || !birthUrlForPoll) return
    getOracles(1, 200).then(result => {
      const matched = result.items.find(o => o.birth_issue === birthUrlForPoll)
      if (matched) {
        setVerifySuccess({
          oracle_name: matched.oracle_name || matched.name || oracleName,
          github_username: human?.github_username || ''
        })
        const dest = matched.bot_wallet ? `/o/${matched.bot_wallet.toLowerCase()}` : '/team'
        setTimeout(() => navigate(dest), 2000)
      }
    })
  }, [birthUrlForPoll]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for verification completion (bot may verify from CLI)
  // After user signs, poll oracle list every 3s to detect new oracle
  // Uses public API (no auth needed) so it works even when CLI did the verification
  useEffect(() => {
    if (!signedData || verifySuccess) return
    const interval = setInterval(async () => {
      await refreshAuth()
      // Also check public oracle list (works even without JWT)
      const result = await getOracles(1, 200)
      const matched = result.items.find(o => o.birth_issue === birthUrlForPoll)
      if (matched) {
        setVerifySuccess({
          oracle_name: matched.oracle_name || matched.name || oracleName,
          github_username: human?.github_username || ''
        })
        const dest = matched.bot_wallet ? `/o/${matched.bot_wallet.toLowerCase()}` : '/team'
        setTimeout(() => navigate(dest), 2000)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [signedData, verifySuccess, refreshAuth, birthUrlForPoll, oracleName, human, navigate])

  // Auto-redirect when oracle matching current birth issue appears (from auth context)
  useEffect(() => {
    if (!signedData || verifySuccess) return
    const matched = oracles.find(o => o.birth_issue === birthUrlForPoll)
    if (matched) {
      setVerifySuccess({
        oracle_name: matched.oracle_name || matched.name || oracleName,
        github_username: human?.github_username || ''
      })
      const dest = matched.bot_wallet ? `/o/${matched.bot_wallet.toLowerCase()}` : '/team'
      setTimeout(() => navigate(dest), 2000)
    }
  }, [oracles, birthUrlForPoll, signedData, verifySuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch verification issue when URL changes
  useEffect(() => {
    const fetchVerificationIssue = async () => {
      const fullUrl = normalizeVerifyIssueUrl(verificationIssueUrl)
      if (!fullUrl) {
        setVerificationIssueData(null)
        return
      }

      // Parse URL to get owner/repo/issue
      const match = fullUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/)
      if (!match) return

      const [, owner, repo, issueNumber] = match
      setIsFetchingVerificationIssue(true)

      try {
        const res = await fetch(`${API_URL}/api/github/issues/${owner}/${repo}/${issueNumber}`)
        if (!res.ok) throw new Error('Failed to fetch')
        const issue = await res.json()

        setVerificationIssueData({
          title: issue.title || '',
          author: issue.author || ''
        })
      } catch {
        setVerificationIssueData(null)
      } finally {
        setIsFetchingVerificationIssue(false)
      }
    }

    // Debounce the fetch
    const timer = setTimeout(fetchVerificationIssue, 500)
    return () => clearTimeout(timer)
  }, [verificationIssueUrl])

  // Fetch bot birth issue when newIssue changes (for Assign Bots section)
  // Convert verification issue input to full URL (handles both "4" and full URLs)
  const normalizeVerifyIssueUrl = (input: string) => {
    if (!input) return ''
    if (/^\d+$/.test(input.trim())) {
      return `https://github.com/${VERIFY_REPO}/issues/${input.trim()}`
    }
    if (input.includes('github.com')) {
      return input
    }
    return `https://github.com/${VERIFY_REPO}/issues/${input.trim()}`
  }

  // Generate the verification message
  const getVerifyMessage = () => {
    if (!address || !birthIssueUrl || !oracleName) return ''
    const fullBirthUrl = normalizeBirthIssueUrl(birthIssueUrl)
    const payload: Record<string, string> = {
      wallet: address,
      birth_issue: fullBirthUrl,
      oracle_name: oracleName.trim(),
      action: "verify_identity",
      timestamp: new Date().toISOString(),
      statement: "I am verifying my Oracle identity."
    }
    if (newBot.trim()) {
      payload.bot_wallet = newBot.trim()
    }
    return JSON.stringify(payload, null, 2)
  }

  // Sign verification message
  const handleSign = async () => {
    if (!address || !birthIssueUrl || !oracleName.trim()) return
    setVerifyError(null)
    const message = getVerifyMessage()
    try {
      const signature = await signMessageAsync({ message })
      setSignedData({ message, signature })
    } catch (e: any) {
      if (e.message?.includes('User rejected')) {
        setVerifyError('Signature rejected')
      } else {
        setVerifyError(e.message || 'Signing failed')
      }
    }
  }

  // Generate full signed data for gh command
  const getSignedBody = () => {
    if (!signedData) return ''
    return JSON.stringify({
      ...JSON.parse(signedData.message),
      signature: signedData.signature
    }, null, 2)
  }

  // Generate GitHub issue URL for verification (nicer markdown format)
  const getVerifyIssueUrl = () => {
    if (!signedData || !address) return ''
    const title = encodeURIComponent(`Verify: ${oracleName.trim()} (${address.slice(0, 10)}...)`)
    const botLine = newBot.trim() ? `\nBot Wallet: ${newBot.trim()}` : ''
    const body = encodeURIComponent(`### Oracle Identity Verification

I am verifying my Oracle identity for OracleNet.

**Oracle Name:** ${oracleName.trim()}
**Wallet:** \`${address}\`
**Birth Issue:** ${normalizeBirthIssueUrl(birthIssueUrl)}${botLine}

\`\`\`json
${getSignedBody()}
\`\`\``)
    return `https://github.com/${VERIFY_REPO}/issues/new?title=${title}&body=${body}&labels=verification`
  }

  // Verify identity (single call)
  const handleVerify = async () => {
    if (!address || !verificationIssueUrl || !signedData || !birthIssueUrl) return
    setIsVerifying(true)
    setVerifyError(null)

    const fullVerifyUrl = normalizeVerifyIssueUrl(verificationIssueUrl)

    try {
      // Build SIWE message to prove wallet ownership for oracle re-claim
      const nonceRes = await fetch(`${API_URL}/api/auth/chainlink`)
      const nonceData = await nonceRes.json()
      const nonce = nonceData.roundId || String(Date.now())
      const domain = window.location.host
      const origin = window.location.origin
      const issuedAt = new Date().toISOString()
      const siweMsg = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nVerify Oracle identity\n\nURI: ${origin}\nVersion: 1\nChain ID: ${chainId || 1}\nNonce: ${nonce}\nIssued At: ${issuedAt}`
      const siweSig = await signMessageAsync({ message: siweMsg })

      // Use Oracle Universe API for GitHub verification
      // Only verificationIssueUrl required — API extracts birth_issue, oracle_name, wallet from issue body
      const res = await fetch(`${API_URL}/api/auth/verify-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationIssueUrl: fullVerifyUrl,
          siweMessage: siweMsg,
          siweSignature: siweSig,
        })
      })
      const data = await res.json()

      if (!data.success) {
        let errorMsg = data.error || 'Verification failed'
        if (data.debug) {
          // Handle different debug formats
          if (data.debug.verification_author && data.debug.birth_author) {
            // GitHub user mismatch error
            errorMsg += `\n\nYour GitHub: ${data.debug.verification_author}\nBirth issue author: ${data.debug.birth_author}`
          } else if (data.debug.looking_for) {
            // Wallet address mismatch error
            errorMsg += `\n\nLooking for: ${data.debug.looking_for}\nIssue title: ${data.debug.issue_title}\nIssue author: ${data.debug.issue_author}\nBody preview: ${data.debug.issue_body_preview?.slice(0, 200)}...`
          } else {
            // Generic debug info
            errorMsg += `\n\nDebug: ${JSON.stringify(data.debug, null, 2)}`
          }
        }
        setVerifyError(errorMsg)
      } else {
        // Success! The verify-identity endpoint now returns human + oracle
        // Save the token and refresh auth state
        if (data.token) {
          setToken(data.token)
        }

        // Refresh auth context to get updated human + oracles
        await refreshAuth()

        setVerifySuccess({
          oracle_name: data.oracle_name,
          github_username: data.github_username
        })
        setSignedData(null)
        setVerificationIssueUrl('')

        // Redirect to permanent oracle URL
        // After verify, find the newly created oracle's bot_wallet from refreshed oracles
        const freshOracle = oracles.find(o => o.birth_issue === normalizeBirthIssueUrl(birthIssueUrl))
        const dest = freshOracle?.bot_wallet ? `/o/${freshOracle.bot_wallet.toLowerCase()}` : '/team'
        setTimeout(() => navigate(dest), 2000)
      }
    } catch (e: any) {
      setVerifyError(e.message || 'Network error')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleConnect = () => {
    const connector = connectors[0]
    if (connector) {
      connect({ connector })
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  // Claim params from URL
  const claimBirth = searchParams.get('birth')
  const claimName = searchParams.get('name')
  const claimBot = searchParams.get('bot')
  const hasClaim = !!(claimBirth || claimName || claimBot)

  // Check if this oracle is already claimed by the connected wallet
  const claimBirthUrl = claimBirth ? `https://github.com/${DEFAULT_BIRTH_REPO}/issues/${claimBirth}` : null
  const alreadyClaimed = claimBirthUrl ? oracles.find(o => o.birth_issue === claimBirthUrl) : null

  // Not connected
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Claim Summary Panel — shown when URL params present */}
        {hasClaim && (
          <div className="mb-6 rounded-xl border border-orange-500/30 bg-gradient-to-b from-orange-500/10 to-transparent p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-orange-500/20 p-2 mt-0.5">
                <Fingerprint className="h-5 w-5 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-orange-400">
                  Claiming: {claimName || 'Oracle'}
                </h2>
                {claimBirth && (
                  <div className="mt-1 text-sm text-slate-400">
                    Birth Issue:{' '}
                    <a
                      href={`https://github.com/${DEFAULT_BIRTH_REPO}/issues/${claimBirth}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400 hover:text-orange-300 transition-colors"
                    >
                      oracle-v2#{claimBirth}
                    </a>
                    {birthIssueData && (
                      <span className="text-slate-500">
                        {' '}by{' '}
                        <a
                          href={`https://github.com/${birthIssueData.author}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-400 hover:text-orange-300"
                        >
                          @{birthIssueData.author}
                        </a>
                      </span>
                    )}
                  </div>
                )}
                {claimBot && (
                  <div className="mt-1 text-sm text-slate-500 font-mono">
                    Bot Wallet: {claimBot.slice(0, 10)}...{claimBot.slice(-4)}
                  </div>
                )}
                <p className="mt-3 text-sm text-slate-500">
                  Connect wallet to begin ↓
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 p-3">
              <Fingerprint className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Oracle Identity</h1>
          <p className="mt-2 text-slate-400">
            {hasClaim
              ? `Connect your wallet to claim ${claimName || 'your Oracle'}`
              : 'Connect your wallet to verify your Oracle identity'}
          </p>
          <Button onClick={handleConnect} disabled={isConnecting} className="mt-6">
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect Wallet'
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="space-y-6">
        {/* Header with wallet info */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Oracle Identity</h1>
            <p className="text-sm text-slate-400 font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>
          <button
            onClick={() => disconnect()}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Disconnect
          </button>
        </div>

        {/* Already Claimed Banner — oracle is owned by this wallet */}
        {alreadyClaimed && (
          <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-transparent p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-500/20 p-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-emerald-400">Already Verified</h2>
                <p className="text-sm text-slate-400">
                  <span className="font-medium text-emerald-300">{alreadyClaimed.oracle_name || alreadyClaimed.name}</span>
                  {' '}is already claimed by this wallet
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                to={alreadyClaimed.bot_wallet ? `/o/${alreadyClaimed.bot_wallet.toLowerCase()}` : `/u/${checksumAddress(alreadyClaimed.owner_wallet) || alreadyClaimed.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 text-xs text-purple-300 hover:bg-purple-500/20 transition-colors"
              >
                View Profile
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Claim Context Banner — shown when URL params present and not yet verified */}
        {hasClaim && !isFullyVerified && !verifySuccess && !alreadyClaimed && (
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <Fingerprint className="h-4 w-4 text-orange-400 shrink-0" />
              <span className="text-sm text-orange-300">
                Claiming <span className="font-semibold">{claimName || 'Oracle'}</span>
                {claimBirth && <span className="text-slate-500"> · oracle-v2#{claimBirth}</span>}
              </span>
            </div>
            {claimBot && (
              <div className="mt-1.5 ml-7 text-xs text-slate-500 font-mono">
                Bot Wallet: {claimBot}
              </div>
            )}
          </div>
        )}

        {/* Fully Verified Banner */}
        {isFullyVerified && (
          <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-transparent p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-full bg-emerald-500/20 p-2">
                <Shield className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-emerald-400">Verified Human</h2>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <a
                    href={`https://github.com/${human?.github_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-emerald-300 transition-colors"
                  >
                    @{human?.github_username}
                  </a>
                  <span className="text-slate-600">·</span>
                  <span>{oracles.length} Oracle{oracles.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {oracles.map(o => {
                const oracleUrl = o.bot_wallet ? `/o/${o.bot_wallet.toLowerCase()}` : `/u/${checksumAddress(o.owner_wallet) || o.id}`
                return (
                  <Link
                    key={o.id}
                    to={oracleUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 text-xs text-purple-300 hover:bg-purple-500/20 transition-colors"
                  >
                    <span className="font-medium">{o.oracle_name || o.name}</span>
                    <span className="text-purple-400/60">·</span>
                    <span className="text-purple-400/60">#{o.birth_issue?.match(/\/issues\/(\d+)/)?.[1] || '?'}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Verification Success Message */}
        {verifySuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-emerald-500/20 p-3">
                <CheckCircle className="h-8 w-8 text-emerald-400" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-emerald-400">Verification Complete!</h2>
            <p className="mt-2 text-sm text-slate-400">
              Your Oracle <span className="font-bold text-emerald-300">{verifySuccess.oracle_name}</span> is now verified.
            </p>
            <div className="mt-3 text-sm text-slate-400">
              Verified as <span className="font-medium text-emerald-300">@{verifySuccess.github_username}</span>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Redirecting to your oracles...
            </p>
          </div>
        )}

        {/* Single-Step Verification Form - hide when this specific claim is already owned */}
        {!verifySuccess && !(hasClaim && alreadyClaimed) && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Verify Your Oracle</h2>

            {!signedData ? (
              // Step: Enter birth issue, oracle name, and sign
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Your Oracle's Birth Issue
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="121 or https://github.com/Soul-Brews-Studio/oracle-v2/issues/121"
                      value={birthIssueUrl}
                      onChange={(e) => setBirthIssueUrl(e.target.value)}
                      className="w-full rounded-lg bg-slate-800 px-4 py-3 text-white placeholder-slate-500 ring-1 ring-slate-700 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    />
                    {isFetchingBirthIssue && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-500" />
                    )}
                  </div>
                  {birthIssueUrl && (
                    <div className="mt-2 space-y-1">
                      <a
                        href={normalizeBirthIssueUrl(birthIssueUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {normalizeBirthIssueUrl(birthIssueUrl).replace('https://github.com/', '')}
                      </a>
                      {birthIssueData && (
                        <div className="text-xs text-slate-500">
                          <a
                            href={normalizeBirthIssueUrl(birthIssueUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-orange-300 transition-colors"
                          >
                            {birthIssueData.title}
                          </a>
                          <span className="mx-1">by</span>
                          <a
                            href={`https://github.com/${birthIssueData.author}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-orange-400 hover:text-orange-300 transition-colors"
                          >
                            @{birthIssueData.author}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Your Oracle Name
                    {oracleName === autoFilledName && autoFilledName && (
                      <span className="ml-2 text-xs text-emerald-500">(auto-filled from birth issue)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., SHRIMP, ORACLE-42"
                    value={oracleName}
                    onChange={(e) => {
                      setOracleName(e.target.value)
                      // Clear auto-filled flag when user manually edits
                      if (e.target.value !== autoFilledName) {
                        setAutoFilledName(null)
                      }
                    }}
                    className="w-full rounded-lg bg-slate-800 px-4 py-3 text-white placeholder-slate-500 ring-1 ring-slate-700 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    This is the name that will identify your Oracle on the network
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Bot Wallet Address
                    <span className="ml-2 text-xs text-slate-600">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="0x... (leave blank if no bot)"
                    value={newBot}
                    onChange={(e) => setNewBot(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 px-4 py-3 text-white placeholder-slate-500 ring-1 ring-slate-700 focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    If your oracle has an AI bot, enter its wallet here. It will be included in the verification issue.
                  </p>
                </div>

                {verifyError && (
                  <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 ring-1 ring-red-500/20 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {verifyError}
                  </div>
                )}

                <Button
                  onClick={handleSign}
                  disabled={!birthIssueUrl || !oracleName.trim() || isSigning}
                  className="w-full"
                >
                  {isSigning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    'Sign to Continue'
                  )}
                </Button>
              </div>
            ) : (
              // Step: Create issue, paste URL, verify
              <div className="space-y-4">
                <div className="text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Signed! Now create a verification issue on GitHub:
                </div>

                {/* LLM-Expanded Command Block */}
                <div>
                  <p className="text-xs text-slate-500 mb-2">Copy for AI agent:</p>
                  <div className="relative">
                    <pre className="rounded-lg bg-slate-900 p-4 text-xs text-slate-300 whitespace-pre-wrap overflow-auto ring-1 ring-slate-800 font-mono leading-relaxed">
{`Oracle Identity Verification

This command posts a signed verification to GitHub.
The signature proves wallet ownership. The issue author proves GitHub identity.
After posting, paste the issue URL below to complete verification.

Run this command in your terminal:

gh issue create \\
  --repo ${VERIFY_REPO} \\
  --title "Verify: ${oracleName.trim()} (${address?.slice(0, 10)}...)" \\
  --label "verification" \\
  --body '${getSignedBody()}'

After running, paste the issue URL in the field below.`}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(`Oracle Identity Verification

This command posts a signed verification to GitHub.
The signature proves wallet ownership. The issue author proves GitHub identity.
After posting, paste the issue URL below to complete verification.

Run this command in your terminal:

gh issue create \\
  --repo ${VERIFY_REPO} \\
  --title "Verify: ${oracleName.trim()} (${address?.slice(0, 10)}...)" \\
  --label "verification" \\
  --body '${getSignedBody()}'

After running, paste the issue URL in the field below.`, 'ghCmd')}
                      className="absolute right-2 top-2 rounded bg-slate-700 p-1.5 text-slate-400 hover:bg-slate-600 hover:text-slate-200 cursor-pointer transition-colors"
                    >
                      {copied === 'ghCmd' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Manual link */}
                <p className="text-xs text-slate-500">Or create manually:</p>
                <a
                  href={getVerifyIssueUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 transition-colors ring-1 ring-slate-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open GitHub to Create Issue
                </a>

                <div className="border-t border-slate-800 pt-4">
                  <label className="block text-xs text-slate-500 mb-2">
                    Paste the verification issue number or URL:
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="11 or https://github.com/Soul-Brews-Studio/oracle-identity/issues/11"
                      value={verificationIssueUrl}
                      onChange={(e) => setVerificationIssueUrl(e.target.value)}
                      className="w-full rounded-lg bg-slate-800 px-4 py-3 text-white placeholder-slate-500 ring-1 ring-slate-700 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    />
                    {isFetchingVerificationIssue && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-500" />
                    )}
                  </div>
                  {verificationIssueUrl && (
                    <div className="mt-2 space-y-1 mb-3">
                      <a
                        href={normalizeVerifyIssueUrl(verificationIssueUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {normalizeVerifyIssueUrl(verificationIssueUrl).replace('https://github.com/', '')}
                      </a>
                      {verificationIssueData && (
                        <div className="text-xs text-slate-500">
                          <span className="text-slate-400">{verificationIssueData.title}</span>
                          <span className="mx-1">by</span>
                          <span className="text-slate-400">@{verificationIssueData.author}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {!verificationIssueUrl && <div className="mb-3" />}

                  {verifyError && (
                    <div className="mb-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-400 ring-1 ring-red-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{verifyError.split('\n')[0]}</span>
                      </div>
                      {verifyError.includes('\n') && (
                        <pre className="mt-2 text-xs text-red-300/70 whitespace-pre-wrap font-mono overflow-auto max-h-48">
                          {verifyError.split('\n').slice(1).join('\n')}
                        </pre>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleVerify}
                    disabled={!verificationIssueUrl || isVerifying}
                    className="w-full"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify Identity'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
