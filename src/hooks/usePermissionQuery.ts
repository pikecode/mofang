import { useState, useCallback } from 'react'
import type { Authority, ItemAcl } from '@/types'
import {
  fetchUserAuthorities,
  fetchOrgAuthorities,
  fetchLoggedInUserAuthority,
  fetchItemTypeAcls,
  fetchItemAcls,
  fetchItemActionGroups,
  fetchItemName,
} from '@/api/permission'
import { AUTH_TYPE_MAP, ITEM_TYPE_MAP } from '@/types'

// 带名称的对象权限
export interface ItemAclWithName extends ItemAcl {
  itemName?: string
  authorityIds?: string[]
}

// 对象权限分组
export interface ItemPermissionGroup {
  itemTypeId: number
  itemTypeName: string
  items: {
    itemId: string
    itemName: string
    acl: string
    permissions: string[]
    authorityIds?: string[]
  }[]
}

// 带来源主体的对象类权限
export interface ItemTypeAclWithAuthority {
  acl: string
  itemTypeId: number
  itemParentId?: string
  itemParentName?: string
  itemTypeValue?: string
  itemTypeValueName?: string
  authorityIds?: string[]
}

interface ActionGroupSummary {
  name: string
  aclCoding: number
  classOrInst: number
}

interface PermissionSummary {
  digitalId: string
  spaceId: string
  authorities: Authority[]
  itemTypeAcls: Map<number, ItemTypeAclWithAuthority[]>
  itemAcls: Map<string, ItemAclWithName[]>
  actionGroups: Map<number, ActionGroupSummary[]>
  itemPermissionGroups: ItemPermissionGroup[]
  stats: {
    authorityCount: number
    itemPermissionCount: number
    itemTypePermissionCount: number
  }
  error?: string
}

interface UsePermissionQueryReturn {
  summary: PermissionSummary | null
  loading: boolean
  error: string | null
  queryPermission: (spaceId: string, digitalId: string) => Promise<void>
}

