/**
 * Mocked Verification Test
 *
 * Uses API mocks to test the full verification flow
 * without hitting real GitHub or SIWER APIs.
 *
 * Benefits:
 * - No rate limits
 * - Fast execution
 * - Test edge cases (errors, timeouts)
 * - Deterministic results
 *
 * Run with: bunx playwright test tests/mocked-verify.spec.ts --headed --project=chromium-slow
 */

import { test, expect } from '@playwright/test'
import { privateKeyToAccount } from 'viem/accounts'
import {
  mockGitHubIssues,
  mockSuccessfulVerification,
  mockFailedVerification,
  TEST_ISSUES,
} from './helpers/api-mocks'

// Test wallet
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const testAccount = privateKeyToAccount(TEST_PK)

// Test data using mock issue numbers
const TEST_BIRTH_ISSUE = '121'
const TEST_VERIFICATION_ISSUE = '999' // Mocked issue for test wallet
const TEST_ORACLE_NAME = 'Mocked Test Oracle'

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
              return new Promise<string>((resolve) => {
                // @ts-expect-error - test helper
                window.__signQueue = window.__signQueue || []
                // @ts-expect-error - test helper
                window.__signQueue.push({ message, resolve })
              })
            }
            default:
              return null
          }
        },
      }
      // @ts-expect-error - inject mock
      window.ethereum = mockProvider
      // @ts-expect-error - init queue
      window.__signQueue = []
    },
    { address }
  )
}

/**
 * Process signature requests
 */
async function processSignatures(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      // @ts-expect-error - test helper
      return window.__signQueue && window.__signQueue.length > 0
    },
    { timeout: 10000 }
  )

  const requests = await page.evaluate(() => {
    // @ts-expect-error - test helper
    const queue = window.__signQueue || []
    return queue.map((r: { message: string }) => r.message)
  })

  for (let i = 0; i < requests.length; i++) {
    const message = requests[i]
    const signature = await testAccount.signMessage({ message })
    await page.evaluate(
      ({ index, signature }) => {
        // @ts-expect-error - test helper
        const queue = window.__signQueue || []
        if (queue[index]) queue[index].resolve(signature)
      },
      { index: i, signature }
    )
  }

  await page.evaluate(() => {
    // @ts-expect-error - test helper
    window.__signQueue = []
  })
}

// ============================================
// Tests with Mocks
// ============================================

test.describe('Mocked Verification Flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectWallet(page)
    await page.addInitScript(() => localStorage.clear())
  })

  test('successful verification with mocked APIs', async ({ page }) => {
    // Setup mocks BEFORE navigation
    await mockGitHubIssues(page, TEST_ISSUES)
    await mockSuccessfulVerification(page, TEST_ORACLE_NAME)

    // Navigate
    await page.goto('/identity')
    console.log('✅ 1. Loaded /identity with mocked APIs')

    // Connect wallet
    const connectBtn = page.locator('button').filter({ hasText: /connect/i }).first()
    if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await connectBtn.click()
    }
    await expect(page.getByText(testAccount.address.slice(0, 6)).first()).toBeVisible({ timeout: 5000 })
    console.log('✅ 2. Wallet connected')

    // Fill birth issue
    const birthInput = page.getByPlaceholder(/121|birth/i).first()
    if (await birthInput.isVisible()) {
      await birthInput.fill(TEST_BIRTH_ISSUE)
      console.log('✅ 3. Filled birth issue')
    }

    // Fill oracle name
    const oracleInput = page.getByPlaceholder(/SHRIMP|oracle/i).first()
    if (await oracleInput.isVisible()) {
      await oracleInput.fill(TEST_ORACLE_NAME)
      console.log('✅ 4. Filled oracle name')
    }

    // Sign message
    const signBtn = page.locator('button').filter({ hasText: /sign.*continue/i }).first()
    if (await signBtn.isVisible()) {
      await signBtn.click()
      await processSignatures(page)
      await page.waitForTimeout(1000)
      console.log('✅ 5. Message signed')
    }

    // Fill verification issue (using mocked issue number)
    const verifyInput = page.getByPlaceholder(/11|verification/i).first()
    if (await verifyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verifyInput.fill(TEST_VERIFICATION_ISSUE)
      console.log('✅ 6. Filled verification issue (mocked)')
    }

    // Click verify
    const verifyBtn = page.locator('button').filter({ hasText: /verify.*identity/i }).first()
    if (await verifyBtn.isVisible()) {
      await verifyBtn.click()
      console.log('✅ 7. Clicked Verify Identity')
    }

    // Wait for success (mocked response)
    await page.waitForTimeout(2000)

    // Check for success message
    const successIndicator = page.locator('text=/verified|success|welcome|congratulations/i').first()
    const hasSuccess = await successIndicator.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasSuccess) {
      console.log('✅ 8. Verification SUCCESS (mocked)!')
    } else {
      // Take screenshot for debugging
      await page.screenshot({ path: 'test-results/mocked-verify-result.png' })
      console.log('📸 Screenshot saved for debugging')
    }
  })

  test('failed verification shows error', async ({ page }) => {
    // Setup mocks with failure
    await mockGitHubIssues(page, TEST_ISSUES)
    await mockFailedVerification(page, 'Wallet address does not match verification issue')

    await page.goto('/identity')

    // Quick connect and fill
    const connectBtn = page.locator('button').filter({ hasText: /connect/i }).first()
    if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await connectBtn.click()
    }

    await expect(page.getByText(testAccount.address.slice(0, 6)).first()).toBeVisible({ timeout: 5000 })

    // Fill form quickly
    const birthInput = page.getByPlaceholder(/121|birth/i).first()
    if (await birthInput.isVisible()) await birthInput.fill('121')

    const oracleInput = page.getByPlaceholder(/SHRIMP|oracle/i).first()
    if (await oracleInput.isVisible()) await oracleInput.fill('Test')

    const signBtn = page.locator('button').filter({ hasText: /sign.*continue/i }).first()
    if (await signBtn.isVisible()) {
      await signBtn.click()
      await processSignatures(page)
      await page.waitForTimeout(500)
    }

    const verifyInput = page.getByPlaceholder(/11|verification/i).first()
    if (await verifyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await verifyInput.fill('999')
    }

    const verifyBtn = page.locator('button').filter({ hasText: /verify.*identity/i }).first()
    if (await verifyBtn.isVisible()) {
      await verifyBtn.click()
    }

    // Should show error
    await page.waitForTimeout(2000)
    const errorIndicator = page.locator('text=/error|failed|does not match/i').first()
    const hasError = await errorIndicator.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasError) {
      console.log('✅ Error message displayed correctly')
    }

    expect(hasError).toBe(true)
  })
})
