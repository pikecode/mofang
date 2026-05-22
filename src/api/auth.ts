// TOKEN管理模块 - JWT鉴权（可配置）

interface AuthConfig {
  enabled: boolean
  token: string
  username: string
  password: string
}

function getEnvFlag(value: string | undefined): boolean {
  return value === 'true'
}

// 交付环境默认走同源会话，只有显式配置环境变量时才启用TOKEN。
function getConfig(): AuthConfig {
  return {
    enabled: getEnvFlag(import.meta.env.VITE_USE_TOKEN_AUTH),
    token: import.meta.env.VITE_AUTH_TOKEN || '',
    username: import.meta.env.VITE_AUTH_USERNAME || '',
    password: import.meta.env.VITE_AUTH_PASSWORD || '',
  }
}

const TOKEN_KEY = 'mf_jwt_token'
const REFRESH_TOKEN_KEY = 'mf_jwt_refresh_token'
const TOKEN_EXPIRES_KEY = 'mf_jwt_expires'

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function normalizeToken(token: string): string {
  return token.replace(/^Bearer\s+/i, '').trim()
}

function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

function saveToken(token: string, refreshToken?: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_EXPIRES_KEY, String(Date.now() + 28 * 60 * 1000))
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRES_KEY)
}

function isTokenExpired(): boolean {
  const expires = localStorage.getItem(TOKEN_EXPIRES_KEY)
  if (!expires) return true
  return Date.now() > Number(expires)
}

async function login(username: string, password: string): Promise<string> {
  const response = await fetch('/magicflu/jwt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `j_username=${encodeURIComponent(username)}&j_password=${encodeURIComponent(password)}`,
  })

  if (!response.ok) {
    throw new Error(`登录失败: ${response.status}`)
  }

  const data = await response.json()
  if (!data.token) {
    throw new Error('登录失败: 未获取到TOKEN')
  }

  saveToken(data.token, data.refreshToken)
  return data.token
}

async function refreshAccessToken(username: string): Promise<string | null> {
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return null

  try {
    const response = await fetch('/magicflu/jwt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `j_username=${encodeURIComponent(username)}&j_refresh=${encodeURIComponent(refreshToken)}`,
    })

    if (!response.ok) return null

    const data = await response.json()
    if (data.token) {
      saveToken(data.token, data.refreshToken)
      return data.token
    }
  } catch {
    // 忽略
  }
  return null
}

async function ensureToken(): Promise<string> {
  const config = getConfig()

  // 鉴权禁用，返回空
  if (!config.enabled) return ''
  if (config.token) {
    return normalizeToken(config.token)
  }
  if (!config.username || !config.password) {
    throw new Error('TOKEN鉴权已启用，但缺少静态TOKEN或账号密码配置')
  }

  const token = getStoredToken()
  if (token && !isTokenExpired()) {
    return token
  }

  // 尝试刷新
  if (token) {
    const refreshed = await refreshAccessToken(config.username)
    if (refreshed) return refreshed
  }

  // 重新登录
  return await login(config.username, config.password)
}

// 获取请求头
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const config = getConfig()
  if (!config.enabled) return {}

  const token = await ensureToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// 包装fetch请求 - 自动带TOKEN
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = await getAuthHeaders()
  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })
}

// 检查鉴权是否启用
export function isTokenAuthEnabled(): boolean {
  return getConfig().enabled
}

// 获取TOKEN状态
export function getTokenStatus(): {
  enabled: boolean
  hasToken: boolean
  expiresAt: number | null
} {
  const config = getConfig()
  const token = getStoredToken()
  const expires = localStorage.getItem(TOKEN_EXPIRES_KEY)
  return {
    enabled: config.enabled,
    hasToken: !!config.token || !!token,
    expiresAt: expires ? Number(expires) : null,
  }
}

// 手动登录（供UI调用）
export async function manualLogin(username: string, password: string): Promise<boolean> {
  try {
    await login(username, password)
    return true
  } catch {
    return false
  }
}

// 获取当前配置
export function getAuthConfig(): { enabled: boolean; username: string } {
  const config = getConfig()
  return { enabled: config.enabled, username: config.username }
}
