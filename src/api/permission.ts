import type { Authority, ItemActionGroup, ItemTypeAcl, ItemAcl } from '@/types'
import { authenticatedFetch } from './auth'

const apiBase = '/magicflu/service'

// 默认spaceId
const DEFAULT_SPACE_ID = 'aada6708-898a-4eb2-a24a-3ac55c9a24f3'

export function getSpaceId(): string {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('spaceId') || DEFAULT_SPACE_ID
}

// 解析XML响应
function parseXML(xmlText: string): Document {
  if (xmlText.trim().startsWith('<!DOCTYPE html>') || xmlText.trim().startsWith('<html')) {
    throw new Error('API返回HTML页面，请检查鉴权状态')
  }
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('API返回的XML格式无法解析')
  }
  return doc
}

// 从XML提取权限主体
function extractAuthorities(doc: Document): Authority[] {
  const entries = doc.querySelectorAll('feed entry')
  const result: Authority[] = []

  entries.forEach((entry) => {
    const content = entry.querySelector('content')
    if (!content) return
    const el = content.querySelector('authority') || content.querySelector('authoriy')
    if (!el) return

    const typeId = el.querySelector('typeId')?.textContent
    const authId = el.querySelector('authId')?.textContent
    if (typeId && authId) {
      result.push({
        typeId: parseInt(typeId),
        authId,
        parentId: el.querySelector('parentId')?.textContent || undefined,
        name: el.querySelector('name')?.textContent || el.querySelector('description')?.textContent || undefined,
      })
    }
  })
  return result
}

// 通用XML请求
async function xmlGet(url: string): Promise<Document> {
  const response = await authenticatedFetch(url)
  if (!response.ok) throw new Error(`请求失败: ${response.status}`)
  return parseXML(await response.text())
}

// ==================== 权限主体接口 ====================

export async function fetchUserAuthorities(spaceId: string, digitalId: string): Promise<Authority[]> {
  const bq = `(digitalid,eq,${digitalId})`
  const doc = await xmlGet(`${apiBase}/s/${spaceId}/authorities/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`)
  return extractAuthorities(doc)
}

export async function fetchLoggedInUserAuthority(spaceId: string): Promise<Authority | null> {
  const bq = `(typeid,eq,5)`
  const doc = await xmlGet(`${apiBase}/s/${spaceId}/authorities/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`)
  const auths = extractAuthorities(doc)
  return auths.length > 0 ? auths[0] : null
}

export async function fetchAuthorityByTypeId(spaceId: string, typeId: number): Promise<Authority | null> {
  const bq = `(typeid,eq,${typeId})`
  const doc = await xmlGet(`${apiBase}/s/${spaceId}/authorities/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`)
  const auths = extractAuthorities(doc)
  return auths.length > 0 ? auths[0] : null
}

export async function fetchOrgAuthorities(spaceId: string, digitalId: string): Promise<Authority[]> {
  const doc = await xmlGet(`${apiBase}/s/${spaceId}/authorities/feed?digitalId=${encodeURIComponent(digitalId)}&forOrg=true&start=0&limit=-1`)
  return extractAuthorities(doc)
}

// ==================== 操作模板接口 ====================

export async function fetchItemActionGroups(spaceId: string, itemTypeId: number): Promise<ItemActionGroup[]> {
  const bq = `(itemtypeid,eq,${itemTypeId})`
  const doc = await xmlGet(`${apiBase}/s/${spaceId}/itemactiongroups/feed?start=0&limit=20&bq=${encodeURIComponent(bq)}`)

  const entries = doc.querySelectorAll('feed entry')
  const groups: ItemActionGroup[] = []

  entries.forEach((entry) => {
    const groupName = entry.querySelector('content itemActionGroup groupName')?.textContent
    const aclCoding = entry.querySelector('content itemActionGroup aclCoding')?.textContent
    const classOrInst = entry.querySelector('content itemActionGroup classOrInst')?.textContent

    if (groupName && aclCoding && classOrInst) {
      groups.push({
        groupName,
        aclCoding: parseInt(aclCoding),
        classOrInst: parseInt(classOrInst),
      })
    }
  })
  return groups
}

// ==================== 对象类权限接口 ====================

