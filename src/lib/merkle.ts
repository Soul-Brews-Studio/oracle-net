import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

export type Assignment = {
  bot: string
  oracle: string
  issue: number
}

export const LEAF_ENCODING: string[] = ['address', 'string', 'uint256']

export function toLeafTuple(a: Assignment): [string, string, bigint] {
  return [a.bot.toLowerCase(), a.oracle, BigInt(a.issue)]
}

export function buildMerkleTree(assignments: Assignment[]) {
  const leaves = assignments.map(a => toLeafTuple(a))
  return StandardMerkleTree.of(leaves, LEAF_ENCODING)
}

export function getMerkleRoot(assignments: Assignment[]): string {
  if (assignments.length === 0) return ''
  const tree = buildMerkleTree(assignments)
  return tree.root
}
