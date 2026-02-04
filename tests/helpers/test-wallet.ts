/**
 * Simple Test Wallet Helper
 *
 * Creates a test wallet for E2E tests that can sign messages.
 * Uses viem for cryptographic operations.
 */

import { privateKeyToAccount } from 'viem/accounts'
import type { Page } from '@playwright/test'

// Default test private key (Hardhat/Anvil account #0)
export const DEFAULT_TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

export function createTestWallet(privateKey: `0x${string}` = DEFAULT_TEST_PK) {
  const account = privateKeyToAccount(privateKey)

  return {
    address: account.address,
    privateKey,

    async signMessage(message: string): Promise<`0x${string}`> {
      return await account.signMessage({ message })
    },
  }
}

/**
 * Inject a mock window.ethereum that auto-signs with the test wallet
 *
 * This creates a fully functional mock that:
 * 1. Returns the test wallet address for eth_accounts/eth_requestAccounts
 * 2. Auto-signs personal_sign requests using the test private key
 */
export async function injectTestWallet(page: Page, privateKey: `0x${string}` = DEFAULT_TEST_PK) {
  const wallet = createTestWallet(privateKey)

  // Pre-compute what we need to pass to the browser
  await page.addInitScript(
    ({ address }) => {
      // Store pending sign callbacks
      const pendingSignCallbacks: Map<string, (sig: string) => void> = new Map()
      let signRequestId = 0

      const mockProvider = {
        isMetaMask: true,
        isConnected: () => true,
        selectedAddress: address,
        chainId: '0x1',

        // Event handling
        _events: {} as Record<string, Set<Function>>,
        on(event: string, cb: Function) {
          if (!this._events[event]) this._events[event] = new Set()
          this._events[event].add(cb)
          return this
        },
        off(event: string, cb: Function) {
          this._events[event]?.delete(cb)
          return this
        },
        removeListener(event: string, cb: Function) {
          return this.off(event, cb)
        },
        emit(event: string, ...args: any[]) {
          this._events[event]?.forEach((cb) => cb(...args))
        },

        async request({ method, params }: { method: string; params?: any[] }) {
          console.log('[TestWallet]', method, params)

          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              // Emit connect event
              setTimeout(() => this.emit('connect', { chainId: '0x1' }), 0)
              setTimeout(() => this.emit('accountsChanged', [address]), 0)
              return [address]

            case 'eth_chainId':
              return '0x1'

            case 'net_version':
              return '1'

            case 'wallet_switchEthereumChain':
              return null

            case 'personal_sign': {
              const hexMessage = params?.[0] as string
              const requestId = `sign_${++signRequestId}`

              // Decode hex message to string
              let message = hexMessage
              if (hexMessage?.startsWith('0x')) {
                try {
                  const bytes = []
                  for (let i = 2; i < hexMessage.length; i += 2) {
                    bytes.push(parseInt(hexMessage.slice(i, i + 2), 16))
                  }
                  message = new TextDecoder().decode(new Uint8Array(bytes))
                } catch {
                  message = hexMessage
                }
              }

              // Store request for external signing
              return new Promise<string>((resolve) => {
                // @ts-ignore
                window.__testWalletSignQueue = window.__testWalletSignQueue || []
                // @ts-ignore
                window.__testWalletSignQueue.push({ id: requestId, message, resolve })

                console.log('[TestWallet] Sign request queued:', requestId, message.slice(0, 50))
              })
            }

            default:
              console.warn('[TestWallet] Unhandled:', method)
              return null
          }
        },
      }

      // @ts-ignore
      window.ethereum = mockProvider
      console.log('[TestWallet] Injected:', address)
    },
    { address: wallet.address }
  )

  return wallet
}

/**
 * Process any pending signature requests in the page
 *
 * Call this after triggering an action that requires wallet signature
 */
export async function processSignRequests(page: Page, wallet: ReturnType<typeof createTestWallet>) {
  // Get pending requests
  const requests = await page.evaluate(() => {
    // @ts-ignore
    const queue = window.__testWalletSignQueue || []
    // @ts-ignore
    window.__testWalletSignQueue = []
    return queue.map((r: any) => ({ id: r.id, message: r.message }))
  })

  // Sign each request
  for (const req of requests) {
    const signature = await wallet.signMessage(req.message)

    // Resolve the promise in the browser
    await page.evaluate(
      ({ id, signature }) => {
        // @ts-ignore
        const pending = window.__testWalletPendingResolves || {}
        if (pending[id]) {
          pending[id](signature)
          delete pending[id]
        }
      },
      { id: req.id, signature }
    )
  }

  return requests.length
}

/**
 * Auto-sign: Continuously process signature requests
 */
export async function enableAutoSign(page: Page, wallet: ReturnType<typeof createTestWallet>) {
  // Set up auto-signing by modifying the request handler
  await page.evaluate(
    ({ signatures }) => {
      const origRequest = window.ethereum?.request
      if (!origRequest) return

      // @ts-ignore
      window.ethereum.request = async function (args: { method: string; params?: any[] }) {
        if (args.method === 'personal_sign') {
          const hexMessage = args.params?.[0] as string
          let message = hexMessage
          if (hexMessage?.startsWith('0x')) {
            try {
              const bytes = []
              for (let i = 2; i < hexMessage.length; i += 2) {
                bytes.push(parseInt(hexMessage.slice(i, i + 2), 16))
              }
              message = new TextDecoder().decode(new Uint8Array(bytes))
            } catch {
              // keep hex
            }
          }

          // Find matching pre-computed signature or request external signing
          console.log('[TestWallet] Auto-sign message:', message.slice(0, 100))

          // Request signature from test framework
          // @ts-ignore
          window.__pendingSignMessage = message
          // @ts-ignore
          return new Promise((resolve) => {
            // @ts-ignore
            window.__resolveSign = resolve
          })
        }
        return origRequest.call(this, args)
      }
    },
    { signatures: {} }
  )
}
