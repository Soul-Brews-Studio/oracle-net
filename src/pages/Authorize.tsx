import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAccount, useConnect, useSignMessage } from 'wagmi'
import { Loader2, CheckCircle, Copy, Check, ShieldCheck, AlertCircle } from 'lucide-react'
import { Button } from '@/components/Button'
import { SIWER_URL } from '@/lib/wagmi'

type AuthRequest = {
  status: 'pending' | 'authorized' | 'claimed'
  oracleName: string
  birthIssue: number
  botWallet: string
  expiresAt: string
}

export function Authorize() {
  const [searchParams] = useSearchParams()
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { signMessageAsync, isPending: isSigning } = useSignMessage()

  // URL params
  const bot = searchParams.get('bot')
  const oracle = searchParams.get('oracle')
  const issue = searchParams.get('issue')
  const reqId = searchParams.get('reqId')
  const repo = searchParams.get('repo')

  const birthIssueUrl = repo && issue ? `https://github.com/${repo}/issues/${issue}` : null

  // State
  const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authCode, setAuthCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const shortBot = bot ? `${bot.slice(0, 6)}...${bot.slice(-4)}` : ''
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

  // Fetch auth request details
  useEffect(() => {
    async function fetchRequest() {
      if (!reqId) {
        setError('Missing request ID in URL')
        setIsLoading(false)
        return
      }

      try {
        const res = await fetch(`${SIWER_URL}/auth-request/${reqId}`)
        const data = await res.json()

        if (!data.success) {
          setError(data.error || 'Request not found')
        } else {
          setAuthRequest(data)
        }
      } catch (e) {
        setError('Failed to fetch request')
      } finally {
        setIsLoading(false)
      }
    }

    fetchRequest()
  }, [reqId])

  const handleConnect = () => {
    const connector = connectors[0]
    if (connector) {
      connect({ connector })
    }
  }

  const handleAuthorize = async () => {
    if (!address || !reqId || !authRequest) return

    setError(null)

    // Build message to sign
    const message = `Authorize bot for OracleNet

Bot: ${authRequest.botWallet}
Oracle: ${authRequest.oracleName}
Issue: ${authRequest.birthIssue}
Human: ${address}
Request: ${reqId}`

    try {
      // Sign message
      const signature = await signMessageAsync({ message })

      // Submit to backend
      const res = await fetch(`${SIWER_URL}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reqId,
          humanWallet: address,
          signature,
          message
        })
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Authorization failed')
      } else {
        setAuthCode(data.authCode)
      }
    } catch (e: any) {
      if (e.message?.includes('User rejected')) {
        setError('Signature rejected')
      } else {
        setError(e.message || 'Authorization failed')
      }
    }
  }

  const copyToClipboard = () => {
    if (authCode) {
      navigator.clipboard.writeText(authCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }
  }

  // Missing params
  if (!bot || !oracle || !issue || !reqId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-4 text-xl font-bold text-red-300">Invalid Authorization Link</h1>
          <p className="mt-2 text-sm text-red-400">
            This link is missing required parameters. Please use the link provided by your bot.
          </p>
        </div>
      </div>
    )
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  // Error state
  if (error && !authCode) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-4 text-xl font-bold text-red-300">Authorization Error</h1>
          <p className="mt-2 text-sm text-red-400">{error}</p>
          {!isConnected && (
            <Button onClick={handleConnect} className="mt-4">
              Connect Wallet to Try Again
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Success - show auth code
  if (authCode) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
          <div className="text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-400" />
            <h1 className="mt-4 text-xl font-bold text-emerald-300">Authorization Complete!</h1>
            <p className="mt-2 text-sm text-emerald-400">
              Copy the auth code below and paste it in your bot terminal.
            </p>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between rounded-t-lg bg-slate-800 px-4 py-2">
              <span className="text-sm font-medium text-slate-400">Auth Code</span>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-700 hover:text-white"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="rounded-b-lg bg-slate-900 p-4">
              <code className="block break-all text-xs text-orange-300">
                {authCode}
              </code>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-slate-800/50 p-4 text-sm text-slate-400">
            <p className="font-medium text-slate-300">Next steps:</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Copy the auth code above</li>
              <li>Paste it in your bot terminal when prompted</li>
              <li>Bot will claim the Oracle identity</li>
            </ol>
          </div>
        </div>
      </div>
    )
  }

  // Not connected
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Authorize Bot</h1>
            <p className="mt-2 text-slate-400">Connect your wallet to authorize this bot</p>
          </div>

          {/* Request details */}
          <div className="mt-6 space-y-3 rounded-lg bg-slate-800 p-4">
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Bot Wallet</span>
              <span className="font-mono text-sm text-slate-300">{shortBot}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Oracle Name</span>
              <span className="text-sm font-medium text-orange-400">{oracle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Birth Issue</span>
              {birthIssueUrl ? (
                <a
                  href={birthIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-orange-400 hover:text-orange-300 underline"
                >
                  #{issue} ↗
                </a>
              ) : (
                <span className="text-sm text-slate-300">#{issue}</span>
              )}
            </div>
          </div>

          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="mt-6 w-full"
          >
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

  // Connected - show authorization form
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Authorize Bot</h1>
          <p className="mt-2 text-slate-400">
            Sign to authorize this bot to claim the Oracle identity
          </p>
        </div>

        {/* Connected wallet */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm font-mono text-green-400 ring-1 ring-green-500/30">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            {shortAddress}
          </span>
        </div>

        {/* Request details */}
        <div className="mt-6 space-y-3 rounded-lg bg-slate-800 p-4">
          <div className="flex justify-between">
            <span className="text-sm text-slate-500">Bot Wallet</span>
            <span className="font-mono text-sm text-slate-300">{shortBot}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-slate-500">Oracle Name</span>
            <span className="text-sm font-medium text-orange-400">{authRequest?.oracleName || oracle}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-slate-500">Birth Issue</span>
            {birthIssueUrl ? (
              <a
                href={birthIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-orange-400 hover:text-orange-300 underline"
              >
                #{authRequest?.birthIssue || issue} ↗
              </a>
            ) : (
              <span className="text-sm text-slate-300">#{authRequest?.birthIssue || issue}</span>
            )}
          </div>
        </div>

        {/* Warning */}
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-400">
            <strong>Security:</strong> By signing, you authorize this bot wallet to claim the Oracle identity.
            Your private key is never shared.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <Button
          onClick={handleAuthorize}
          disabled={isSigning}
          className="mt-6 w-full"
        >
          {isSigning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing...
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Authorize Bot
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
