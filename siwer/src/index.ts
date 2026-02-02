import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyMessage, recoverMessageAddress, keccak256, toBytes } from 'viem'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import PocketBase from 'pocketbase'

const ADMIN_LOGIN_MESSAGE = 'OracleNet Admin Login'

function derivePassword(signature: string): string {
  const hash = keccak256(toBytes(signature))
  return hash.slice(2, 34)
}

type Bindings = {
  NONCES: KVNamespace
  POCKETBASE_URL: string
  PB_ADMIN_EMAIL: string
  PB_ADMIN_PASSWORD: string
  ADMIN_WALLETS?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('*', cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://oracle-net.laris.workers.dev',
  ],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

const VERSION = '3.0.0'
const BUILD_TIME = '2026-02-02T16:00:00+07:00'

app.get('/', (c) => c.json({
  service: 'siwer',
  status: 'ok',
  version: VERSION,
  build: BUILD_TIME,
  features: ['siwe', 'merkle-identity', 'delegated-auth']
}))

// ============================================
// SIWE Authentication (existing)
// ============================================

// Step 1: Get nonce for signing
app.post('/nonce', async (c) => {
  const { address } = await c.req.json<{ address: string }>()

  if (!address) {
    return c.json({ success: false, error: 'address required' }, 400)
  }

  const nonce = crypto.randomUUID().slice(0, 8)
  const timestamp = Date.now()

  // Store nonce (5 min expiry)
  await c.env.NONCES.put(address.toLowerCase(), JSON.stringify({
    nonce,
    timestamp
  }), { expirationTtl: 300 })

  // Message to sign
  const message = `Sign in to OracleNet

Nonce: ${nonce}
Timestamp: ${new Date(timestamp).toISOString()}`

  return c.json({
    success: true,
    nonce,
    message
  })
})

// Step 2: Verify signature & auth
app.post('/verify', async (c) => {
  const { address, signature, name } = await c.req.json<{
    address: `0x${string}`
    signature: `0x${string}`
    name?: string
  }>()

  if (!address || !signature) {
    return c.json({ success: false, error: 'address and signature required' }, 400)
  }

  // Get nonce
  const nonceData = await c.env.NONCES.get(address.toLowerCase())
  if (!nonceData) {
    return c.json({ success: false, error: 'No nonce found. Call /nonce first' }, 400)
  }

  const { nonce, timestamp } = JSON.parse(nonceData)

  // Reconstruct message
  const message = `Sign in to OracleNet

Nonce: ${nonce}
Timestamp: ${new Date(timestamp).toISOString()}`

  // Verify with viem
  let isValid = false
  try {
    isValid = await verifyMessage({
      address,
      message,
      signature
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Verification failed: ' + e.message }, 400)
  }

  if (!isValid) {
    return c.json({ success: false, error: 'Invalid signature' }, 400)
  }

  // Delete used nonce
  await c.env.NONCES.delete(address.toLowerCase())

  // Connect to PocketBase
  const pb = new PocketBase(c.env.POCKETBASE_URL)

  // Find or create oracle by wallet
  let oracle: any
  let created = false

  try {
    oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${address.toLowerCase()}"`
    )
  } catch {
    // Create new oracle
    const oracleName = name || `Oracle-${address.slice(0, 6)}`
    const walletEmail = `${address.toLowerCase().slice(2, 10)}@wallet.oraclenet`
    try {
      oracle = await pb.collection('oracles').create({
        name: oracleName,
        email: walletEmail,
        wallet_address: address.toLowerCase(),
        password: address.toLowerCase(),
        passwordConfirm: address.toLowerCase(),
        karma: 0,
        approved: false  // Not approved until fully verified (github + birth_issue)
      })
      created = true
    } catch (e: any) {
      return c.json({ success: false, error: 'Create failed: ' + e.message }, 500)
    }
  }

  let token: string
  const walletEmail = oracle.email || `${address.toLowerCase().slice(2, 10)}@wallet.oraclenet`
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      walletEmail,
      address.toLowerCase()
    )
    token = auth.token
  } catch {
    try {
      await pb.collection('oracles').update(oracle.id, {
        email: walletEmail,
        password: address.toLowerCase(),
        passwordConfirm: address.toLowerCase()
      })
      const auth = await pb.collection('oracles').authWithPassword(
        walletEmail,
        address.toLowerCase()
      )
      token = auth.token
    } catch (e: any) {
      return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
    }
  }

  return c.json({
    success: true,
    created,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      email: oracle.email,
      bio: oracle.bio,
      repo_url: oracle.repo_url,
      human: oracle.human,
      wallet_address: oracle.wallet_address,
      github_username: oracle.github_username,
      github_id: oracle.github_id,
      github_repo: oracle.github_repo,
      birth_issue: oracle.birth_issue,
      approved: oracle.approved,
      karma: oracle.karma,
      created: oracle.created,
      updated: oracle.updated
    },
    token
  })
})

// Link wallet to existing oracle (by name)
app.post('/link', async (c) => {
  const { address, signature, oracleName } = await c.req.json<{
    address: `0x${string}`
    signature: `0x${string}`
    oracleName: string
  }>()

  if (!address || !signature || !oracleName) {
    return c.json({ success: false, error: 'address, signature, and oracleName required' }, 400)
  }

  // Get nonce
  const nonceData = await c.env.NONCES.get(address.toLowerCase())
  if (!nonceData) {
    return c.json({ success: false, error: 'No nonce found. Call /nonce first' }, 400)
  }

  const { nonce, timestamp } = JSON.parse(nonceData)

  // Reconstruct message
  const message = `Sign in to OracleNet

Nonce: ${nonce}
Timestamp: ${new Date(timestamp).toISOString()}`

  // Verify signature
  let isValid = false
  try {
    isValid = await verifyMessage({ address, message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Verification failed: ' + e.message }, 400)
  }

  if (!isValid) {
    return c.json({ success: false, error: 'Invalid signature' }, 400)
  }

  // Delete used nonce
  await c.env.NONCES.delete(address.toLowerCase())

  const pb = new PocketBase(c.env.POCKETBASE_URL)

  let oracle: any
  try {
    oracle = await pb.collection('oracles').getFirstListItem(`name = "${oracleName}"`)
  } catch {
    return c.json({ success: false, error: `Oracle "${oracleName}" not found` }, 404)
  }

  if (oracle.wallet_address && oracle.wallet_address !== address.toLowerCase()) {
    return c.json({ success: false, error: 'Oracle already linked to different wallet' }, 400)
  }

  try {
    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
    await pb.collection('oracles').update(oracle.id, {
      wallet_address: address.toLowerCase(),
      password: address.toLowerCase(),
      passwordConfirm: address.toLowerCase()
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Update failed: ' + e.message }, 500)
  }

  // Auth and get token
  let token: string
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      address.toLowerCase(),
      address.toLowerCase()
    )
    token = auth.token
  } catch (e: any) {
    return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
  }

  return c.json({
    success: true,
    linked: true,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      wallet_address: address.toLowerCase(),
      approved: oracle.approved
    },
    token
  })
})

// ============================================
// NEW: Merkle-based Identity System
// ============================================

// GET /check-verified - Check if wallet is verified
app.get('/check-verified', async (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet) {
    return c.json({ verified: false })
  }

  const data = await c.env.NONCES.get(`verified:${wallet.toLowerCase()}`)
  if (!data) {
    return c.json({ verified: false })
  }

  const parsed = JSON.parse(data)
  return c.json({
    verified: true,
    github_username: parsed.github_username,
    verified_at: parsed.verified_at
  })
})

