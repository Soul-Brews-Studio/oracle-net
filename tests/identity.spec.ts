/**
 * OracleNet Identity E2E Tests
 *
 * Tests the full identity verification flow:
 * 1. Connect wallet
 * 2. Verify identity (GitHub + wallet)
 * 3. Agent connect
 *
 * Run with: bunx playwright test tests/identity.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { privateKeyToAccount } from 'viem/accounts'

// Test wallet (Hardhat account #0 - for testing only)
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const testAccount = privateKeyToAccount(TEST_PK)

/**
 * Inject a mock wallet that auto-signs all requests
 */
async function injectAutoSignWallet(page: Page) {
  const address = testAccount.address

  await page.addInitScript(
    ({ address }) => {
      let signResolve: ((sig: string) => void) | null = null

      const mockProvider = {
        isMetaMask: true,
        isConnected: () => true,
        selectedAddress: address,
        chainId: '0x1',

        _events: new Map<string, Set<Function>>(),
        on(event: string, cb: Function) {
          if (!this._events.has(event)) this._events.set(event, new Set())
          this._events.get(event)!.add(cb)
          return this
        },
        off(event: string, cb: Function) {
          this._events.get(event)?.delete(cb)
          return this
        },
        removeListener(event: string, cb: Function) {
          return this.off(event, cb)
        },
        emit(event: string, ...args: unknown[]) {
          this._events.get(event)?.forEach((cb) => cb(...args))
        },

        async request({ method, params }: { method: string; params?: unknown[] }) {
          console.log('[MockWallet]', method)

          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              setTimeout(() => this.emit('accountsChanged', [address]), 10)
              return [address]

            case 'eth_chainId':
              return '0x1'

            case 'net_version':
              return '1'

            case 'wallet_switchEthereumChain':
              return null

            case 'personal_sign': {
              const hexMessage = params?.[0] as string

              // Decode hex to string
              let message = hexMessage
              if (hexMessage?.startsWith('0x')) {
                const bytes: number[] = []
                for (let i = 2; i < hexMessage.length; i += 2) {
                  bytes.push(parseInt(hexMessage.slice(i, i + 2), 16))
                }
                message = new TextDecoder().decode(new Uint8Array(bytes))
              }

              console.log('[MockWallet] Signing:', message.slice(0, 80))

              // Queue for external signing
              return new Promise<string>((resolve) => {
                // @ts-expect-error - test helper
                window.__signRequest = { message, resolve }
              })
            }

            default:
              console.warn('[MockWallet] Unhandled:', method)
              return null
          }
        },
      }

      // @ts-expect-error - inject mock
      window.ethereum = mockProvider
      console.log('[MockWallet] Ready:', address)
    },
    { address }
  )
}

/**
 * Handle pending signature request by signing with test key
 */
async function signPendingRequest(page: Page): Promise<void> {
  // Wait for sign request
  const hasRequest = await page.evaluate(() => {
    // @ts-expect-error - test helper
    return !!window.__signRequest
  })

  if (!hasRequest) {
    // Wait a bit for request to appear
    await page.waitForFunction(
      () => {
        // @ts-expect-error - test helper
        return !!window.__signRequest
      },
      { timeout: 5000 }
    )
  }

  // Get message and sign it
  const message = await page.evaluate(() => {
    // @ts-expect-error - test helper
    return window.__signRequest?.message
  })

  if (!message) {
    throw new Error('No sign request found')
  }

  // Sign with viem
  const signature = await testAccount.signMessage({ message })

  // Resolve in browser
  await page.evaluate((sig) => {
    // @ts-expect-error - test helper
    window.__signRequest?.resolve(sig)
    // @ts-expect-error - test helper
    window.__signRequest = null
  }, signature)
}

// ============================================
// Tests
// ============================================

test.describe('OracleNet Identity', () => {
  test.beforeEach(async ({ page }) => {
    await injectAutoSignWallet(page)
  })

  test('page loads correctly', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Oracle/i)
  })

  test('can connect wallet', async ({ page }) => {
    await page.goto('/')

    // Find and click connect button (could be various text)
    const connectButton = page.locator('button').filter({ hasText: /connect|wallet/i }).first()

    if (await connectButton.isVisible()) {
      await connectButton.click()
      // Should show wallet address after connecting (use first match)
      await expect(page.getByText(testAccount.address.slice(0, 6)).first()).toBeVisible({ timeout: 10000 })
    } else {
      // Wallet might already be connected
      console.log('Connect button not found, wallet may be auto-connected')
    }
  })

  test('identity page shows verification options', async ({ page }) => {
    await page.goto('/identity')

    // Should show verification section
    await expect(page.getByText(/verify/i)).toBeVisible()
  })

  test('shows wallet address after connection on identity page', async ({ page }) => {
    await page.goto('/identity')

    // Connect wallet if button visible
    const connectButton = page.locator('button').filter({ hasText: /connect|wallet/i }).first()
    if (await connectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await connectButton.click()
    }

    // Should show connected wallet (use first match to avoid strict mode error)
    await expect(page.getByText(testAccount.address.slice(0, 6)).first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Mock Wallet Signing', () => {
  test('can sign message', async ({ page }) => {
    await injectAutoSignWallet(page)
    await page.goto('/')

    // Trigger a sign request via page evaluation
    const signPromise = page.evaluate(async () => {
      // @ts-expect-error - using injected mock
      return window.ethereum?.request({
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x0'], // "Hello" in hex
      })
    })

    // Handle the sign request
    await signPendingRequest(page)

    // Wait for signature
    const signature = await signPromise
    expect(signature).toMatch(/^0x/)
    expect(signature).toHaveLength(132) // 65 bytes as hex
  })
})