export async function fetchItemTypeAcls(spaceId: string, authId: string): Promise<ItemTypeAcl[]> {
  const bq = `(authorityid,eq,${authId})`
  const doc = await xmlGet(`${apiBase}/s/${spaceId}/itemtypeacls/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`)

  const entries = doc.querySelectorAll('feed entry')
  const acls: ItemTypeAcl[] = []

  entries.forEach((entry) => {
    const acl = entry.querySelector('content itemTypeAcl acl')?.textContent
    const itemTypeId = entry.querySelector('content itemTypeAcl itemTypeId')?.textContent
    const itemParentId = entry.querySelector('content itemTypeAcl itemParentId')?.textContent
    const itemTypeValue = entry.querySelector('content itemTypeAcl itemTypeValue')?.textContent

    if (acl) {
      acls.push({
        acl,
        itemTypeId: itemTypeId ? parseInt(itemTypeId) : undefined,
        itemParentId: itemParentId || undefined,
        itemTypeValue: itemTypeValue || undefined,
      })
    }
  })
  return acls
}

// ==================== 对象权限接口 ====================

export async function fetchItemAcls(spaceId: string, authId: string): Promise<ItemAcl[]> {
  const bq = `(authorityid,eq,${authId})`
  const doc = await xmlGet(`${apiBase}/s/${spaceId}/itemacls/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`)

  const entries = doc.querySelectorAll('feed entry')
  const acls: ItemAcl[] = []

  entries.forEach((entry) => {
    const acl = entry.querySelector('content itemAcl acl')?.textContent
    const itemTypeId = entry.querySelector('content itemAcl itemTypeId')?.textContent
    const itemId = entry.querySelector('content itemAcl itemId')?.textContent

    if (acl && itemTypeId && itemId) {
      acls.push({
        acl,
        itemTypeId: parseInt(itemTypeId),
        itemId,
      })
    }
  })
  return acls
}

// ==================== 对象名称接口 ====================

export async function fetchFormName(spaceId: string, formId: string): Promise<string> {
  try {
    const bq = `(id,eq,${formId})`
    const doc = await xmlGet(`${apiBase}/s/${spaceId}/forms/feed?start=0&limit=-1&bq=${encodeURIComponent(bq)}`)
    return doc.querySelector('feed entry content form')?.getAttribute('label') || formId
  } catch {
    return formId
  }
}

export async function fetchAppName(spaceId: string, appId: string): Promise<string> {
  try {
    const bq = `(id,eq,${appId})`
    const response = await authenticatedFetch(`${apiBase}/s/json/${spaceId}/apps/feed?bq=${encodeURIComponent(bq)}`)
    if (response.ok) {
      const json = await response.json()
      return json?.feed?.entry?.content?.app?.label || appId
    }
  } catch {
    // 忽略
  }
  return appId
}

export async function fetchAdhocProjectName(spaceId: string, projectId: string): Promise<string> {
  try {
    const bq = `(id,eq,${projectId})`
    const response = await authenticatedFetch(`${apiBase}/s/json/${spaceId}/adhocs/feed?bq=${encodeURIComponent(bq)}`)
    if (response.ok) {
      const json = await response.json()
      const entry = json?.feed?.entry || json?.entry
      return entry?.content?.adhocProject?.name || projectId
    }
  } catch {
    // 忽略
  }
  return projectId
}

export async function fetchWorkbookName(spaceId: string, workbookId: string): Promise<string> {
  try {
    const bq = `(id,eq,${workbookId})`
    const response = await authenticatedFetch(`${apiBase}/s/json/${spaceId}/workbooks/feed?bq=${encodeURIComponent(bq)}`)
    if (response.ok) {
      const json = await response.json()
      const entry = json?.feed?.entry || json?.entry
      return entry?.content?.workbook?.name || workbookId
    }
  } catch {
    // 忽略
  }
  return workbookId
}

export async function fetchSurveyName(spaceId: string, surveyId: string): Promise<string> {
  try {
    const bq = `(id,eq,${surveyId})`
    const doc = await xmlGet(`${apiBase}/s/${spaceId}/surveys/feed?start=0&limit=-1&bq=${encodeURIComponent(bq)}`)
    return doc.querySelector('feed entry content survey')?.getAttribute('label') || surveyId
  } catch {
    return surveyId
  }
}

// 根据对象类型获取名称
export async function fetchItemName(spaceId: string, itemTypeId: number, itemId: string): Promise<string> {
  switch (itemTypeId) {
    case 2: return fetchFormName(spaceId, itemId)
    case 15: return fetchAdhocProjectName(spaceId, itemId)
    case 16: return fetchWorkbookName(spaceId, itemId)
    case 17: return fetchAppName(spaceId, itemId)
    case 18: return fetchSurveyName(spaceId, itemId)
    default: return itemId
  }
}