// Types
type Assignment = {
  bot: string
  oracle: string
  issue: number
  github_repo?: string  // e.g., "owner/repo" - not part of Merkle encoding, just metadata for URL
}

// Leaf encoding for OZ Merkle tree
const LEAF_ENCODING: string[] = ['address', 'string', 'uint256']

// Convert assignment to OZ leaf tuple
function toLeafTuple(a: Assignment): [string, string, bigint] {
  return [a.bot.toLowerCase(), a.oracle, BigInt(a.issue)]
}

/**
 * Step 1: verify-github - Human proves GitHub ownership
 * KV keys: verified:{humanWallet} → { github_username, verified_at, gist_url }
 */
app.post('/verify-github', async (c) => {
  const { gistUrl, signer } = await c.req.json<{
    gistUrl: string
    signer: `0x${string}`
  }>()

  if (!gistUrl || !signer) {
    return c.json({ success: false, error: 'gistUrl and signer required' }, 400)
  }

  // 1. Fetch gist
  const gistId = gistUrl.split('/').pop()
  let gist: any
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`)
    gist = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch gist: ' + e.message }, 400)
  }

  // 2. Get proof from gist
  const files = Object.values(gist.files) as any[]
  if (!files.length) {
    return c.json({ success: false, error: 'Gist has no files' }, 400)
  }

  let proof: any
  try {
    proof = JSON.parse(files[0].content)
  } catch {
    return c.json({ success: false, error: 'Invalid proof JSON in gist' }, 400)
  }

  // 3. Verify signature
  let recovered: string
  try {
    recovered = await recoverMessageAddress({
      message: proof.message,
      signature: proof.signature as `0x${string}`
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== signer.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${signer}, got ${recovered}`
    }, 400)
  }

  // 4. Get GitHub username from gist owner
  const githubUsername = gist.owner?.login
  if (!githubUsername) {
    return c.json({ success: false, error: 'Could not determine gist owner' }, 400)
  }

  // 5. Store: human wallet → github (no expiry - permanent verification)
  await c.env.NONCES.put(`verified:${signer.toLowerCase()}`, JSON.stringify({
    github_username: githubUsername,
    verified_at: new Date().toISOString(),
    gist_url: gistUrl
  }))

  return c.json({
    success: true,
    github_username: githubUsername,
    wallet: signer.toLowerCase()
  })
})

/**
 * Step 2: assign - Human signs Merkle root of bot assignments
 * KV keys: root:{merkleRoot} → { humanWallet, github_username, assignments, assigned_at }
 */
app.post('/assign', async (c) => {
  const { merkleRoot, assignments, signature, message, humanWallet } = await c.req.json<{
    merkleRoot: string
    assignments: Assignment[]
    signature: `0x${string}`
    message: string
    humanWallet: `0x${string}`
  }>()

  if (!merkleRoot || !assignments || !signature || !humanWallet) {
    return c.json({ success: false, error: 'merkleRoot, assignments, signature, and humanWallet required' }, 400)
  }

  // 1. Check human is verified
  const verifiedData = await c.env.NONCES.get(`verified:${humanWallet.toLowerCase()}`)
  if (!verifiedData) {
    return c.json({ success: false, error: 'Human not verified. Run verify-github first.' }, 403)
  }
  const verified = JSON.parse(verifiedData)

  // 2. Verify Merkle root matches assignments
  const leaves = assignments.map(a => toLeafTuple(a))
  const tree = StandardMerkleTree.of(leaves, LEAF_ENCODING)
  const computedRoot = tree.root

  if (computedRoot.toLowerCase() !== merkleRoot.toLowerCase()) {
    return c.json({
      success: false,
      error: `Merkle root mismatch: expected ${merkleRoot}, computed ${computedRoot}`
    }, 400)
  }

  // 3. Verify signature from human
  let recovered: string
  try {
    recovered = await recoverMessageAddress({
      message,
      signature
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== humanWallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${humanWallet}, got ${recovered}`
    }, 400)
  }

  // 4. Store: merkleRoot → { human, assignments, github }
  await c.env.NONCES.put(`root:${merkleRoot.toLowerCase()}`, JSON.stringify({
    humanWallet: humanWallet.toLowerCase(),
    github_username: verified.github_username,
    assignments,
    assigned_at: new Date().toISOString()
  }))

  // Also index by bot address for quick lookup
  for (const a of assignments) {
    await c.env.NONCES.put(`bot:${a.bot.toLowerCase()}`, JSON.stringify({
      merkleRoot: merkleRoot.toLowerCase(),
      oracle: a.oracle,
      issue: a.issue,
      humanWallet: humanWallet.toLowerCase(),
      github_username: verified.github_username
    }))
  }

  return c.json({
    success: true,
    merkleRoot,
    bots: assignments.length,
    github_username: verified.github_username
  })
})

/**
 * Step 3: claim - Bot proves membership using Merkle proof
 * Creates Oracle in PocketBase with github_username from root owner
 */
app.post('/claim', async (c) => {
  const { signature, message, botWallet, leaf, proof, merkleRoot } = await c.req.json<{
    signature: `0x${string}`
    message: string
    botWallet: `0x${string}`
    leaf: Assignment
    proof: string[]
    merkleRoot: string
  }>()

  if (!signature || !botWallet || !leaf || !proof || !merkleRoot) {
    return c.json({ success: false, error: 'signature, botWallet, leaf, proof, and merkleRoot required' }, 400)
  }

  // 1. Look up the Merkle root to get human's github
  const rootData = await c.env.NONCES.get(`root:${merkleRoot.toLowerCase()}`)
  if (!rootData) {
    return c.json({ success: false, error: 'Merkle root not found. Human must run assign first.' }, 403)
  }
  const root = JSON.parse(rootData)

  // 2. Verify the bot is in the assignments
  const botAssignment = root.assignments.find(
    (a: Assignment) => a.bot.toLowerCase() === botWallet.toLowerCase()
  )
  if (!botAssignment) {
    return c.json({ success: false, error: 'Bot not in this Merkle root assignments' }, 403)
  }

  // 3. Verify leaf matches
  if (botAssignment.oracle !== leaf.oracle || botAssignment.issue !== leaf.issue) {
    return c.json({ success: false, error: 'Leaf data mismatch with stored assignment' }, 400)
  }

  // 4. Verify Merkle proof
  const leafTuple = toLeafTuple(leaf)
  const isValid = StandardMerkleTree.verify(merkleRoot, LEAF_ENCODING, leafTuple, proof)
  if (!isValid) {
    return c.json({ success: false, error: 'Invalid Merkle proof' }, 400)
  }

  // 5. Verify bot signature
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== botWallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${botWallet}, got ${recovered}`
    }, 400)
  }

  // 6. Construct birth issue URL from repo + issue number
  const birthIssueUrl = leaf.github_repo
    ? `https://github.com/${leaf.github_repo}/issues/${leaf.issue}`
    : `${leaf.issue}` // fallback to just number if no repo (legacy)

  // 7. Create or update Oracle in PocketBase
  const pb = new PocketBase(c.env.POCKETBASE_URL)

  let oracle: any
  let created = false

  try {
    // First check if oracle with this wallet exists
    oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${botWallet.toLowerCase()}"`
    )
    // Update with verified info
    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
    await pb.collection('oracles').update(oracle.id, {
      name: leaf.oracle,
      github_username: root.github_username,
      birth_issue: birthIssueUrl,
      approved: true
    })
    oracle.name = leaf.oracle
    oracle.github_username = root.github_username
    oracle.birth_issue = birthIssueUrl
    oracle.approved = true
  } catch {
    // Create new oracle
    const walletEmail = `${botWallet.toLowerCase().slice(2, 10)}@wallet.oraclenet`
    try {
      await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
      oracle = await pb.collection('oracles').create({
        name: leaf.oracle,
        email: walletEmail,
        wallet_address: botWallet.toLowerCase(),
        github_username: root.github_username,
        birth_issue: birthIssueUrl,
        password: botWallet.toLowerCase(),
        passwordConfirm: botWallet.toLowerCase(),
        karma: 0,
        approved: true
      })
      created = true
    } catch (e: any) {
      return c.json({ success: false, error: 'Create failed: ' + e.message }, 500)
    }
  }

  // Get auth token
  let token: string
  const walletEmail = oracle.email || `${botWallet.toLowerCase().slice(2, 10)}@wallet.oraclenet`
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      walletEmail,
      botWallet.toLowerCase()
    )
    token = auth.token
  } catch (e: any) {
    return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
  }

  return c.json({
    success: true,
    created,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      wallet_address: oracle.wallet_address,
      github_username: oracle.github_username,
      birth_issue: oracle.birth_issue,
      approved: oracle.approved
    },
    token
  })
})

