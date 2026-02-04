import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [mainnet],
  connectors: [
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
  },
})

// API URL for SIWE auth (PocketBase backend)
export const SIWER_URL = import.meta.env.VITE_API_URL || 'https://urchin-app-csg5x.ondigitalocean.app'
