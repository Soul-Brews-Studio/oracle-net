#!/usr/bin/env bun
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const SIWER_URL = process.env.SIWER_URL || 'https://siwer.larisara.workers.dev'

const testPrivateKey = generatePrivateKey()
const testAccount = privateKeyToAccount(testPrivateKey)

console.log('Testing SIWE flow against:', SIWER_URL)
console.log('Test wallet:', testAccount.address)
console.log('')

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✅ ${name}`)
  } catch (e: any) {
    console.log(`❌ ${name}: ${e.message}`)
    process.exit(1)
  }
}

await test('GET / returns service info', async () => {
  const res = await fetch(SIWER_URL)
  const json = await res.json() as any
  if (json.service !== 'siwer') throw new Error('Expected service=siwer')
  if (json.status !== 'ok') throw new Error('Expected status=ok')
})

await test('POST /nonce generates nonce', async () => {
  const res = await fetch(`${SIWER_URL}/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: testAccount.address })
  })
  const json = await res.json() as any
  if (!json.success) throw new Error('Expected success=true')
  if (!json.nonce || json.nonce.length !== 8) throw new Error('Expected 8-char nonce')
  if (!json.message.includes('Sign in to OracleNet')) throw new Error('Expected sign-in message')
})

await test('POST /nonce without address fails', async () => {
  const res = await fetch(`${SIWER_URL}/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  const json = await res.json() as any
  if (res.status !== 400) throw new Error('Expected 400 status')
  if (json.success !== false) throw new Error('Expected success=false')
})

await test('POST /verify without nonce fails', async () => {
  const freshWallet = privateKeyToAccount(generatePrivateKey())
  const signature = await freshWallet.signMessage({ message: 'test' })
  const res = await fetch(`${SIWER_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: freshWallet.address,
      signature,
      name: 'TestOracle'
    })
  })
  const json = await res.json() as any
  if (res.status !== 400) throw new Error('Expected 400 status')
  if (!json.error?.includes('nonce')) throw new Error(`Expected nonce error, got: ${json.error}`)
})

await test('Full nonce + verify flow (signature validation)', async () => {
  const nonceRes = await fetch(`${SIWER_URL}/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: testAccount.address })
  })
  const nonceJson = await nonceRes.json() as any
  
  const signature = await testAccount.signMessage({ message: nonceJson.message })
  
  const verifyRes = await fetch(`${SIWER_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: testAccount.address,
      signature,
      name: 'TestOracle'
    })
  })
  const verifyJson = await verifyRes.json() as any
  
  if (verifyJson.success) {
    if (!verifyJson.token) throw new Error('Expected token on success')
    if (!verifyJson.oracle) throw new Error('Expected oracle on success')
    console.log('   Created oracle:', verifyJson.oracle.name, '| ID:', verifyJson.oracle.id)
  } else {
    if (verifyJson.error?.includes('Invalid signature')) {
      throw new Error('Signature should be valid')
    }
  }
})

await test('Invalid signature rejected', async () => {
  const nonceRes = await fetch(`${SIWER_URL}/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: testAccount.address })
  })
  await nonceRes.json()
  
  const otherAccount = privateKeyToAccount(generatePrivateKey())
  const wrongSignature = await otherAccount.signMessage({ message: 'wrong message' })
  
  const verifyRes = await fetch(`${SIWER_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: testAccount.address,
      signature: wrongSignature,
      name: 'TestOracle'
    })
  })
  const verifyJson = await verifyRes.json() as any
  
  if (verifyJson.success) throw new Error('Should reject invalid signature')
  if (!verifyJson.error?.includes('Invalid signature')) {
    throw new Error('Expected "Invalid signature" error')
  }
})

await test('GET /check-verified returns false for unknown wallet', async () => {
  const randomWallet = privateKeyToAccount(generatePrivateKey())
  const res = await fetch(`${SIWER_URL}/check-verified?wallet=${randomWallet.address}`)
  const json = await res.json() as any
  if (json.verified !== false) throw new Error('Expected verified=false')
})

console.log('')
console.log('All tests passed!')
