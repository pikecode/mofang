// TOKEN管理模块
// 注意：根据部署需求，TOKEN鉴权已禁用，依赖服务器高权限会话继承

// 配置 - TOKEN鉴权已禁用
const AUTH_CONFIG = {
  enabled: false,
}

// 获取请求头 - 无鉴权头
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return {}
}

// 包装fetch请求 - 直接透传
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(url, options)
}

// 检查TOKEN鉴权是否启用 - 始终返回false
export function isTokenAuthEnabled(): boolean {
  return AUTH_CONFIG.enabled
}

// 获取TOKEN状态 - 始终返回禁用状态
export function getTokenStatus(): {
  enabled: boolean
  hasToken: boolean
  hasRefreshToken: boolean
  valid: boolean
  expiresAt: number | null
} {
  return {
    enabled: false,
    hasToken: false,
    hasRefreshToken: false,
    valid: false,
    expiresAt: null,
  }
}

// 获取TOKEN - 始终返回null
export async function acquireToken(): Promise<string | null> {
  return null
}

// 刷新TOKEN - 始终返回null
export async function refreshToken(): Promise<string | null> {
  return null
}

// 清除TOKEN - 空操作
export function clearToken(): void {
  // TOKEN鉴权已禁用，无需清除
}