// ============================================
// Legacy claim (for backwards compatibility)
// ============================================

app.post('/claim-legacy', async (c) => {
  const { name, gistUrl, issueUrl, signer } = await c.req.json<{
    name: string
    gistUrl: string
    issueUrl: string
    signer: `0x${string}`
  }>()

  if (!name || !gistUrl || !issueUrl || !signer) {
    return c.json({ success: false, error: 'name, gistUrl, issueUrl, and signer required' }, 400)
  }

  // 1. Fetch gist
  const gistId = gistUrl.split('/').pop()
  let gist: any
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`)
    gist = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch gist: ' + e.message }, 400)
  }

  // 2. Get proof from gist
  const files = Object.values(gist.files) as any[]
  if (!files.length) {
    return c.json({ success: false, error: 'Gist has no files' }, 400)
  }

  let proof: any
  try {
    proof = JSON.parse(files[0].content)
  } catch {
    return c.json({ success: false, error: 'Invalid proof JSON in gist' }, 400)
  }

  // 3. Verify signature
  let recoveredAddress: string
  try {
    recoveredAddress = await recoverMessageAddress({
      message: proof.message,
      signature: proof.signature as `0x${string}`
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recoveredAddress.toLowerCase() !== signer.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${signer}, got ${recoveredAddress}`
    }, 400)
  }

  // 4. Verify gist owner matches issue commenter
  const gistOwner = gist.owner?.login
  if (!gistOwner) {
    return c.json({ success: false, error: 'Could not determine gist owner' }, 400)
  }

  // Extract comment ID from issue URL (format: .../issues/123#issuecomment-456)
  const commentMatch = issueUrl.match(/issuecomment-(\d+)/)
  if (!commentMatch) {
    return c.json({ success: false, error: 'Invalid issue comment URL format' }, 400)
  }
  const commentId = commentMatch[1]

  // Parse repo from URL
  const repoMatch = issueUrl.match(/github\.com\/([^\/]+\/[^\/]+)\/issues/)
  if (!repoMatch) {
    return c.json({ success: false, error: 'Could not parse repo from issue URL' }, 400)
  }
  const repo = repoMatch[1]

  let comment: any
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues/comments/${commentId}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Comment fetch failed: ${res.status}`)
    comment = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch comment: ' + e.message }, 400)
  }

  const commentAuthor = comment.user?.login
  if (commentAuthor !== gistOwner) {
    return c.json({
      success: false,
      error: `GitHub user mismatch: gist owner is ${gistOwner}, comment author is ${commentAuthor}`
    }, 400)
  }

  // 5. Create or update Oracle
  const pb = new PocketBase(c.env.POCKETBASE_URL)

  let oracle: any
  let created = false

  // First check if oracle with this wallet exists
  try {
    oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${signer.toLowerCase()}"`
    )
    // Update with GitHub info
    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
    await pb.collection('oracles').update(oracle.id, {
      name: proof.oracle || name,
      github_username: gistOwner,
      approved: true
    })
    oracle.name = proof.oracle || name
    oracle.github_username = gistOwner
    oracle.approved = true
  } catch {
    // Create new oracle
    const walletEmail = `${signer.toLowerCase().slice(2, 10)}@wallet.oraclenet`
    try {
      await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
      oracle = await pb.collection('oracles').create({
        name: proof.oracle || name,
        email: walletEmail,
        wallet_address: signer.toLowerCase(),
        github_username: gistOwner,
        password: signer.toLowerCase(),
        passwordConfirm: signer.toLowerCase(),
        karma: 0,
        approved: true
      })
      created = true
    } catch (e: any) {
      return c.json({ success: false, error: 'Create failed: ' + e.message }, 500)
    }
  }

  // Get auth token
  let token: string
  const walletEmail = oracle.email || `${signer.toLowerCase().slice(2, 10)}@wallet.oraclenet`
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      walletEmail,
      signer.toLowerCase()
    )
    token = auth.token
  } catch (e: any) {
    return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
  }

  return c.json({
    success: true,
    created,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      wallet_address: oracle.wallet_address,
      github_username: oracle.github_username,
      approved: oracle.approved
    },
    token
  })
})

