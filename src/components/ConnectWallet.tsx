import { useAccount, useConnect, useDisconnect, useSignMessage, useChainId } from 'wagmi'
import { useState, useEffect, useRef } from 'react'
import { createSiweMessage } from 'viem/siwe'
import { useAuth } from '../contexts/AuthContext'
import { API_URL } from '../lib/wagmi'
import { pb } from '../lib/pocketbase'

interface ChainlinkData {
  price: number
  roundId: string
  timestamp: number
}

export default function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const { setOracle, refreshOracle } = useAuth()

  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [siweMessage, setSiweMessage] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [chainlink, setChainlink] = useState<ChainlinkData | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

  // Track previous connection state to detect fresh connects
  const wasConnected = useRef(false)

  useEffect(() => {
    // Only trigger on fresh connection (false → true)
    if (isConnected && !wasConnected.current && address && !pb.authStore.isValid) {
      // Auto-prepare SIWE message
      prepareSignIn()
    }
    wasConnected.current = isConnected
  }, [isConnected, address])

  // Handle wallet connect + SIWE auth
  const handleConnect = async () => {
    setError(null)

    // First connect wallet
    const connector = connectors[0]
    if (!connector) {
      setError('No wallet found')
      return
    }

    try {
      connect({ connector })
    } catch (e: any) {
      setError(e.message || 'Failed to connect')
    }
  }

  // Step 1: Prepare SIWE message and show preview
  const prepareSignIn = async () => {
    if (!address) return

    setIsAuthenticating(true)
    setError(null)
    setSignature(null)
    setVerified(false)

    try {
      // Get Chainlink roundId as nonce
      const nonceRes = await fetch(`${API_URL}/api/auth/chainlink`)
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce')
      }
      const data = await nonceRes.json()

      if (!data.roundId) {
        throw new Error('Failed to get roundId')
      }

      setChainlink({
        price: data.price,
        roundId: data.roundId,
        timestamp: data.timestamp,
      })

      // Build SIWE message using viem
      const message = createSiweMessage({
        domain: window.location.host,
        address: address as `0x${string}`,
        statement: 'Sign in to Oracle Net',
        uri: window.location.origin,
        version: '1',
        chainId: chainId || 1,
        nonce: data.roundId,
      })

      setSiweMessage(message)
      setShowPreview(true)
    } catch (e: any) {
      setError(e.message || 'Failed to prepare sign-in')
    } finally {
      setIsAuthenticating(false)
    }
  }

  // Step 2: Confirm and sign the message
  const confirmSignIn = async () => {
    if (!address || !siweMessage) return

    setIsAuthenticating(true)
    setError(null)

    try {
      // Sign message with wallet
      const sig = await signMessageAsync({ message: siweMessage })
      setSignature(sig)

      // Verify with CF Worker
      const verifyRes = await fetch(`${API_URL}/api/auth/humans/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: siweMessage, signature: sig })
      })
      const result = await verifyRes.json()

      if (!result.success) {
        throw new Error(result.error || 'Verification failed')
      }

      setVerified(true)

      // Save token to auth store and fetch fresh oracle data
      pb.authStore.save(result.token, null)
      await refreshOracle()

    } catch (e: any) {
      setError(e.message || 'Sign in failed')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    pb.authStore.clear()
    setOracle(null)
    setShowPreview(false)
    setSiweMessage(null)
    setChainlink(null)
    setSignature(null)
    setVerified(false)
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)

  // Connected and authenticated
  if (isConnected && address) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm font-mono text-green-400 ring-1 ring-green-500/30">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
            {shortAddress}
          </span>
          <button
            onClick={handleDisconnect}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-400 ring-1 ring-gray-600 hover:bg-gray-800 cursor-pointer"
          >
            Disconnect
          </button>
        </div>

        {/* Step-by-step flow like siwe-service */}
        {showPreview && (
          <div className="space-y-4">
            {/* 1. Chainlink BTC/USD */}
            {chainlink && (
              <div className="rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-500">1. Chainlink BTC/USD</p>
                <p className="text-2xl font-bold text-orange-400">{formatPrice(chainlink.price)}</p>
                <p className="text-xs text-slate-500">{new Date(chainlink.timestamp * 1000).toISOString()}</p>
              </div>
            )}

            {/* 2. Wallet Connected */}
            <div className="rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
              <p className="text-xs text-slate-500">2. Wallet Connected</p>
              <p className="text-sm font-mono text-slate-200">{address}</p>
            </div>

            {/* 3. Message */}
            {siweMessage && (
              <div className="rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-500">3. Message</p>
                <pre className="mt-2 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                  {siweMessage}
                </pre>
              </div>
            )}

            {/* 4. Signature (after signing) */}
            {signature && (
              <div className="rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-500">4. Signature</p>
                <p className="mt-1 text-xs font-mono text-slate-300 break-all">{signature}</p>
              </div>
            )}

            {/* 5. Verified */}
            {verified && (
              <div className="rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-500">5. Verified</p>
                <p className="text-sm text-green-400">✓ Valid</p>
              </div>
            )}

            {/* Authenticated result */}
            {verified && chainlink && (
              <div className="rounded-lg bg-slate-900 p-5 ring-1 ring-emerald-500/30">
                <p className="text-lg font-bold text-emerald-400">Authenticated!</p>
                <p className="mt-1 text-sm text-slate-300">
                  <span className="text-slate-500">Address:</span> <span className="font-mono">{address}</span>
                </p>
                <p className="mt-2 text-lg font-bold text-orange-400">
                  Signed when BTC was {formatPrice(chainlink.price)}
                </p>
                <p className="text-xs text-slate-500">{new Date(chainlink.timestamp * 1000).toISOString()}</p>
              </div>
            )}

            {/* Sign button (before signing) */}
            {!signature && (
              <div className="space-y-2 pt-2">
                <button
                  onClick={confirmSignIn}
                  disabled={isAuthenticating}
                  className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {isAuthenticating ? 'Signing...' : 'Sign In with Ethereum'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sign in button (only show when preview not active) */}
        {!showPreview && (
          <button
            onClick={prepareSignIn}
            disabled={isAuthenticating}
            className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {isAuthenticating ? 'Preparing...' : 'Sign In to OracleNet'}
          </button>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    )
  }

  // No wallet installed
  if (connectors.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center">
          <p className="text-sm text-yellow-400">No wallet detected</p>
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-400 hover:underline"
          >
            Install MetaMask
          </a>
        </div>
      </div>
    )
  }

  // Not connected
  return (
    <div className="space-y-4">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {isConnecting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connecting...
          </span>
        ) : (
          'Connect Wallet'
        )}
      </button>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}
