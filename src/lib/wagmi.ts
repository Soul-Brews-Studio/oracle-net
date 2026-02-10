import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'

export const config = createConfig({
  chains: [mainnet],
  // EIP-6963: auto-detect all installed wallets
  multiInjectedProviderDiscovery: true,
  transports: {
    [mainnet.id]: http(),
  },
})

// API URL for SIWE auth (CF Worker)
export const API_URL = import.meta.env.VITE_API_URL || 'https://api.oraclenet.org'
