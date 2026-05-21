import { useState, useCallback } from 'react'
import type { Authority, ItemTypeAcl, ItemAcl } from '@/types'
import {
  fetchUserAuthorities,
  fetchOrgAuthorities,
  fetchLoggedInUserAuthority,
  fetchSystemGroupAuthorities,
  fetchAuthorityByTypeId,
  fetchItemTypeAcls,
  fetchItemAcls,
  fetchItemActionGroups,
  fetchItemName,
} from '@/api/permission'
import { AUTH_TYPE_MAP, ITEM_TYPE_MAP } from '@/types'

// 带名称的对象权限
export interface ItemAclWithName extends ItemAcl {
  itemName?: string
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
  }[]
}

interface PermissionSummary {
  digitalId: string
  spaceId: string
  authorities: Authority[]
  itemTypeAcls: Map<number, ItemTypeAcl[]>
  itemAcls: Map<string, ItemAclWithName[]>
  actionGroups: Map<number, { name: string; aclCoding: number }[]>
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
      const allAuthorities: Authority[] = []

      // 1.1 直接用户权限
      try {
        const userAuths = await fetchUserAuthorities(spaceId, digitalId)
        allAuthorities.push(...userAuths)
      } catch (e) {
        // 用户可能没有直接权限，忽略错误
      }

      // 1.2 组织结构节点权限
      try {
        const orgAuths = await fetchOrgAuthorities(spaceId, digitalId)
        allAuthorities.push(...orgAuths)
      } catch (e) {
        // 用户可能不在组织结构中，忽略错误
      }

      // 1.3 已登录用户权限
      try {
        const loggedInAuth = await fetchLoggedInUserAuthority(spaceId)
        if (loggedInAuth) {
          allAuthorities.push(loggedInAuth)
        }
      } catch {
        // 忽略
      }

      // 1.4 未登录用户权限(typeId=3)
      try {
        const anonAuth = await fetchAuthorityByTypeId(spaceId, 3)
        if (anonAuth) {
          allAuthorities.push(anonAuth)
        }
      } catch {
        // 忽略
      }

      // 1.5 创建人权限(typeId=6)
      try {
        const creatorAuth = await fetchAuthorityByTypeId(spaceId, 6)
        if (creatorAuth) {
          allAuthorities.push(creatorAuth)
        }
      } catch {
        // 忽略
      }

      // 1.6 系统保留组权限
      try {
        const systemAuths = await fetchSystemGroupAuthorities(spaceId)
        allAuthorities.push(...systemAuths)
      } catch (e) {
        // 忽略
      }

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
          error: '未找到该用户的任何权限主体',
        })
        setLoading(false)
        return
      }

      // 2. 查询所有对象类权限（只查询有权限的对象类型）
      const allItemTypeAcls = new Map<number, ItemTypeAcl[]>()

      for (const auth of allAuthorities) {
        try {
          const acls = await fetchItemTypeAcls(spaceId, auth.authId)
          acls.forEach((acl) => {
            const itemTypeId = acl.itemTypeValue ? parseInt(acl.itemTypeValue) : 0
            const existing = allItemTypeAcls.get(itemTypeId) || []
            const merged = existing.find(
              (m) =>
                m.itemParentId === acl.itemParentId &&
                m.itemTypeValue === acl.itemTypeValue,
            )
            if (merged) {
              existing.push({ ...merged, acl: mergeAclStrings(merged.acl, acl.acl) })
              const idx = existing.indexOf(merged)
              existing.splice(idx, 1)
            } else {
              existing.push({ ...acl })
            }
            allItemTypeAcls.set(itemTypeId, existing)
          })
        } catch {
          // 忽略单个权限主体的错误
        }
      }

      // 用 await 查询所有操作组（避免竞态）
      const actionGroupEntries = await Promise.all(
        Array.from(allItemTypeAcls.keys()).map(async (itemTypeId) => {
          try {
            const groups = await fetchItemActionGroups(spaceId, itemTypeId)
            return [itemTypeId, groups.map((g) => ({ name: g.groupName, aclCoding: g.aclCoding }))] as const
          } catch {
            return [itemTypeId, [] as { name: string; aclCoding: number }[]] as const
          }
        }),
      )
      const actionGroups = new Map(actionGroupEntries)
      const itemTypeAcls = new Map(allItemTypeAcls)

      // 3. 查询所有对象权限并获取名称
      const itemAcls = new Map<string, ItemAclWithName[]>()
      const itemNamesCache = new Map<string, string>()

      for (const auth of allAuthorities) {
        try {
          const acls = await fetchItemAcls(spaceId, auth.authId)
          for (const acl of acls) {
            const key = `${acl.itemTypeId}:${acl.itemId}`

            const cacheKey = `${acl.itemTypeId}:${acl.itemId}`
            if (!itemNamesCache.has(cacheKey)) {
              try {
                const name = await fetchItemName(spaceId, acl.itemTypeId, acl.itemId)
                itemNamesCache.set(cacheKey, name)
              } catch {
                itemNamesCache.set(cacheKey, acl.itemId)
              }
            }

            const aclWithName: ItemAclWithName = {
              ...acl,
              itemName: itemNamesCache.get(cacheKey),
            }

            const existing = itemAcls.get(key)
            if (existing) {
              const merged = existing.find(
                (e) => e.itemTypeId === acl.itemTypeId && e.itemId === acl.itemId,
              )
              if (merged) {
                existing.push({
                  ...merged,
                  acl: mergeAclStrings(merged.acl, acl.acl),
                })
                existing.splice(existing.indexOf(merged), 1)
              } else {
                existing.push(aclWithName)
              }
            } else {
              itemAcls.set(key, [aclWithName])
            }
          }
        } catch {
          // 忽略
        }
      }

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
        const actionGroupList = actionGroups.get(itemTypeId) || []
        const group: ItemPermissionGroup = {
          itemTypeId,
          itemTypeName: getItemTypeName(itemTypeId),
          items: [],
        }

        itemsMap.forEach((acls, itemId) => {
          // 合并所有权限主体的ACL
          const mergedAcl = acls.reduce((acc, acl) => mergeAclStrings(acc, acl.acl), '')
          const permissions = parseAclPermissions(mergedAcl, actionGroupList)

          group.items.push({
            itemId,
            itemName: acls[0]?.itemName || itemId,
            acl: mergedAcl,
            permissions,
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
  actionGroups: { name: string; aclCoding: number }[],
): string[] {
  const permissions: string[] = []
  actionGroups.forEach((group) => {
    if (acl[group.aclCoding] === '1') {
      permissions.push(group.name)
    }
  })
  return permissions
}
