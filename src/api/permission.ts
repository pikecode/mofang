import type { Authority, ItemActionGroup, ItemTypeAcl, ItemAcl } from '@/types'
import { authenticatedFetch } from './auth'

// 从URL获取spaceId（或使用默认值）
const DEFAULT_SPACE_ID = 'a1c747bb-8dd2-4e1d-813e-d16416d989cf'

export function getSpaceId(): string {
  const urlParams = new URLSearchParams(window.location.search)
  const spaceId = urlParams.get('spaceId')
  return spaceId || DEFAULT_SPACE_ID
}

// 解析XML响应
function parseXMLResponse(xmlText: string): Document {
  // 检查返回的是否为HTML错误页面
  if (xmlText.trim().startsWith('<!DOCTYPE html>') || xmlText.trim().startsWith('<html')) {
    throw new Error('API返回HTML页面而非XML，请检查登录状态或API路径')
  }
  const parser = new DOMParser()
  return parser.parseFromString(xmlText, 'application/xml')
}

// 从XML提取权限主体列表
function extractAuthoritiesFromXML(doc: Document): Authority[] {
  const entries = doc.querySelectorAll('feed entry')
  const authorities: Authority[] = []

  entries.forEach((entry) => {
    const content = entry.querySelector('content')
    if (!content) return

    // 尝试多种可能的元素名（authority 或 authoriy）
    const authorityEl = content.querySelector('authority') || content.querySelector('authoriy')
    if (!authorityEl) return

    const typeId = authorityEl.querySelector('typeId')?.textContent
    const authId = authorityEl.querySelector('authId')?.textContent
    const parentId = authorityEl.querySelector('parentId')?.textContent
    const name = authorityEl.querySelector('name')?.textContent
    const description = authorityEl.querySelector('description')?.textContent

    if (typeId && authId) {
      authorities.push({
        typeId: parseInt(typeId),
        authId,
        parentId: parentId || undefined,
        name: name || description || undefined,
      })
    }
  })

  return authorities
}

// 查询用户和用户所在用户组权限主体
export async function fetchUserAuthorities(
  spaceId: string,
  digitalId: string,
): Promise<Authority[]> {
  const bq = `(digitalid,eq,${digitalId})`
  const url = `/magicflu/s/${spaceId}/authorities/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`

  const response = await authenticatedFetch(url)
  if (!response.ok) {
    throw new Error(`获取用户权限主体失败: ${response.status}`)
  }

  const xmlText = await response.text()
  const doc = parseXMLResponse(xmlText)
  return extractAuthoritiesFromXML(doc)
}

// 查询已登录用户组权限主体
export async function fetchLoggedInUserAuthority(spaceId: string): Promise<Authority | null> {
  const bq = `(typeid,eq,5)`
  const url = `/magicflu/s/${spaceId}/authorities/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`

  const response = await authenticatedFetch(url)
  if (!response.ok) {
    throw new Error(`获取已登录用户权限主体失败: ${response.status}`)
  }

  const xmlText = await response.text()
  const doc = parseXMLResponse(xmlText)
  const authorities = extractAuthoritiesFromXML(doc)
  return authorities.length > 0 ? authorities[0] : null
}

// 查询用户所在组织结构节点及用户组权限主体
export async function fetchOrgAuthorities(
  spaceId: string,
  digitalId: string,
): Promise<Authority[]> {
  const url = `/magicflu/s/${spaceId}/authorities/feed?digitalId=${encodeURIComponent(digitalId)}&forOrg=true&start=0&limit=-1`

  const response = await authenticatedFetch(url)
  if (!response.ok) {
    throw new Error(`获取组织结构权限主体失败: ${response.status}`)
  }

  const xmlText = await response.text()
  const doc = parseXMLResponse(xmlText)
  return extractAuthoritiesFromXML(doc)
}

// 查询系统保留组权限主体
export async function fetchSystemGroupAuthorities(spaceId: string): Promise<Authority[]> {
  const systemTypes = [4, 7, 9, 10] // 空间管理员、代管理员、审计员、流程管理员
  const authorities: Authority[] = []

  for (const typeId of systemTypes) {
    const bq = `(typeid,eq,${typeId})`
    const url = `/magicflu/s/${spaceId}/authorities/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`

    try {
      const response = await authenticatedFetch(url)
      if (response.ok) {
        const xmlText = await response.text()
        const doc = parseXMLResponse(xmlText)
        const typeAuthorities = extractAuthoritiesFromXML(doc)
        authorities.push(...typeAuthorities)
      }
    } catch {
      // 忽略单个失败的请求
    }
  }

  return authorities
}

