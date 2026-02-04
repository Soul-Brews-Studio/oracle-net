/**
 * Mock Wallet Helper for E2E Tests
 *
 * Injects a fake MetaMask-like provider into the page's window.ethereum
 * Allows automated testing without a real wallet extension
 *
 * Usage:
 *   const wallet = new MockWallet(TEST_PRIVATE_KEY)
 *   await wallet.inject(page)
 *   // Now wallet operations will auto-approve
 */

import type { Page } from '@playwright/test'
import { privateKeyToAccount, signMessage } from 'viem/accounts'
import { toHex, keccak256, toBytes } from 'viem'

// Test wallet - DO NOT use in production
export const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
export const TEST_WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

export class MockWallet {
  private privateKey: `0x${string}`
  public address: string

  constructor(privateKey: `0x${string}` = TEST_PRIVATE_KEY) {
    this.privateKey = privateKey
    const account = privateKeyToAccount(privateKey)
    this.address = account.address
  }

  /**
   * Sign a message using the mock wallet's private key
   */
  async sign(message: string): Promise<string> {
    const account = privateKeyToAccount(this.privateKey)
    return await account.signMessage({ message })
  }

  /**
   * Inject mock ethereum provider into the page
   */
  async inject(page: Page): Promise<void> {
    const address = this.address
    const privateKey = this.privateKey

    // Inject the mock provider script
    await page.addInitScript(
      ({ address, privateKey }) => {
        // Simple EIP-191 personal_sign implementation
        // Note: This is a simplified version for testing
        const mockEthereum = {
          isMetaMask: true,
          isConnected: () => true,
          selectedAddress: address,
          chainId: '0x1', // Mainnet

          // Event listeners
          _listeners: {} as Record<string, Function[]>,
          on(event: string, callback: Function) {
            if (!this._listeners[event]) this._listeners[event] = []
            this._listeners[event].push(callback)
          },
          removeListener(event: string, callback: Function) {
            if (this._listeners[event]) {
              this._listeners[event] = this._listeners[event].filter((l) => l !== callback)
            }
          },
          emit(event: string, ...args: any[]) {
            if (this._listeners[event]) {
              this._listeners[event].forEach((cb) => cb(...args))
            }
          },

          // Main request handler
          request: async ({ method, params }: { method: string; params?: any[] }) => {
            console.log('[MockWallet] request:', method, params)

            switch (method) {
              case 'eth_requestAccounts':
              case 'eth_accounts':
                return [address]

              case 'eth_chainId':
                return '0x1'

              case 'wallet_switchEthereumChain':
                return null

              case 'personal_sign': {
                // personal_sign: params[0] = message, params[1] = address
                const message = params?.[0]
                if (!message) throw new Error('No message to sign')

                // For personal_sign, the message is hex-encoded
                // We need to sign it with the private key
                // Store the signature request for the test to handle
                const signaturePromise = new Promise<string>((resolve) => {
                  // @ts-ignore
                  window.__mockWalletSignRequest = { message, resolve }
                })
                return signaturePromise
              }

              case 'eth_signTypedData_v4': {
                // For typed data signing
                const signaturePromise = new Promise<string>((resolve) => {
                  // @ts-ignore
                  window.__mockWalletTypedSignRequest = { params, resolve }
                })
                return signaturePromise
              }

              default:
                console.warn('[MockWallet] Unhandled method:', method)
                throw new Error(`Method ${method} not supported by MockWallet`)
            }
          },
        }

        // @ts-ignore
        window.ethereum = mockEthereum
        // @ts-ignore
        window.__mockWalletAddress = address
        // @ts-ignore
        window.__mockWalletPrivateKey = privateKey

        console.log('[MockWallet] Injected with address:', address)
      },
      { address, privateKey }
    )
  }

  /**
   * Handle pending signature request in the page
   * Call this after triggering an action that requires signing
   */
  async handleSignRequest(page: Page): Promise<string> {
    const account = privateKeyToAccount(this.privateKey)

    // Wait for sign request
    await page.waitForFunction(() => {
      // @ts-ignore
      return window.__mockWalletSignRequest !== undefined
    }, { timeout: 10000 })

    // Get the message and sign it
    const signature = await page.evaluate(async () => {
      // @ts-ignore
      const request = window.__mockWalletSignRequest
      if (!request) throw new Error('No sign request pending')

      // The message from personal_sign is hex-encoded
      let message = request.message
      if (message.startsWith('0x')) {
        // Decode hex to string
        message = Buffer.from(message.slice(2), 'hex').toString('utf8')
      }

      // @ts-ignore
      window.__mockWalletSignRequest = undefined
      return { message, needsSignature: true }
    })

    // Sign the message with viem (outside the browser context)
    const sig = await account.signMessage({ message: signature.message })

    // Resolve the promise in the browser
    await page.evaluate((sig) => {
      // @ts-ignore
      const request = window.__mockWalletPendingResolve
      if (request) request(sig)
    }, sig)

    return sig
  }
}

/**
 * Helper to create a mock wallet and inject it
 */
export async function setupMockWallet(page: Page, privateKey?: `0x${string}`): Promise<MockWallet> {
  const wallet = new MockWallet(privateKey)
  await wallet.inject(page)
  return wallet
}
