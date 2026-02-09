/**
 * WS-RPC client — single WebSocket connection for all API calls.
 *
 * Drop-in transport: same request/response pattern as fetch(),
 * but multiplexed over one persistent WebSocket pipe.
 *
 * Falls back to regular fetch() when WS is not connected.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://api.oraclenet.org'
const WS_URL = API_URL.replace(/^http/, 'ws') + '/api/ws'

const REQUEST_TIMEOUT_MS = 10_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

interface PendingRequest {
  resolve: (value: { status: number; data: any }) => void
  reject: (reason: any) => void
  timer: ReturnType<typeof setTimeout>
}

interface WsRpcMessage {
  id: number
  method: string
  path: string
  body?: any
  headers?: Record<string, string>
}

interface WsRpcResponse {
  id: number
  status: number
  data: any
}

class OracleWebSocket {
  private ws: WebSocket | null = null
  private pending = new Map<number, PendingRequest>()
  private nextId = 1
  private reconnectDelay = RECONNECT_BASE_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionallyClosed = false
  private _connected = false

  get connected() {
    return this._connected
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return
    this.intentionallyClosed = false

    try {
      this.ws = new WebSocket(WS_URL)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this._connected = true
      this.reconnectDelay = RECONNECT_BASE_MS
    }

    this.ws.onmessage = (event) => {
      let msg: WsRpcResponse
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      const entry = this.pending.get(msg.id)
      if (entry) {
        clearTimeout(entry.timer)
        this.pending.delete(msg.id)
        entry.resolve({ status: msg.status, data: msg.data })
      }
    }

    this.ws.onclose = () => {
      this._connected = false
      this.rejectAllPending('WebSocket closed')
      if (!this.intentionallyClosed) this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }
  }

  close() {
    this.intentionallyClosed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this._connected = false
    this.rejectAllPending('WebSocket closed intentionally')
  }

  /**
   * Send an RPC request over WebSocket.
   * Returns { status, data } — same shape you'd get from fetch().json()
   */
  async request(method: string, path: string, options?: {
    body?: any
    headers?: Record<string, string>
  }): Promise<{ status: number; data: any }> {
    // If WS is still connecting, wait up to 2s for it to open
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      await this.waitForOpen(2000)
    }

    // Fall back to fetch if WS not connected
    if (!this._connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return this.fetchFallback(method, path, options)
    }

    const id = this.nextId++
    const msg: WsRpcMessage = { id, method, path }
    if (options?.body) msg.body = options.body
    if (options?.headers) msg.headers = options.headers

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        // Timeout → fall back to fetch for this request
        this.fetchFallback(method, path, options).then(resolve, reject)
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(id, { resolve, reject, timer })

      try {
        this.ws!.send(JSON.stringify(msg))
      } catch {
        clearTimeout(timer)
        this.pending.delete(id)
        this.fetchFallback(method, path, options).then(resolve, reject)
      }
    })
  }

  private async fetchFallback(method: string, path: string, options?: {
    body?: any
    headers?: Record<string, string>
  }): Promise<{ status: number; data: any }> {
    const url = `${API_URL}${path}`
    const init: RequestInit = {
      method,
      headers: { ...options?.headers },
    }
    if (options?.body && method.toUpperCase() !== 'GET') {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json'
      init.body = JSON.stringify(options.body)
    }
    const res = await fetch(url, init)
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : await res.text()
    return { status: res.status, data }
  }

  private waitForOpen(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.OPEN) { resolve(); return }
      if (this.ws.readyState !== WebSocket.CONNECTING) { resolve(); return }
      const ws = this.ws
      const timer = setTimeout(() => { cleanup(); resolve() }, timeoutMs)
      const onOpen = () => { cleanup(); resolve() }
      const onClose = () => { cleanup(); resolve() }
      const cleanup = () => { clearTimeout(timer); ws.removeEventListener('open', onOpen); ws.removeEventListener('close', onClose) }
      ws.addEventListener('open', onOpen)
      ws.addEventListener('close', onClose)
    })
  }

  private scheduleReconnect() {
    if (this.intentionallyClosed) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
  }

  private rejectAllPending(reason: string) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(reason))
    }
    this.pending.clear()
  }
}

/** Singleton WS client */
export const oracleWs = new OracleWebSocket()