// ============================================
// NEW: GitHub Issue Verification (Browser-only)
// ============================================

/**
 * verify-github-issue - Verify GitHub via issue creation
 * User creates issue on GitHub, then signs message in browser
 * Backend fetches issue to get GitHub username
 */
app.post('/verify-github-issue', async (c) => {
  const { wallet, issueUrl, signature, message } = await c.req.json<{
    wallet: `0x${string}`
    issueUrl: string
    signature: `0x${string}`
    message: string
  }>()

  if (!wallet || !issueUrl || !signature || !message) {
    return c.json({ success: false, error: 'wallet, issueUrl, signature, and message required' }, 400)
  }

  // 1. Verify signature
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${wallet}, got ${recovered}`
    }, 400)
  }

  // 2. Parse issue URL
  // Format: https://github.com/owner/repo/issues/123
  const issueMatch = issueUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/)
  if (!issueMatch) {
    return c.json({ success: false, error: 'Invalid GitHub issue URL format' }, 400)
  }
  const [, owner, repo, issueNumber] = issueMatch

  // 3. Fetch issue from GitHub API
  let issue: any
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Issue fetch failed: ${res.status}`)
    issue = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch issue: ' + e.message }, 400)
  }

  // 4. Verify issue contains wallet address
  const issueBody = issue.body || ''
  if (!issueBody.toLowerCase().includes(wallet.toLowerCase())) {
    return c.json({
      success: false,
      error: 'Issue does not contain your wallet address'
    }, 400)
  }

  // 5. Get GitHub username from issue author
  const githubUsername = issue.user?.login
  if (!githubUsername) {
    return c.json({ success: false, error: 'Could not determine issue author' }, 400)
  }

  // 6. Store minimal data: wallet → github (permanent verification)
  await c.env.NONCES.put(`verified:${wallet.toLowerCase()}`, JSON.stringify({
    github_username: githubUsername,
    verified_at: new Date().toISOString()
  }))

  // 7. Update Oracle in PocketBase with github_username
  const pb = new PocketBase(c.env.POCKETBASE_URL)
  let oracleUpdated = false
  let oracleName = null
  let isFullyVerified = false

  try {
    // Find oracle by wallet
    const oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${wallet.toLowerCase()}"`
    )

    // Update with GitHub info (use GitHub username as name if still generic)
    const isGenericName = oracle.name?.startsWith('Oracle-')
    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)

    // Check if birth_issue exists - if so, this completes verification
    const hasBirthIssue = !!oracle.birth_issue
    isFullyVerified = hasBirthIssue  // Both github_username (just verified) and birth_issue present

    await pb.collection('oracles').update(oracle.id, {
      github_username: githubUsername,
      ...(isGenericName ? { name: githubUsername } : {}),
      ...(isFullyVerified ? { approved: true } : {})
    })
    oracleUpdated = true
    oracleName = isGenericName ? githubUsername : oracle.name
  } catch (e: any) {
    // Oracle might not exist yet - that's ok
    console.log('Could not update Oracle:', e.message)
  }

  return c.json({
    success: true,
    github_username: githubUsername,
    wallet: wallet.toLowerCase(),
    oracle_updated: oracleUpdated,
    oracle_name: oracleName,
    fully_verified: isFullyVerified
  })
})

/**
 * verify-birth-issue - Verify Oracle birth via GitHub issue
 * User provides birth issue URL, signs message in browser
 * Backend fetches issue to verify wallet is mentioned
 */
app.post('/verify-birth-issue', async (c) => {
  const { wallet, issueUrl, signature, message } = await c.req.json<{
    wallet: `0x${string}`
    issueUrl: string
    signature: `0x${string}`
    message: string
  }>()

  if (!wallet || !issueUrl || !signature || !message) {
    return c.json({ success: false, error: 'wallet, issueUrl, signature, and message required' }, 400)
  }

  // 1. Verify signature
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${wallet}, got ${recovered}`
    }, 400)
  }

  // 2. Parse issue URL
  // Format: https://github.com/owner/repo/issues/123
  const issueMatch = issueUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/)
  if (!issueMatch) {
    return c.json({ success: false, error: 'Invalid GitHub issue URL format' }, 400)
  }
  const [, owner, repo, issueNumber] = issueMatch

  // 3. Fetch issue from GitHub API
  let issue: any
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Issue fetch failed: ${res.status}`)
    issue = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch issue: ' + e.message }, 400)
  }

  // 4. Verify issue contains wallet address (in title or body)
  const issueContent = `${issue.title || ''} ${issue.body || ''}`.toLowerCase()
  if (!issueContent.includes(wallet.toLowerCase())) {
    return c.json({
      success: false,
      error: 'Birth issue does not contain your wallet address'
    }, 400)
  }

  // 5. Use full birth issue URL (not just the number)
  const birthIssueUrl = issueUrl

  // 6. Update Oracle in PocketBase with birth_issue
  const pb = new PocketBase(c.env.POCKETBASE_URL)
  let oracleUpdated = false
  let isFullyVerified = false

  try {
    // Find oracle by wallet
    const oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${wallet.toLowerCase()}"`
    )

    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)

    // Check if github_username exists - if so, this completes verification
    const hasGithubUsername = !!oracle.github_username
    isFullyVerified = hasGithubUsername  // Both birth_issue (just verified) and github_username present

    await pb.collection('oracles').update(oracle.id, {
      birth_issue: birthIssueUrl,
      ...(isFullyVerified ? { approved: true } : {})
    })
    oracleUpdated = true
  } catch (e: any) {
    return c.json({ success: false, error: 'Oracle not found. Connect wallet first.' }, 404)
  }

  return c.json({
    success: true,
    birth_issue: birthIssueUrl,
    wallet: wallet.toLowerCase(),
    oracle_updated: oracleUpdated,
    fully_verified: isFullyVerified
  })
})

// ============================================
// NEW: Single-Step Identity Verification
// ============================================

/**
 * verify-identity - Single-step verification (GitHub + Birth Issue)
 * User creates verification issue on GitHub, provides birth issue URL
 * Backend verifies both in one call
 */
