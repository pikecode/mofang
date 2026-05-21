import { useState, useCallback } from 'react'
import type { Authority, ItemTypeAcl, ItemAcl } from '@/types'
import {
  fetchUserAuthorities,
  fetchOrgAuthorities,
  fetchLoggedInUserAuthority,
  fetchSystemGroupAuthorities,
  fetchItemTypeAcls,
  fetchItemAcls,
  fetchItemActionGroups,
  fetchItemName,
  getSpaceId,
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
  authorities: Authority[]
  itemTypeAcls: Map<number, ItemTypeAcl[]>
  itemAcls: Map<string, ItemAclWithName[]>
  actionGroups: Map<number, { name: string; aclCoding: number }[]>
  itemPermissionGroups: ItemPermissionGroup[]
  error?: string
}

interface UsePermissionQueryReturn {
  summary: PermissionSummary | null
  loading: boolean
  error: string | null
  queryPermission: (digitalId: string) => Promise<void>
  spaceId: string
}

export function usePermissionQuery(): UsePermissionQueryReturn {
  const [summary, setSummary] = useState<PermissionSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [spaceId] = useState(() => {
    try {
      return getSpaceId()
    } catch (e) {
      return ''
    }
  })

  const queryPermission = useCallback(async (digitalId: string) => {
    if (!spaceId) {
      setError('缺少spaceId参数，请在URL中添加 ?spaceId=xxx')
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
      } catch (e) {
        // 忽略
      }

      // 1.4 系统保留组权限
      try {
        const systemAuths = await fetchSystemGroupAuthorities(spaceId)
        allAuthorities.push(...systemAuths)
      } catch (e) {
        // 忽略
      }

      if (allAuthorities.length === 0) {
        setSummary({
          digitalId,
          authorities: [],
          itemTypeAcls: new Map(),
          itemAcls: new Map(),
          actionGroups: new Map(),
          itemPermissionGroups: [],
          error: '未找到该用户的任何权限主体',
        })
        setLoading(false)
        return
      }

      // 2. 查询所有对象类权限（只查询有权限的对象类型）
      const itemTypeAcls = new Map<number, ItemTypeAcl[]>()
      const actionGroups = new Map<number, { name: string; aclCoding: number }[]>()

      // 先收集所有对象类权限（不区分类型），然后按类型分组
      const allItemTypeAcls = new Map<number, ItemTypeAcl[]>()

      for (const auth of allAuthorities) {
        try {
          const acls = await fetchItemTypeAcls(spaceId, auth.authId)
          // 按对象类型分组
          acls.forEach((acl) => {
            // 从itemParentId或itemTypeValue推断对象类型
            // 对象类权限的itemParentId通常是对象类型ID
            const itemTypeId = acl.itemTypeValue ? parseInt(acl.itemTypeValue) : 0
            if (!allItemTypeAcls.has(itemTypeId)) {
              allItemTypeAcls.set(itemTypeId, [])
            }
            const existing = allItemTypeAcls.get(itemTypeId)!
            const sameAcl = existing.find(
              (m) =>
                m.itemParentId === acl.itemParentId &&
                m.itemTypeValue === acl.itemTypeValue,
            )
            if (sameAcl) {
              sameAcl.acl = mergeAclStrings(sameAcl.acl, acl.acl)
            } else {
              existing.push({ ...acl })
            }
          })
        } catch (e) {
          // 忽略单个权限主体的错误
        }
      }

      // 只查询有权限的对象类型的操作组
      allItemTypeAcls.forEach((acls, itemTypeId) => {
        itemTypeAcls.set(itemTypeId, acls)
        try {
          fetchItemActionGroups(spaceId, itemTypeId).then((groups) => {
            actionGroups.set(
              itemTypeId,
              groups.map((g) => ({ name: g.groupName, aclCoding: g.aclCoding })),
            )
          })
        } catch (e) {
          // 忽略
        }
      })

      // 3. 查询所有对象权限并获取名称
      const itemAcls = new Map<string, ItemAclWithName[]>()
      const itemNamesCache = new Map<string, string>()

      for (const auth of allAuthorities) {
        try {
          const acls = await fetchItemAcls(spaceId, auth.authId)
          for (const acl of acls) {
            const key = `${acl.itemTypeId}:${acl.itemId}`

            // 获取对象名称（带缓存）
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
              const sameItem = existing.find(
                (e) => e.itemTypeId === acl.itemTypeId && e.itemId === acl.itemId,
              )
              if (sameItem) {
                sameItem.acl = mergeAclStrings(sameItem.acl, acl.acl)
              } else {
                existing.push(aclWithName)
              }
            } else {
              itemAcls.set(key, [aclWithName])
            }
          }
        } catch (e) {
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

      setSummary({
        digitalId,
        authorities: allAuthorities,
        itemTypeAcls,
        itemAcls,
        actionGroups,
        itemPermissionGroups,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询权限失败')
    } finally {
      setLoading(false)
    }
  }, [spaceId])

  return {
    summary,
    loading,
    error,
    queryPermission,
    spaceId,
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