// 查询对象类/对象权限模板
export async function fetchItemActionGroups(
  spaceId: string,
  itemTypeId: number,
): Promise<ItemActionGroup[]> {
  const bq = `(itemtypeid,eq,${itemTypeId})`
  const url = `/magicflu/s/${spaceId}/itemactiongroups/feed?start=0&limit=20&bq=${encodeURIComponent(bq)}`

  const response = await authenticatedFetch(url)
  if (!response.ok) {
    throw new Error(`获取操作模板失败: ${response.status}`)
  }

  const xmlText = await response.text()
  const doc = parseXMLResponse(xmlText)
  const entries = doc.querySelectorAll('entry')

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

// 查询对象类权限设置
export async function fetchItemTypeAcls(
  spaceId: string,
  authId: string,
): Promise<ItemTypeAcl[]> {
  const bq = `(authorityid,eq,${authId})`
  const url = `/magicflu/s/${spaceId}/itemtypeacls/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`

  const response = await authenticatedFetch(url)
  if (!response.ok) {
    throw new Error(`获取对象类权限失败: ${response.status}`)
  }

  const xmlText = await response.text()
  const doc = parseXMLResponse(xmlText)
  const entries = doc.querySelectorAll('feed entry')

  const acls: ItemTypeAcl[] = []
  entries.forEach((entry) => {
    const acl = entry.querySelector('content itemTypeAcl acl')?.textContent
    const itemParentId = entry.querySelector('content itemTypeAcl itemParentId')?.textContent
    const itemTypeValue = entry.querySelector('content itemTypeAcl itemTypeValue')?.textContent

    if (acl) {
      acls.push({
        acl,
        itemParentId: itemParentId || undefined,
        itemTypeValue: itemTypeValue || undefined,
      })
    }
  })

  return acls
}

// 查询对象权限设置
export async function fetchItemAcls(
  spaceId: string,
  authId: string,
): Promise<ItemAcl[]> {
  const bq = `(authorityid,eq,${authId})`
  const url = `/magicflu/s/${spaceId}/itemacls/feed?bq=${encodeURIComponent(bq)}&start=0&limit=-1`

  const response = await authenticatedFetch(url)
  if (!response.ok) {
    throw new Error(`获取对象权限失败: ${response.status}`)
  }

  const xmlText = await response.text()
  const doc = parseXMLResponse(xmlText)
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

// 查询表单名称
export async function fetchFormName(spaceId: string, formId: string): Promise<string> {
  const bq = `(id,eq,${formId})`
  const url = `/magicflu/s/${spaceId}/forms/feed?start=0&limit=-1&bq=${encodeURIComponent(bq)}`

  try {
    const response = await authenticatedFetch(url)
    if (response.ok) {
      const xmlText = await response.text()
      const doc = parseXMLResponse(xmlText)
      const label = doc.querySelector('feed entry content form')?.getAttribute('label')
      return label || formId
    }
  } catch {
    // 忽略失败
  }
  return formId
}

// 查询导航树名称
export async function fetchAppName(spaceId: string, appId: string): Promise<string> {
  const bq = `(id,eq,${appId})`
  const url = `/magicflu/s/json/${spaceId}/apps/feed?bq=${encodeURIComponent(bq)}`

  try {
    const response = await authenticatedFetch(url)
    if (response.ok) {
      const json = await response.json()
      return json?.feed?.entry?.content?.app?.label || appId
    }
  } catch {
    // 忽略失败
  }
  return appId
}

// 查询分析项目名称
export async function fetchAdhocProjectName(spaceId: string, projectId: string): Promise<string> {
  const bq = `(id,eq,${projectId})`
  const url = `/magicflu/s/json/${spaceId}/adhocs/feed?bq=${encodeURIComponent(bq)}`

  try {
    const response = await authenticatedFetch(url)
    if (response.ok) {
      const json = await response.json()
      return json?.entry?.content?.adhocProject?.name || projectId
    }
  } catch {
    // 忽略失败
  }
  return projectId
}

// 查询分析工作簿名称
export async function fetchWorkbookName(spaceId: string, workbookId: string): Promise<string> {
  const bq = `(id,eq,${workbookId})`
  const url = `/magicflu/s/json/${spaceId}/workbooks/feed?bq=${encodeURIComponent(bq)}`

  try {
    const response = await authenticatedFetch(url)
    if (response.ok) {
      const json = await response.json()
      return json?.entry?.content?.workbook?.name || workbookId
    }
  } catch {
    // 忽略失败
  }
  return workbookId
}

// 查询问卷名称
export async function fetchSurveyName(spaceId: string, surveyId: string): Promise<string> {
  const bq = `(id,eq,${surveyId})`
  const url = `/magicflu/s/${spaceId}/surveys/feed?start=0&limit=-1&bq=${encodeURIComponent(bq)}`

  try {
    const response = await authenticatedFetch(url)
    if (response.ok) {
      const xmlText = await response.text()
      const doc = parseXMLResponse(xmlText)
      const label = doc.querySelector('feed entry content survey')?.getAttribute('label')
      return label || surveyId
    }
  } catch {
    // 忽略失败
  }
  return surveyId
}

// 根据对象类型和ID获取名称
export async function fetchItemName(
  spaceId: string,
  itemTypeId: number,
  itemId: string,
): Promise<string> {
  switch (itemTypeId) {
    case 2:
      return await fetchFormName(spaceId, itemId)
    case 15:
      return await fetchAdhocProjectName(spaceId, itemId)
    case 16:
      return await fetchWorkbookName(spaceId, itemId)
    case 17:
      return await fetchAppName(spaceId, itemId)
    case 18:
      return await fetchSurveyName(spaceId, itemId)
    default:
      return itemId
  }
}