app.post('/verify-identity', async (c) => {
  const { wallet, verificationIssueUrl, birthIssueUrl, signature, message } = await c.req.json<{
    wallet: `0x${string}`
    verificationIssueUrl: string
    birthIssueUrl: string
    signature: `0x${string}`
    message: string
  }>()

  if (!wallet || !verificationIssueUrl || !birthIssueUrl || !signature || !message) {
    return c.json({ success: false, error: 'wallet, verificationIssueUrl, birthIssueUrl, signature, and message required' }, 400)
  }

  // 1. Verify signature
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${wallet}, got ${recovered}`
    }, 400)
  }

  // 2. Parse verification issue URL → get GitHub username
  const verifyMatch = verificationIssueUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/)
  if (!verifyMatch) {
    return c.json({ success: false, error: 'Invalid verification issue URL format' }, 400)
  }
  const [, verifyOwner, verifyRepo, verifyIssueNumber] = verifyMatch

  let verifyIssue: any
  try {
    const res = await fetch(`https://api.github.com/repos/${verifyOwner}/${verifyRepo}/issues/${verifyIssueNumber}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Verification issue fetch failed: ${res.status}`)
    verifyIssue = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch verification issue: ' + e.message }, 400)
  }

  // Verify wallet is in the verification issue
  const verifyBody = verifyIssue.body || ''
  if (!verifyBody.toLowerCase().includes(wallet.toLowerCase())) {
    return c.json({
      success: false,
      error: 'Verification issue does not contain your wallet address',
      debug: {
        looking_for: wallet.toLowerCase(),
        issue_title: verifyIssue.title || '(no title)',
        issue_body_preview: (verifyIssue.body || '(no body)').slice(0, 500),
        issue_author: verifyIssue.user?.login || '(unknown)'
      }
    }, 400)
  }

  const githubUsername = verifyIssue.user?.login
  if (!githubUsername) {
    return c.json({ success: false, error: 'Could not determine verification issue author' }, 400)
  }

  // 3. Parse birth issue URL → verify wallet is mentioned
  const birthMatch = birthIssueUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/)
  if (!birthMatch) {
    return c.json({ success: false, error: 'Invalid birth issue URL format' }, 400)
  }
  const [, birthOwner, birthRepo, birthIssueNumber] = birthMatch

  let birthIssue: any
  try {
    const res = await fetch(`https://api.github.com/repos/${birthOwner}/${birthRepo}/issues/${birthIssueNumber}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Birth issue fetch failed: ${res.status}`)
    birthIssue = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch birth issue: ' + e.message }, 400)
  }

  // Get birth issue author
  const birthIssueAuthor = birthIssue.user?.login
  if (!birthIssueAuthor) {
    return c.json({ success: false, error: 'Could not determine birth issue author' }, 400)
  }

  // Verify GitHub users match (verification issue author == birth issue author)
  // This is the key check: same person created both issues = proves ownership
  if (githubUsername.toLowerCase() !== birthIssueAuthor.toLowerCase()) {
    return c.json({
      success: false,
      error: 'GitHub user mismatch: verification issue and birth issue must be created by the same user',
      debug: {
        verification_author: githubUsername,
        birth_author: birthIssueAuthor
      }
    }, 400)
  }

  // Note: We don't require wallet in birth issue anymore
  // The chain of trust is:
  // 1. Wallet signature proves wallet ownership
  // 2. Verification issue author proves GitHub ownership
  // 3. Birth issue author == verification author links to Oracle

  // Extract oracle name from the signed message (user provides it)
  let oracleName = githubUsername // fallback to GitHub username
  try {
    const messageData = JSON.parse(message)
    if (messageData.oracle_name && typeof messageData.oracle_name === 'string' && messageData.oracle_name.trim()) {
      oracleName = messageData.oracle_name.trim()
    }
  } catch {
    // If message isn't JSON, use GitHub username as fallback
  }

  // Use full URL instead of just the number
  const birthIssueUrlFull = birthIssueUrl

  // 4. Store GitHub verification (for legacy compatibility)
  await c.env.NONCES.put(`verified:${wallet.toLowerCase()}`, JSON.stringify({
    github_username: githubUsername,
    verified_at: new Date().toISOString()
  }))

  // 5. Update or create Oracle in PocketBase with github_username, birth_issue, and oracle name → approved
  const pb = new PocketBase(c.env.POCKETBASE_URL)
  await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)

  let oracle: any
  let created = false

  try {
    // Find oracle by wallet
    oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${wallet.toLowerCase()}"`
    )

    // Separate human identity from Oracle identity:
    // - name = human's display name (github_username)
    // - oracle_name = Oracle's name (from birth issue)
    await pb.collection('oracles').update(oracle.id, {
      name: githubUsername,
      oracle_name: oracleName,
      github_username: githubUsername,
      birth_issue: birthIssueUrlFull,
      approved: true
    })

    return c.json({
      success: true,
      github_username: githubUsername,
      birth_issue: birthIssueUrlFull,
      wallet: wallet.toLowerCase(),
      oracle_name: oracleName,
      fully_verified: true,
      created: false
    })
  } catch {
    // Oracle doesn't exist - create it
    const walletEmail = `${wallet.toLowerCase().slice(2, 10)}@wallet.oraclenet`
    try {
      oracle = await pb.collection('oracles').create({
        name: githubUsername,
        oracle_name: oracleName,
        email: walletEmail,
        wallet_address: wallet.toLowerCase(),
        github_username: githubUsername,
        birth_issue: birthIssueUrlFull,
        password: wallet.toLowerCase(),
        passwordConfirm: wallet.toLowerCase(),
        karma: 0,
        approved: true
      })
      created = true

      return c.json({
        success: true,
        github_username: githubUsername,
        birth_issue: birthIssueUrlFull,
        wallet: wallet.toLowerCase(),
        oracle_name: oracleName,
        fully_verified: true,
        created: true
      })
    } catch (e: any) {
      return c.json({ success: false, error: 'Failed to create Oracle: ' + e.message }, 500)
    }
  }
})

// ============================================
// NEW: Delegated Authorization (No Private Key Sharing)
// ============================================

/**
 * Step 1: auth-request - Bot registers authorization request
 * Bot calls this to register its intent to claim an oracle
 * Returns a request ID that human uses to authorize
 */
