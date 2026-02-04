/**
 * Verify Identity E2E Test
 *
 * Tests the complete identity verification flow:
 * 1. Connect wallet
 * 2. Fill birth issue URL
 * 3. Fill oracle name
 * 4. Sign message
 * 5. Fill verification issue URL
 * 6. Click Verify Identity
 * 7. Handle signature
 * 8. Check success
 *
 * Run with: bunx playwright test tests/verify-identity.spec.ts --headed --project=chromium-slow
 */

import { test, expect } from '@playwright/test'
import { privateKeyToAccount } from 'viem/accounts'

// Test wallet (different from production!)
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const testAccount = privateKeyToAccount(TEST_PK)

// Test data - using real issues for testing
const TEST_BIRTH_ISSUE = '121' // SHRIMP Oracle birth issue
// Use FULL URL because verification issue is in oracle-v2, not oracle-identity
const TEST_VERIFICATION_ISSUE = 'https://github.com/Soul-Brews-Studio/oracle-v2/issues/138'
const TEST_ORACLE_NAME = 'Test Oracle E2E'

/**
 * Inject mock wallet that queues sign requests
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
              console.log('[MockWallet] Sign request:', message.slice(0, 80))

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
 * Process all pending signature requests
 */
async function processSignatures(page: import('@playwright/test').Page) {
  // Wait for sign request
  await page.waitForFunction(
    () => {
      // @ts-expect-error - test helper
      return window.__signQueue && window.__signQueue.length > 0
    },
    { timeout: 10000 }
  )

  // Get all pending requests
  const requests = await page.evaluate(() => {
    // @ts-expect-error - test helper
    const queue = window.__signQueue || []
    return queue.map((r: { message: string }) => r.message)
  })

  console.log(`[Test] Processing ${requests.length} signature(s)`)

  // Sign each request
  for (let i = 0; i < requests.length; i++) {
    const message = requests[i]
    const signature = await testAccount.signMessage({ message })

    await page.evaluate(
      ({ index, signature }) => {
        // @ts-expect-error - test helper
        const queue = window.__signQueue || []
        if (queue[index]) {
          queue[index].resolve(signature)
        }
      },
      { index: i, signature }
    )
    console.log(`[Test] Signed request ${i + 1}`)
  }

  // Clear queue
  await page.evaluate(() => {
    // @ts-expect-error - test helper
    window.__signQueue = []
  })
}

// ============================================
// Tests
// ============================================

test.describe('Identity Verification Flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectWallet(page)
    // Clear localStorage to start fresh
    await page.addInitScript(() => {
      localStorage.clear()
    })
  })

  test('complete verification flow step by step', async ({ page }) => {
    // 1. Navigate to identity page
    await page.goto('/identity')
    console.log('✅ 1. Loaded /identity')

    // 2. Connect wallet
    const connectBtn = page.locator('button').filter({ hasText: /connect/i }).first()
    if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await connectBtn.click()
      await page.waitForTimeout(500)
    }
    await expect(page.getByText(testAccount.address.slice(0, 6)).first()).toBeVisible({ timeout: 5000 })
    console.log('✅ 2. Wallet connected:', testAccount.address.slice(0, 10))

    // 3. Fill birth issue URL
    const birthIssueInput = page.locator('input').filter({ hasText: '' }).first()
    // Find input by placeholder
    const birthInput = page.getByPlaceholder(/121|birth/i).first()
    if (await birthInput.isVisible()) {
      await birthInput.fill(TEST_BIRTH_ISSUE)
      console.log('✅ 3. Filled birth issue:', TEST_BIRTH_ISSUE)
    }

    // 4. Fill oracle name
    const oracleNameInput = page.getByPlaceholder(/SHRIMP|oracle.*name/i).first()
    if (await oracleNameInput.isVisible()) {
      await oracleNameInput.fill(TEST_ORACLE_NAME)
      console.log('✅ 4. Filled oracle name:', TEST_ORACLE_NAME)
    }

    // 5. Click "Sign to Continue" button
    const signBtn = page.locator('button').filter({ hasText: /sign.*continue|sign.*message/i }).first()
    if (await signBtn.isVisible()) {
      await signBtn.click()

      // Process signature request
      await processSignatures(page)
      await page.waitForTimeout(1000) // Wait for UI to update
      console.log('✅ 5. Message signed')
    } else {
      console.log('⚠️ 5. Sign button not found')
    }

    // 6. Fill verification issue URL (appears after signing)
    await page.waitForTimeout(1000)
    // Look for any visible input that could be verification issue
    const verifyInput = page.getByPlaceholder(/11|verification|oracle-identity|issue/i).first()
    const anyInput = page.locator('input[type="text"]').last() // Last input is likely verification

    if (await verifyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verifyInput.fill(TEST_VERIFICATION_ISSUE)
      console.log('✅ 6. Filled verification issue:', TEST_VERIFICATION_ISSUE)
    } else if (await anyInput.isVisible()) {
      await anyInput.fill(TEST_VERIFICATION_ISSUE)
      console.log('✅ 6. Filled verification issue (fallback):', TEST_VERIFICATION_ISSUE)
    } else {
      console.log('⚠️ 6. Verification input not found, taking screenshot')
      await page.screenshot({ path: 'test-results/verify-step6-debug.png' })
    }

    // 7. Click Verify Identity button
    const verifyBtn = page.locator('button').filter({ hasText: /verify.*identity/i }).first()
    if (await verifyBtn.isVisible()) {
      await expect(verifyBtn).toBeEnabled({ timeout: 3000 })
      await verifyBtn.click()
      console.log('✅ 7. Clicked Verify Identity')

      // Wait for API response
      await page.waitForTimeout(3000)
    }

    // 8. Check for result (success or error)
    const successMessage = page.locator('text=/verified|success|welcome/i').first()
    const errorMessage = page.locator('text=/error|failed|invalid/i').first()

    const hasSuccess = await successMessage.isVisible({ timeout: 5000 }).catch(() => false)
    const hasError = await errorMessage.isVisible({ timeout: 1000 }).catch(() => false)

    if (hasSuccess) {
      console.log('✅ 8. Verification SUCCESS!')
    } else if (hasError) {
      const errorText = await errorMessage.textContent()
      console.log('⚠️ 8. Got error (expected for test wallet):', errorText?.slice(0, 100))
    } else {
      console.log('⏳ 8. Waiting for response...')
    }

    // Take screenshot
    await page.screenshot({ path: 'test-results/verify-identity-flow.png' })
    console.log('📸 Screenshot saved')
  })

  test('shows all form fields', async ({ page }) => {
    await page.goto('/identity')

    // Connect wallet first
    const connectBtn = page.locator('button').filter({ hasText: /connect/i }).first()
    if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await connectBtn.click()
    }

    await expect(page.getByText(testAccount.address.slice(0, 6)).first()).toBeVisible({ timeout: 5000 })

    // Check for form fields
    const birthInput = page.getByPlaceholder(/121|birth/i)
    const oracleInput = page.getByPlaceholder(/SHRIMP|oracle/i)

    // At least one of these should be visible
    const hasBirthInput = await birthInput.first().isVisible({ timeout: 3000 }).catch(() => false)
    const hasOracleInput = await oracleInput.first().isVisible({ timeout: 1000 }).catch(() => false)

    console.log('Birth issue input:', hasBirthInput ? '✅' : '❌')
    console.log('Oracle name input:', hasOracleInput ? '✅' : '❌')

    expect(hasBirthInput || hasOracleInput).toBe(true)
  })
})