export function usePermissionQuery(): UsePermissionQueryReturn {
  const [summary, setSummary] = useState<PermissionSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const queryPermission = useCallback(async (spaceId: string, digitalId: string) => {
    if (!spaceId.trim()) {
      setError('请输入空间ID (spaceId)')
      return
    }
    if (!digitalId.trim()) {
      setError('请输入用户登录账号')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1. 收集所有权限主体
      const loadWarnings: string[] = []
      const authorityMap = new Map<string, Authority>()
      const addAuthorities = (items: Authority[]) => {
        items.forEach((auth) => {
          if (!authorityMap.has(auth.authId)) {
            authorityMap.set(auth.authId, auth)
          }
        })
      }

      // 1.1 直接用户权限
      try {
        const userAuths = await fetchUserAuthorities(spaceId, digitalId)
        addAuthorities(userAuths)
      } catch (e) {
        loadWarnings.push(`用户及用户组权限主体加载失败：${getErrorMessage(e)}`)
      }

      // 1.2 组织结构节点权限
      try {
        const orgAuths = await fetchOrgAuthorities(spaceId, digitalId)
        addAuthorities(orgAuths)
      } catch (e) {
        loadWarnings.push(`组织结构权限主体加载失败：${getErrorMessage(e)}`)
      }

      // 1.3 已登录用户权限。未登录用户、创建人、管理员类角色不能无条件并入目标用户。
      try {
        const loggedInAuth = await fetchLoggedInUserAuthority(spaceId)
        if (loggedInAuth) {
          addAuthorities([loggedInAuth])
        }
      } catch (e) {
        loadWarnings.push(`已登录用户权限主体加载失败：${getErrorMessage(e)}`)
      }

      const allAuthorities = Array.from(authorityMap.values())

      if (allAuthorities.length === 0) {
        setSummary({
          spaceId,
          digitalId,
          authorities: [],
          itemTypeAcls: new Map(),
          itemAcls: new Map(),
          actionGroups: new Map(),
          itemPermissionGroups: [],
          stats: { authorityCount: 0, itemPermissionCount: 0, itemTypePermissionCount: 0 },
          error: loadWarnings.length > 0 ? loadWarnings.join('；') : '未找到该用户的任何权限主体',
        })
        setLoading(false)
        return
      }

      // 2. 查询所有对象类权限
      const allItemTypeAcls = new Map<number, ItemTypeAclWithAuthority[]>()
      const itemTypeAclNamesCache = new Map<string, string>()

      await Promise.all(
        allAuthorities.map(async (auth) => {
          try {
          const acls = await fetchItemTypeAcls(spaceId, auth.authId)
          for (const acl of acls) {
            const itemTypeId = acl.itemTypeId
            if (itemTypeId === undefined || Number.isNaN(itemTypeId)) {
              loadWarnings.push(`主体 ${getAuthorityDisplayName(auth)} 存在无法识别对象类型的对象类权限`)
              continue
            }

            // 获取父对象名称（尝试作为表单获取）
            let itemParentName: string | undefined
            if (acl.itemParentId) {
              const cacheKey = `parent:${acl.itemParentId}`
              if (!itemTypeAclNamesCache.has(cacheKey)) {
                try {
                  const name = await fetchItemName(spaceId, 2, acl.itemParentId)
                  itemTypeAclNamesCache.set(cacheKey, name)
                } catch {
                  itemTypeAclNamesCache.set(cacheKey, acl.itemParentId)
                }
              }
              const cached = itemTypeAclNamesCache.get(cacheKey)
              if (cached && cached !== acl.itemParentId) {
                itemParentName = cached
              }
            }

            // 获取值对象名称（如果是ID格式则尝试获取）
            let itemTypeValueName: string | undefined
            if (acl.itemTypeValue && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(acl.itemTypeValue)) {
              const cacheKey = `value:${acl.itemTypeValue}`
              if (!itemTypeAclNamesCache.has(cacheKey)) {
                try {
                  const name = await fetchItemName(spaceId, itemTypeId, acl.itemTypeValue)
                  itemTypeAclNamesCache.set(cacheKey, name)
                } catch {
                  itemTypeAclNamesCache.set(cacheKey, acl.itemTypeValue)
                }
              }
              const cached = itemTypeAclNamesCache.get(cacheKey)
              if (cached && cached !== acl.itemTypeValue) {
                itemTypeValueName = cached
              }
            }

            const existing = allItemTypeAcls.get(itemTypeId) || []
            const merged = existing.find(
              (m) =>
                m.itemParentId === acl.itemParentId &&
                m.itemTypeValue === acl.itemTypeValue,
            )
            if (merged) {
              const idx = existing.indexOf(merged)
              const updated = {
                ...merged,
                acl: mergeAclStrings(merged.acl, acl.acl),
                authorityIds: [...(merged.authorityIds || []), auth.authId],
              }
              existing.splice(idx, 1, updated)
            } else {
              existing.push({
                ...acl,
                itemTypeId,
                itemParentName,
                itemTypeValueName,
                authorityIds: [auth.authId],
              })
            }
            allItemTypeAcls.set(itemTypeId, existing)
          }
          } catch {
            loadWarnings.push(`主体 ${getAuthorityDisplayName(auth)} 的对象类权限加载失败`)
          }
        }),
      )

      // 3. 查询所有对象权限并获取名称
      const itemAcls = new Map<string, ItemAclWithName[]>()
      const itemNamesCache = new Map<string, string>()
      const itemNamePromises = new Map<string, Promise<string>>()

      await Promise.all(
        allAuthorities.map(async (auth) => {
          try {
          const acls = await fetchItemAcls(spaceId, auth.authId)
          for (const acl of acls) {
            const key = `${acl.itemTypeId}:${acl.itemId}`

            const cacheKey = `${acl.itemTypeId}:${acl.itemId}`
            if (!itemNamesCache.has(cacheKey)) {
              if (!itemNamePromises.has(cacheKey)) {
                itemNamePromises.set(
                  cacheKey,
                  fetchItemName(spaceId, acl.itemTypeId, acl.itemId).catch(() => acl.itemId),
                )
              }
              itemNamesCache.set(cacheKey, await itemNamePromises.get(cacheKey)!)
            }

            const aclWithName: ItemAclWithName = {
              ...acl,
              itemName: itemNamesCache.get(cacheKey),
              authorityIds: [auth.authId],
            }

            const existing = itemAcls.get(key)
            if (existing) {
              const merged = existing.find(
                (e) => e.itemTypeId === acl.itemTypeId && e.itemId === acl.itemId,
              )
              if (merged) {
                existing.splice(existing.indexOf(merged), 1, {
                  ...merged,
                  acl: mergeAclStrings(merged.acl, acl.acl),
                  authorityIds: [...(merged.authorityIds || []), auth.authId],
                })
              } else {
                existing.push(aclWithName)
              }
            } else {
              itemAcls.set(key, [aclWithName])
            }
          }
          } catch {
            loadWarnings.push(`主体 ${getAuthorityDisplayName(auth)} 的对象权限加载失败`)
          }
        }),
      )

      const itemTypeIds = new Set<number>([
        ...Array.from(allItemTypeAcls.keys()),
        ...Array.from(itemAcls.values()).flatMap((acls) => acls.map((acl) => acl.itemTypeId)),
      ])

      const actionGroupEntries = await Promise.all(
        Array.from(itemTypeIds).map(async (itemTypeId) => {
          try {
            const groups = await fetchItemActionGroups(spaceId, itemTypeId)
            return [
              itemTypeId,
              groups.map((g) => ({
                name: g.groupName,
                aclCoding: g.aclCoding,
                classOrInst: g.classOrInst,
              })),
            ] as const
          } catch {
            loadWarnings.push(`${getItemTypeName(itemTypeId)} 的操作模板加载失败`)
            return [itemTypeId, [] as ActionGroupSummary[]] as const
          }
        }),
      )
      const actionGroups = new Map(actionGroupEntries)
      const itemTypeAcls = new Map(allItemTypeAcls)

      // 4. 构建对象权限分组（带权限名称解析）
      const itemPermissionGroups: ItemPermissionGroup[] = []
      const groupedByType = new Map<number, Map<string, ItemAclWithName[]>>()

      // 按对象类型分组
      itemAcls.forEach((acls) => {
        acls.forEach((acl) => {
          if (!groupedByType.has(acl.itemTypeId)) {
            groupedByType.set(acl.itemTypeId, new Map())
          }
          const typeMap = groupedByType.get(acl.itemTypeId)!
          if (!typeMap.has(acl.itemId)) {
            typeMap.set(acl.itemId, [])
          }
          typeMap.get(acl.itemId)!.push(acl)
        })
      })

      // 构建分组结构
      groupedByType.forEach((itemsMap, itemTypeId) => {
        const actionGroupList = getActionGroupsByScope(actionGroups, itemTypeId, 1)
        const group: ItemPermissionGroup = {
          itemTypeId,
          itemTypeName: getItemTypeName(itemTypeId),
          items: [],
        }

        itemsMap.forEach((acls, itemId) => {
          // 合并所有权限主体的ACL
          const mergedAcl = acls.reduce((acc, acl) => mergeAclStrings(acc, acl.acl), '')
          const permissions = parseAclPermissions(mergedAcl, actionGroupList)
          const allAuthorityIds = acls.flatMap((a) => a.authorityIds || [])

          group.items.push({
            itemId,
            itemName: acls[0]?.itemName || itemId,
            acl: mergedAcl,
            permissions,
            authorityIds: [...new Set(allAuthorityIds)],
          })
        })

        if (group.items.length > 0) {
          itemPermissionGroups.push(group)
        }
      })

      // 按对象类型ID排序
      itemPermissionGroups.sort((a, b) => a.itemTypeId - b.itemTypeId)

      // 计算统计
      let itemPermissionCount = 0
      itemPermissionGroups.forEach((g) => { itemPermissionCount += g.items.length })
      const itemTypePermissionCount = Array.from(allItemTypeAcls.values()).reduce((sum, acls) => sum + acls.length, 0)

      setSummary({
        spaceId,
        digitalId,
        authorities: allAuthorities,
        itemTypeAcls,
        itemAcls,
        actionGroups,
        itemPermissionGroups,
        stats: {
          authorityCount: allAuthorities.length,
          itemPermissionCount,
          itemTypePermissionCount,
        },
        error: loadWarnings.length > 0 ? loadWarnings.join('；') : undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询权限失败')
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    summary,
    loading,
    error,
    queryPermission,
  }
}

// 合并两个ACL字符串（按位或操作）
function mergeAclStrings(acl1: string, acl2: string): string {
  const maxLen = Math.max(acl1.length, acl2.length)
  let result = ''
  for (let i = 0; i < maxLen; i++) {
    const bit1 = acl1[i] === '1' ? 1 : 0
    const bit2 = acl2[i] === '1' ? 1 : 0
    result += bit1 | bit2
  }
  return result
}

// 获取权限主体类型名称
export function getAuthorityTypeName(typeId: number): string {
  return AUTH_TYPE_MAP[typeId] || `类型${typeId}`
}

// 获取对象类型名称
export function getItemTypeName(itemTypeId: number): string {
  return ITEM_TYPE_MAP[itemTypeId] || `类型${itemTypeId}`
}

// 解析ACL权限位
export function parseAclPermissions(
  acl: string,
  actionGroups: { name: string; aclCoding: number; classOrInst?: number }[],
): string[] {
  const permissions: string[] = []
  actionGroups.forEach((group) => {
    // aclCoding 是类似 10000000 的数字，找到 '1' 的位置
    const aclCodingStr = String(group.aclCoding)
    const bitIndex = aclCodingStr.indexOf('1')
    if (bitIndex >= 0 && bitIndex < acl.length && acl[bitIndex] === '1') {
      permissions.push(group.name)
    }
  })
  return permissions
}

// classOrInst: 0 = 类级权限（对某种类型下所有对象生效）, 1 = 实例级权限（对具体某个对象生效）
export function getActionGroupsByScope(
  actionGroups: Map<number, ActionGroupSummary[]>,
  itemTypeId: number,
  classOrInst: number,
): ActionGroupSummary[] {
  return (actionGroups.get(itemTypeId) || []).filter((group) => group.classOrInst === classOrInst)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

function getAuthorityDisplayName(auth: Authority): string {
  return auth.name?.trim() || `${getAuthorityTypeName(auth.typeId)}(${auth.authId})`
}