app.post('/auth-request', async (c) => {
  const { botWallet, oracleName, birthIssue } = await c.req.json<{
    botWallet: `0x${string}`
    oracleName: string
    birthIssue: string  // GitHub issue URL
  }>()

  if (!botWallet || !oracleName || !birthIssue) {
    return c.json({ success: false, error: 'botWallet, oracleName, and birthIssue required' }, 400)
  }

  const reqId = `req_${crypto.randomUUID().slice(0, 12)}`
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes

  // Store: reqId → { botWallet, oracleName, birthIssue, expiresAt }
  await c.env.NONCES.put(`authreq:${reqId}`, JSON.stringify({
    botWallet: botWallet.toLowerCase(),
    oracleName,
    birthIssue,
    createdAt: new Date().toISOString(),
    expiresAt,
    status: 'pending'
  }), { expirationTtl: 1800 }) // 30 min TTL

  return c.json({
    success: true,
    reqId,
    expiresAt
  })
})

/**
 * Step 2: authorize - Human signs authorization for bot
 * Human's browser submits signed authorization
 * Returns an auth code (base64 encoded JSON) for the bot
 */
app.post('/authorize', async (c) => {
  const { reqId, humanWallet, signature, message } = await c.req.json<{
    reqId: string
    humanWallet: `0x${string}`
    signature: `0x${string}`
    message: string
  }>()

  if (!reqId || !humanWallet || !signature || !message) {
    return c.json({ success: false, error: 'reqId, humanWallet, signature, and message required' }, 400)
  }

  // 1. Check auth request exists
  const reqData = await c.env.NONCES.get(`authreq:${reqId}`)
  if (!reqData) {
    return c.json({ success: false, error: 'Auth request not found or expired' }, 404)
  }
  const req = JSON.parse(reqData)

  // 2. Check human is verified
  const verifiedData = await c.env.NONCES.get(`verified:${humanWallet.toLowerCase()}`)
  if (!verifiedData) {
    return c.json({ success: false, error: 'Human not verified. Run verify-github first.' }, 403)
  }
  const verified = JSON.parse(verifiedData)

  // 3. Verify signature
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== humanWallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${humanWallet}, got ${recovered}`
    }, 400)
  }

  // 4. Build auth code payload
  const authPayload = {
    msg: message,
    sig: signature,
    human: humanWallet.toLowerCase(),
    bot: req.botWallet,
    oracle: req.oracleName,
    issue: req.birthIssue,
    reqId,
    github: verified.github_username,
    ts: new Date().toISOString()
  }

  // Encode as base64
  const authCode = `AUTH:${btoa(JSON.stringify(authPayload))}`

  // 5. Mark request as authorized
  await c.env.NONCES.put(`authreq:${reqId}`, JSON.stringify({
    ...req,
    status: 'authorized',
    humanWallet: humanWallet.toLowerCase(),
    github_username: verified.github_username,
    authorizedAt: new Date().toISOString()
  }), { expirationTtl: 1800 })

  return c.json({
    success: true,
    authCode
  })
})

/**
 * Step 3: claim-delegated - Bot claims oracle with auth code
 * Bot submits auth code + own signature
 * Creates Oracle in PocketBase with github_username from human
 */
app.post('/claim-delegated', async (c) => {
  const { authCode, botSignature, botMessage } = await c.req.json<{
    authCode: string
    botSignature: `0x${string}`
    botMessage: string
  }>()

  if (!authCode || !botSignature || !botMessage) {
    return c.json({ success: false, error: 'authCode, botSignature, and botMessage required' }, 400)
  }

  // 1. Decode auth code
  if (!authCode.startsWith('AUTH:')) {
    return c.json({ success: false, error: 'Invalid auth code format' }, 400)
  }

  let payload: {
    msg: string
    sig: string
    human: string
    bot: string
    oracle: string
    issue: string  // GitHub issue URL
    reqId: string
    github: string
    ts: string
  }
  try {
    payload = JSON.parse(atob(authCode.slice(5)))
  } catch {
    return c.json({ success: false, error: 'Failed to decode auth code' }, 400)
  }

  // 2. Verify auth request exists and is authorized
  const reqData = await c.env.NONCES.get(`authreq:${payload.reqId}`)
  if (!reqData) {
    return c.json({ success: false, error: 'Auth request not found or expired' }, 404)
  }
  const req = JSON.parse(reqData)

  if (req.status !== 'authorized') {
    return c.json({ success: false, error: 'Auth request not yet authorized by human' }, 400)
  }

  // 3. Verify human signature in auth code
  let humanRecovered: string
  try {
    humanRecovered = await recoverMessageAddress({
      message: payload.msg,
      signature: payload.sig as `0x${string}`
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Human signature recovery failed: ' + e.message }, 400)
  }

  if (humanRecovered.toLowerCase() !== payload.human) {
    return c.json({
      success: false,
      error: `Human signature mismatch in auth code`
    }, 400)
  }

  // 4. Verify bot signature
  let botRecovered: string
  try {
    botRecovered = await recoverMessageAddress({
      message: botMessage,
      signature: botSignature
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Bot signature recovery failed: ' + e.message }, 400)
  }

  if (botRecovered.toLowerCase() !== payload.bot) {
    return c.json({
      success: false,
      error: `Bot signature mismatch: expected ${payload.bot}, got ${botRecovered}`
    }, 400)
  }

  // 5. Mark request as claimed (single-use)
  await c.env.NONCES.put(`authreq:${payload.reqId}`, JSON.stringify({
    ...req,
    status: 'claimed',
    claimedAt: new Date().toISOString()
  }), { expirationTtl: 60 }) // Short TTL after claim

  // 6. Create or update Oracle in PocketBase
  const pb = new PocketBase(c.env.POCKETBASE_URL)
  const botWallet = payload.bot

  let oracle: any
  let created = false

  try {
    // First check if oracle with this wallet exists
    oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${botWallet.toLowerCase()}"`
    )
    // Update with verified info
    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
    await pb.collection('oracles').update(oracle.id, {
      name: payload.oracle,
      github_username: payload.github,
      birth_issue: payload.issue,
      approved: true
    })
    oracle.name = payload.oracle
    oracle.github_username = payload.github
    oracle.birth_issue = payload.issue
    oracle.approved = true
  } catch {
    // Create new oracle
    const walletEmail = `${botWallet.toLowerCase().slice(2, 10)}@wallet.oraclenet`
    try {
      await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
      oracle = await pb.collection('oracles').create({
        name: payload.oracle,
        email: walletEmail,
        wallet_address: botWallet.toLowerCase(),
        github_username: payload.github,
        birth_issue: payload.issue,
        password: botWallet.toLowerCase(),
        passwordConfirm: botWallet.toLowerCase(),
        karma: 0,
        approved: true
      })
      created = true
    } catch (e: any) {
      return c.json({ success: false, error: 'Create failed: ' + e.message }, 500)
    }
  }

  // Get auth token
  let token: string
  const walletEmail = oracle.email || `${botWallet.toLowerCase().slice(2, 10)}@wallet.oraclenet`
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      walletEmail,
      botWallet.toLowerCase()
    )
    token = auth.token
  } catch (e: any) {
    return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
  }

  return c.json({
    success: true,
    created,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      wallet_address: oracle.wallet_address,
      github_username: oracle.github_username,
      birth_issue: oracle.birth_issue,
      approved: oracle.approved
    },
    token
  })
})

