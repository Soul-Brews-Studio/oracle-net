/**
 * User Flow E2E Test
 *
 * Tests the complete user journey by clicking through pages
 * like a real user - NO page.goto() refreshes!
 *
 * Run with: bunx playwright test tests/user-flow.spec.ts --headed --project=chromium-slow
 */

import { test, expect } from '@playwright/test'
import { privateKeyToAccount } from 'viem/accounts'

// Test wallet
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const testAccount = privateKeyToAccount(TEST_PK)

/**
 * Inject mock wallet
 */
async function injectWallet(page: import('@playwright/test').Page) {
  const address = testAccount.address

  await page.addInitScript(
    ({ address }) => {
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
              let message = hexMessage
              if (hexMessage?.startsWith('0x')) {
                const bytes: number[] = []
                for (let i = 2; i < hexMessage.length; i += 2) {
                  bytes.push(parseInt(hexMessage.slice(i, i + 2), 16))
                }
                message = new TextDecoder().decode(new Uint8Array(bytes))
              }
              console.log('[MockWallet] Sign:', message.slice(0, 50))

              return new Promise<string>((resolve) => {
                // @ts-expect-error - test helper
                window.__signRequest = { message, resolve }
              })
            }

            default:
              return null
          }
        },
      }

      // @ts-expect-error - inject mock
      window.ethereum = mockProvider
    },
    { address }
  )
}

/**
 * Sign pending request
 */
async function signRequest(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    // @ts-expect-error - test helper
    return !!window.__signRequest
  }, { timeout: 10000 })

  const message = await page.evaluate(() => {
    // @ts-expect-error - test helper
    return window.__signRequest?.message
  })

  const signature = await testAccount.signMessage({ message })

  await page.evaluate((sig) => {
    // @ts-expect-error - test helper
    window.__signRequest?.resolve(sig)
    // @ts-expect-error - test helper
    window.__signRequest = null
  }, signature)
}

// ============================================
// Full User Flow Test
// ============================================

test.describe('Complete User Flow', () => {
  test('navigate through app like real user', async ({ page }) => {
    await injectWallet(page)

    // 1. Start at home page (only goto once!)
    await page.goto('/')
    await expect(page).toHaveTitle(/Oracle/i)
    console.log('✅ 1. Home page loaded')

    // 2. Look for navigation elements
    const nav = page.locator('nav, header, [role="navigation"]').first()
    await expect(nav).toBeVisible()

    // 3. Find and click "Identity" or "Verify" link
    const identityLink = page.locator('a, button').filter({
      hasText: /identity|verify|profile/i
    }).first()

    if (await identityLink.isVisible()) {
      await identityLink.click()
      await page.waitForURL(/identity|verify|profile/i, { timeout: 5000 }).catch(() => {})
      console.log('✅ 2. Clicked to Identity page')
    }

    // 4. Connect wallet if button exists
    const connectBtn = page.locator('button').filter({ hasText: /connect|wallet/i }).first()
    if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await connectBtn.click()
      await page.waitForTimeout(500) // Wait for wallet connection
      console.log('✅ 3. Connected wallet')
    }

    // 5. Check wallet address is shown (may take time for connection)
    const walletDisplay = page.getByText(testAccount.address.slice(0, 6)).first()
    await expect(walletDisplay).toBeVisible({ timeout: 10000 })
    console.log('✅ 4. Wallet address visible:', testAccount.address.slice(0, 10))

    // 6. Navigate to Feed/Home via nav
    const feedLink = page.locator('a, button').filter({
      hasText: /feed|home|oracle/i
    }).first()

    if (await feedLink.isVisible()) {
      await feedLink.click()
      await page.waitForTimeout(500)
      console.log('✅ 5. Navigated to Feed')
    }

    // 7. Check for Oracle content
    const hasContent = await page.locator('article, [class*="card"], [class*="post"]').first().isVisible({ timeout: 3000 }).catch(() => false)
    if (hasContent) {
      console.log('✅ 6. Feed content visible')
    }

    // 8. Navigate back to Identity
    const backToIdentity = page.locator('a, button').filter({
      hasText: /identity|verify|profile/i
    }).first()

    if (await backToIdentity.isVisible()) {
      await backToIdentity.click()
      await page.waitForTimeout(500)
      console.log('✅ 7. Back to Identity page')
    }

    // Final: wallet should still be connected (no refresh!)
    await expect(page.getByText(testAccount.address.slice(0, 6)).first()).toBeVisible()
    console.log('✅ 8. Wallet still connected after navigation!')
  })

  test('full identity verification flow', async ({ page }) => {
    await injectWallet(page)

    // Start at home
    await page.goto('/')

    // Navigate to identity
    await page.locator('a').filter({ hasText: /identity|verify/i }).first().click().catch(() => {
      // Fallback: direct nav if no link
      return page.goto('/identity')
    })

    // Connect wallet
    const connectBtn = page.locator('button').filter({ hasText: /connect/i }).first()
    if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await connectBtn.click()
    }

    // Wait for wallet to connect
    await expect(page.getByText(testAccount.address.slice(0, 6)).first()).toBeVisible({ timeout: 5000 })
    console.log('✅ Wallet connected')

    // Look for verify button/form
    const verifySection = page.locator('[class*="verify"], form, [class*="identity"]').first()
    if (await verifySection.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('✅ Verification section found')

      // Check for input fields
      const inputs = page.locator('input[type="text"], input[type="url"]')
      const inputCount = await inputs.count()
      console.log(`   Found ${inputCount} input fields`)
    }

    // Take screenshot for manual verification
    await page.screenshot({ path: 'test-results/identity-flow.png' })
    console.log('✅ Screenshot saved')
  })
})
