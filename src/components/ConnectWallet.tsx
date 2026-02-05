import { useAccount, useConnect, useDisconnect, useSignMessage, useChainId } from 'wagmi'
import { useState, useEffect, useRef } from 'react'
import { createSiweMessage } from 'viem/siwe'
import { useAuth } from '../contexts/AuthContext'
import { API_URL } from '../lib/wagmi'
import { pb } from '../lib/pocketbase'

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

    try {
      // Get Chainlink roundId as nonce
      const nonceRes = await fetch(`${API_URL}/api/auth/chainlink`)
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce')
      }
      const { roundId } = await nonceRes.json()

      if (!roundId) {
        throw new Error('Failed to get roundId')
      }

      // Build SIWE message using viem
      const message = createSiweMessage({
        domain: window.location.host,
        address: address as `0x${string}`,
        statement: 'Sign in to Oracle Net',
        uri: window.location.origin,
        version: '1',
        chainId: chainId || 1,
        nonce: roundId,
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
      const signature = await signMessageAsync({ message: siweMessage })

      // Verify with CF Worker
      const verifyRes = await fetch(`${API_URL}/api/auth/humans/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: siweMessage, signature })
      })
      const result = await verifyRes.json()

      if (!result.success) {
        throw new Error(result.error || 'Verification failed')
      }

      // Save token to auth store and fetch fresh oracle data
      pb.authStore.save(result.token, null)
      await refreshOracle()

      // Clear preview state
      setShowPreview(false)
      setSiweMessage(null)

    } catch (e: any) {
      setError(e.message || 'Sign in failed')
    } finally {
      setIsAuthenticating(false)
    }
  }

  // Cancel preview
  const cancelPreview = () => {
    setShowPreview(false)
    setSiweMessage(null)
    setError(null)
  }

  const handleDisconnect = () => {
    disconnect()
    pb.authStore.clear()
    setOracle(null)
    setShowPreview(false)
    setSiweMessage(null)
  }

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

        {/* SIWE Message Preview Modal */}
        {showPreview && siweMessage && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-blue-400">Review Sign-In Message</h3>
              <button
                onClick={cancelPreview}
                className="text-gray-400 hover:text-white text-lg leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Your wallet will ask you to sign this message. Review it carefully:
            </p>
            <pre className="rounded-lg bg-gray-900/50 p-3 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap break-all font-mono ring-1 ring-gray-700">
              {siweMessage}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={cancelPreview}
                className="flex-1 rounded-lg px-4 py-2 text-sm text-gray-400 ring-1 ring-gray-600 hover:bg-gray-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmSignIn}
                disabled={isAuthenticating}
                className="flex-1 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {isAuthenticating ? 'Signing...' : 'Confirm & Sign'}
              </button>
            </div>
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