/**
 * GET /auth-request/:reqId - Check auth request status
 * Used by bot to poll for authorization
 */
app.get('/auth-request/:reqId', async (c) => {
  const reqId = c.req.param('reqId')

  const reqData = await c.env.NONCES.get(`authreq:${reqId}`)
  if (!reqData) {
    return c.json({ success: false, error: 'Auth request not found or expired' }, 404)
  }

  const req = JSON.parse(reqData)
  return c.json({
    success: true,
    status: req.status,
    oracleName: req.oracleName,
    birthIssue: req.birthIssue,
    botWallet: req.botWallet,
    expiresAt: req.expiresAt
  })
})

// ============================================
// Admin: Cleanup endpoints
// ============================================

/**
 * DELETE /verified/:wallet - Remove wallet verification
 * Requires signature from the wallet being deleted
 */
app.delete('/verified/:wallet', async (c) => {
  const wallet = c.req.param('wallet')
  const { signature, message } = await c.req.json<{
    signature: `0x${string}`
    message: string
  }>()

  if (!signature || !message) {
    return c.json({ success: false, error: 'signature and message required' }, 400)
  }

  // Verify signature matches wallet
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${wallet}, got ${recovered}`
    }, 400)
  }

  // Delete verification
  await c.env.NONCES.delete(`verified:${wallet.toLowerCase()}`)

  // Also delete any bot assignments for this wallet
  await c.env.NONCES.delete(`bot:${wallet.toLowerCase()}`)

  return c.json({
    success: true,
    deleted: wallet.toLowerCase()
  })
})

/**
 * POST /admin/cleanup - Admin cleanup (requires admin auth)
 */
app.post('/admin/cleanup', async (c) => {
  const { wallet, adminEmail, adminPassword } = await c.req.json<{
    wallet: string
    adminEmail: string
    adminPassword: string
  }>()

  if (adminEmail !== c.env.PB_ADMIN_EMAIL || adminPassword !== c.env.PB_ADMIN_PASSWORD) {
    return c.json({ success: false, error: 'Invalid admin credentials' }, 403)
  }

  await c.env.NONCES.delete(`verified:${wallet.toLowerCase()}`)
  await c.env.NONCES.delete(`bot:${wallet.toLowerCase()}`)

  return c.json({
    success: true,
    deleted: wallet.toLowerCase()
  })
})

app.get('/admin-wallet', async (c) => {
  const pbUrl = c.env.POCKETBASE_URL
  const adminWallets = (c.env.ADMIN_WALLETS || '').toLowerCase().split(',').filter(Boolean)
  
  return c.html(`<!DOCTYPE html>
<html>
<head>
  <title>OracleNet Admin - Wallet Login</title>
  <script src="https://cdn.jsdelivr.net/npm/viem@2.23.0/dist/esm/index.min.js" type="module"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #e4e4e7; display: flex; justify-content: center; align-items: center; }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 450px; width: 90%; backdrop-filter: blur(10px); text-align: center; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .subtitle { color: #a1a1aa; margin-bottom: 24px; }
    button { padding: 16px 32px; background: #4f46e5; border: none; border-radius: 8px; color: white; cursor: pointer; font-size: 16px; font-weight: 600; transition: all 0.2s; width: 100%; }
    button:hover { background: #4338ca; transform: translateY(-1px); }
    button:disabled { background: #3f3f46; cursor: not-allowed; transform: none; }
    .status { margin-top: 20px; padding: 12px; border-radius: 8px; font-size: 14px; }
    .status.error { background: rgba(239,68,68,0.2); color: #fca5a5; }
    .status.success { background: rgba(34,197,94,0.2); color: #86efac; }
    .status.info { background: rgba(59,130,246,0.2); color: #93c5fd; }
    .wallet { font-family: monospace; font-size: 12px; color: #a1a1aa; margin-top: 8px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Admin Login</h1>
    <p class="subtitle">Sign with your wallet to access PocketBase admin</p>
    
    <button id="connectBtn" onclick="connectAndSign()">Connect Wallet & Sign</button>
    
    <div id="status" class="status info" style="display:none;"></div>
    <div id="wallet" class="wallet"></div>
  </div>
  
  <script type="module">
    const ADMIN_MESSAGE = '${ADMIN_LOGIN_MESSAGE}';
    const SIWER_URL = window.location.origin;
    const PB_URL = '${pbUrl}';
    
    window.connectAndSign = async function() {
      const btn = document.getElementById('connectBtn');
      const status = document.getElementById('status');
      const walletDiv = document.getElementById('wallet');
      
      btn.disabled = true;
      btn.textContent = 'Connecting...';
      status.style.display = 'block';
      status.className = 'status info';
      status.textContent = 'Requesting wallet connection...';
      
      try {
        if (!window.ethereum) {
          throw new Error('No wallet found. Install MetaMask!');
        }
        
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const address = accounts[0];
        walletDiv.textContent = address;
        
        status.textContent = 'Please sign the message in your wallet...';
        
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [ADMIN_MESSAGE, address]
        });
        
        status.textContent = 'Verifying signature...';
        
        const res = await fetch(SIWER_URL + '/admin-wallet-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, signature })
        });
        
        const data = await res.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Verification failed');
        }
        
        status.className = 'status success';
        status.textContent = 'Success! Redirecting to admin...';
        
        localStorage.setItem('__pb_superuser_auth__', JSON.stringify({
          token: data.token,
          record: data.record
        }));
        
        setTimeout(() => {
          window.location.href = PB_URL + '/_/';
        }, 500);
        
      } catch (e) {
        status.className = 'status error';
        status.textContent = e.message;
        btn.disabled = false;
        btn.textContent = 'Connect Wallet & Sign';
      }
    }
  </script>
</body>
</html>`)
})

app.post('/admin-wallet-verify', async (c) => {
  const { address, signature } = await c.req.json<{
    address: `0x${string}`
    signature: `0x${string}`
  }>()
  
  if (!address || !signature) {
    return c.json({ success: false, error: 'address and signature required' }, 400)
  }
  
  const adminWallets = (c.env.ADMIN_WALLETS || '').toLowerCase().split(',').filter(Boolean)
  
  if (adminWallets.length > 0 && !adminWallets.includes(address.toLowerCase())) {
    return c.json({ success: false, error: 'Wallet not authorized as admin' }, 403)
  }
  
  let recovered: string
  try {
    recovered = await recoverMessageAddress({
      message: ADMIN_LOGIN_MESSAGE,
      signature
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }
  
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return c.json({ success: false, error: 'Invalid signature' }, 400)
  }
  
  const derivedPassword = derivePassword(signature)
  const pbUrl = c.env.POCKETBASE_URL
  const adminEmail = c.env.PB_ADMIN_EMAIL
  
  try {
    const res = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: adminEmail, password: derivedPassword })
    })
    
    const data = await res.json() as { token?: string; record?: any; message?: string }
    
    if (data.token) {
      return c.json({
        success: true,
        token: data.token,
        record: data.record
      })
    }
    
    return c.json({ 
      success: false, 
      error: 'Auth failed. Password may need to be set. Derived: ' + derivedPassword.slice(0, 8) + '...',
      derivedPassword
    }, 401)
    
  } catch (e: any) {
    return c.json({ success: false, error: 'PocketBase error: ' + e.message }, 500)
  }
})

app.post('/admin-wallet-setup', async (c) => {
  const { address, signature, currentPassword } = await c.req.json<{
    address: `0x${string}`
    signature: `0x${string}`
    currentPassword: string
  }>()
  
  if (!address || !signature || !currentPassword) {
    return c.json({ success: false, error: 'address, signature, and currentPassword required' }, 400)
  }
  
  let recovered: string
  try {
    recovered = await recoverMessageAddress({
      message: ADMIN_LOGIN_MESSAGE,
      signature
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed' }, 400)
  }
  
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return c.json({ success: false, error: 'Invalid signature' }, 400)
  }
  
  const derivedPassword = derivePassword(signature)
  const pbUrl = c.env.POCKETBASE_URL
  const adminEmail = c.env.PB_ADMIN_EMAIL
  
  const pb = new PocketBase(pbUrl)
  
  try {
    await pb.collection('_superusers').authWithPassword(adminEmail, currentPassword)
    
    const superuser = await pb.collection('_superusers').getFirstListItem(`email = "${adminEmail}"`)
    
    await pb.collection('_superusers').update(superuser.id, {
      password: derivedPassword,
      passwordConfirm: derivedPassword
    })
    
    return c.json({
      success: true,
      message: 'Admin password updated to wallet-derived password',
      wallet: address.toLowerCase()
    })
    
  } catch (e: any) {
    return c.json({ success: false, error: 'Setup failed: ' + e.message }, 500)
  }
})

app.get('/admin-login', async (c) => {
  const pbUrl = c.env.POCKETBASE_URL
  const email = c.env.PB_ADMIN_EMAIL
  const password = c.env.PB_ADMIN_PASSWORD
  
  try {
    const res = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password: password })
    })
    
    const data = await res.json() as { token?: string; record?: any; message?: string }
    
    if (!data.token) {
      return c.html(`<h1>Auth Failed</h1><p>${data.message || 'Unknown error'}</p>`)
    }
    
    const authData = { token: data.token, record: data.record }
    const authJson = JSON.stringify(authData)
    const authB64 = btoa(authJson)
    
    return c.html(`<!DOCTYPE html>
<html>
<head>
  <title>OracleNet Admin</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #e4e4e7; display: flex; justify-content: center; align-items: center; }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 500px; width: 90%; backdrop-filter: blur(10px); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .subtitle { color: #a1a1aa; margin-bottom: 24px; }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 12px; color: #a1a1aa; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .input-group { display: flex; gap: 8px; }
    input { flex: 1; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; font-family: monospace; font-size: 14px; }
    button { padding: 12px 20px; background: #4f46e5; border: none; border-radius: 8px; color: white; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
    button:hover { background: #4338ca; transform: translateY(-1px); }
    .copy-btn { background: #27272a; }
    .copy-btn:hover { background: #3f3f46; }
    .copy-btn.copied { background: #16a34a; }
    .open-btn { width: 100%; margin-top: 24px; padding: 16px; font-size: 16px; }
    .divider { display: flex; align-items: center; gap: 16px; margin: 24px 0; color: #71717a; font-size: 12px; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.1); }
    .auto-section { text-align: center; }
    .auto-section p { color: #a1a1aa; font-size: 14px; margin-bottom: 16px; }
    code { background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>PocketBase Admin</h1>
    <p class="subtitle">Logged in as ${data.record?.email}</p>
    
    <div class="field">
      <label>Email</label>
      <div class="input-group">
        <input type="text" id="email" value="${email}" readonly>
        <button class="copy-btn" onclick="copyField('email', this)">Copy</button>
      </div>
    </div>
    
    <div class="field">
      <label>Password</label>
      <div class="input-group">
        <input type="password" id="password" value="${password}" readonly>
        <button class="copy-btn" onclick="copyField('password', this)">Copy</button>
      </div>
    </div>
    
    <a href="${pbUrl}/_/#/login" target="_blank" style="text-decoration: none;">
      <button class="open-btn">Open Admin Panel &rarr;</button>
    </a>
    
    <div class="divider">OR ONE-CLICK LOGIN</div>
    
    <div class="auto-section">
      <p>Click to open PocketBase and auto-login:</p>
      <button onclick="autoLogin()" style="padding: 16px 32px; background: #16a34a; border: none; border-radius: 8px; color: white; font-size: 16px; font-weight: 600; cursor: pointer;">
        Auto-Login to Admin
      </button>
      <p style="margin-top: 16px; font-size: 12px; color: #71717a;">Opens PocketBase in new tab and logs you in</p>
    </div>
  </div>
  
  <script>
    function copyField(id, btn) {
      const input = document.getElementById(id);
      if (id === 'password') input.type = 'text';
      input.select();
      document.execCommand('copy');
      if (id === 'password') input.type = 'password';
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    }
    
    function autoLogin() {
      const authData = '${authB64}';
      const pbUrl = '${pbUrl}';
      
      const html = \`<!DOCTYPE html>
<html>
<head><title>Logging in...</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:white;">
<div style="text-align:center;">
<p>Setting up auth...</p>
<script>
try {
  const auth = JSON.parse(atob('\${authData}'));
  localStorage.setItem('__pb_superuser_auth__', JSON.stringify(auth));
  window.location.href = '\${pbUrl}/_/';
} catch(e) {
  document.body.innerHTML = '<h2>Failed</h2><p>'+e.message+'</p>';
}
<\\/script>
</div>
</body>
</html>\`;
      
      const blob = new Blob([html], {type: 'text/html'});
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  </script>
</body>
</html>`)
  } catch (e: any) {
    return c.html(`<h1>Error</h1><p>${e.message}</p>`, 500)
  }
})

export default app
