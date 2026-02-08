import { useAccount, useConnect, useDisconnect, useSignMessage, useChainId } from 'wagmi'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { useAuth } from '../contexts/AuthContext'
import { API_URL } from '../lib/wagmi'
import { setToken, getToken } from '../lib/pocketbase'

// Check if stored token belongs to the given wallet address
function isTokenForWallet(address: string): boolean {
  const token = getToken()
  if (!token) return false
  try {
    const payload = token.split('.')[1]
    if (!payload) return false
    const decoded = JSON.parse(atob(payload))
    return decoded.sub?.toLowerCase() === address.toLowerCase()
  } catch {
    return false
  }
}

// Manual SIWE message builder (matches siwe-service/lib.ts)
// viem's createSiweMessage doesn't allow \n in statement
function buildSiweMessage(opts: {
  domain: string; address: string; statement: string;
  uri: string; version: string; chainId: number;
  nonce: string; issuedAt?: string;
}): string {
  const issuedAt = opts.issuedAt || new Date().toISOString()
  return `${opts.domain} wants you to sign in with your Ethereum account:\n${opts.address}\n\n${opts.statement}\n\nURI: ${opts.uri}\nVersion: ${opts.version}\nChain ID: ${opts.chainId}\nNonce: ${opts.nonce}\nIssued At: ${issuedAt}`
}

const ethClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum.publicnode.com'),
})

interface ChainlinkData {
  price: number
  roundId: string
  timestamp: number
  blockNumber?: number
}

export default function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const { setOracle, refreshOracle } = useAuth()
  const navigate = useNavigate()

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
    // Also trigger if token exists but belongs to a different wallet
    if (isConnected && !wasConnected.current && address && (!getToken() || !isTokenForWallet(address))) {
      // Clear stale token if it's for a different wallet
      if (getToken() && !isTokenForWallet(address)) {
        setToken(null)
      }
      // Auto-prepare SIWE message
      prepareSignIn()
    }
    wasConnected.current = isConnected
  }, [isConnected, address])

  // Auto-sign SIWE message as soon as it's prepared
  useEffect(() => {
    if (siweMessage && showPreview && !signature && !isAuthenticating) {
      confirmSignIn()
    }
  }, [siweMessage, showPreview])

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

      // Fetch block number from Ethereum via viem
      const blockNumber = await ethClient.getBlockNumber()

      setChainlink({
        price: data.price,
        roundId: data.roundId,
        timestamp: data.timestamp,
        blockNumber: Number(blockNumber),
      })

      // Build SIWE message using viem (match siwe-service format)
      const priceFormatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(data.price)

      const message = buildSiweMessage({
        domain: window.location.host,
        address: address as `0x${string}`,
        statement: `Sign in to Oracle Net\nBTC price: ${priceFormatted}`,
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
      setToken(result.token)
      await refreshOracle()

      // Auto-redirect to feed after successful sign-in
      setTimeout(() => navigate('/feed'), 1500)

    } catch (e: any) {
      setError(e.message || 'Sign in failed')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setToken(null)
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
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">1. Chainlink BTC/USD</p>
                  <span className="text-xs text-slate-600">
                    {Math.round((Date.now() / 1000 - chainlink.timestamp) / 60)}m ago
                  </span>
                </div>
                <p className="text-2xl font-bold text-orange-400">{formatPrice(chainlink.price)}</p>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {chainlink.blockNumber && (
                    <a
                      href={`https://etherscan.io/block/${chainlink.blockNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-slate-500 hover:text-orange-400 transition-colors"
                    >
                      Block #{chainlink.blockNumber.toLocaleString()}
                    </a>
                  )}
                  <span className="text-slate-700">|</span>
                  <span className="text-slate-600">{new Date(chainlink.timestamp * 1000).toISOString()}</span>
                </div>
                <a
                  href="https://etherscan.io/address/0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs font-mono text-slate-600 hover:text-orange-400 transition-colors"
                >
                  Contract: 0xF403...BeE88c
                </a>
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
