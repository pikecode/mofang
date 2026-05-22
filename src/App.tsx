import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getSpaceId } from '@/api/permission'
import {
  usePermissionQuery,
  getActionGroupsByScope,
  getAuthorityTypeName,
  getItemTypeName,
  parseAclPermissions,
} from '@/hooks/usePermissionQuery'
import { Loader2, Search, Settings, Users, Shield } from 'lucide-react'

const PAGE_SIZE = 20

// 统一权限行数据
interface UnifiedPermissionRow {
  id: string
  objectType: string
  objectTypeId: number
  scope: 'class' | 'instance'
  objectName: string
  objectId?: string
  parentName?: string
  parentId?: string
  permissions: string[]
  authorityNames: string[]
  authorityIds: string[]
}

function App() {
  const [spaceId, setSpaceId] = useState(() => getSpaceId())
  const [digitalId, setDigitalId] = useState('')
  const [page, setPage] = useState(1)

  // 筛选状态
  const [filterObjType, setFilterObjType] = useState('')
  const [filterPermission, setFilterPermission] = useState('')
  const [filterAuthType, setFilterAuthType] = useState('')
  const [search, setSearch] = useState('')

  const { summary, loading, error, queryPermission } = usePermissionQuery()

  // 构建统一权限列表：一个对象一行，不按操作展开
  const unifiedRows = useMemo<UnifiedPermissionRow[]>(() => {
    if (!summary) return []

    const rows: UnifiedPermissionRow[] = []
    let rowId = 0

    // 1. 处理对象类权限（每条ACL一行）
    summary.itemTypeAcls.forEach((acls, itemTypeId) => {
      const actionGroups = getActionGroupsByScope(summary.actionGroups, itemTypeId, 0)
      acls.forEach((acl) => {
        const permissions = parseAclPermissions(acl.acl, actionGroups)
        const authNames = (acl.authorityIds || [])
          .map((id) => summary.authorities.find((a) => a.authId === id)?.name || id)

        rows.push({
          id: `class-${rowId++}`,
          objectType: getItemTypeName(itemTypeId),
          objectTypeId: itemTypeId,
          scope: 'class',
          objectName: acl.itemParentName || acl.itemTypeValueName || acl.itemParentId || acl.itemTypeValue || '全部',
          objectId: acl.itemTypeValue,
          parentName: acl.itemParentName,
          parentId: acl.itemParentId,
          permissions,
          authorityNames: authNames,
          authorityIds: acl.authorityIds || [],
        })
      })
    })

    // 2. 处理实例级权限（每个对象一行）
    summary.itemPermissionGroups.forEach((group) => {
      const actionGroups = getActionGroupsByScope(summary.actionGroups, group.itemTypeId, 1)
      group.items.forEach((item) => {
        const permissions = parseAclPermissions(item.acl, actionGroups)
        const authNames = (item.authorityIds || [])
          .map((id) => summary.authorities.find((a) => a.authId === id)?.name || id)

        rows.push({
          id: `inst-${rowId++}`,
          objectType: group.itemTypeName,
          objectTypeId: group.itemTypeId,
          scope: 'instance',
          objectName: item.itemName || item.itemId,
          objectId: item.itemId,
          permissions,
          authorityNames: authNames,
          authorityIds: item.authorityIds || [],
        })
      })
    })

    return rows
  }, [summary])

  // 筛选后的数据
  const filteredRows = useMemo(() => {
    return unifiedRows.filter((row) => {
      if (filterObjType && row.objectTypeId.toString() !== filterObjType) return false
      if (filterPermission && !row.permissions.includes(filterPermission)) return false
      if (filterAuthType && !row.authorityIds.some((id) => summary?.authorities.find((a) => a.authId === id)?.typeId.toString() === filterAuthType)) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          row.objectName.toLowerCase().includes(q) ||
          row.objectId?.toLowerCase().includes(q) ||
          row.parentName?.toLowerCase().includes(q) ||
          row.authorityNames.some((n) => n.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [unifiedRows, filterObjType, filterPermission, filterAuthType, search, summary])

  // 分页
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE)
  const pagedData = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // 统计数据
  const stats = useMemo(() => {
    if (!summary) return { objectCount: 0, permissionCount: 0, authorityCount: 0 }

    // 对象总数 = 不重复的对象数
    const objectIds = new Set<string>()
    summary.itemTypeAcls.forEach((acls) => {
      acls.forEach((acl) => {
        objectIds.add(`${acl.itemTypeId}:${acl.itemParentId || ''}:${acl.itemTypeValue || ''}`)
      })
    })
    summary.itemPermissionGroups.forEach((g) => {
      g.items.forEach((item) => {
        objectIds.add(`${g.itemTypeId}:${item.itemId}`)
      })
    })

    // 权限总数 = 所有权限操作总数（展开后）
    let permissionTotal = 0
    summary.itemTypeAcls.forEach((acls, itemTypeId) => {
      const actionGroups = getActionGroupsByScope(summary.actionGroups, itemTypeId, 0)
      acls.forEach((acl) => {
        permissionTotal += parseAclPermissions(acl.acl, actionGroups).length
      })
    })
    summary.itemPermissionGroups.forEach((group) => {
      const actionGroups = getActionGroupsByScope(summary.actionGroups, group.itemTypeId, 1)
      group.items.forEach((item) => {
        permissionTotal += parseAclPermissions(item.acl, actionGroups).length
      })
    })

    return {
      objectCount: objectIds.size,
      permissionCount: permissionTotal,
      authorityCount: summary.authorities.length,
    }
  }, [summary])

  // 筛选选项
  const objTypeOptions = useMemo(() => {
    if (!summary) return []
    const typeIds = new Set<number>()
    summary.itemTypeAcls.forEach((_, id) => typeIds.add(id))
    summary.itemPermissionGroups.forEach((g) => typeIds.add(g.itemTypeId))
    return Array.from(typeIds).map((id) => ({ id, name: getItemTypeName(id) }))
  }, [summary])

  const permissionOptions = useMemo(() => {
    const names = new Set<string>()
    unifiedRows.forEach((r) => r.permissions.forEach((p) => names.add(p)))
    return Array.from(names)
  }, [unifiedRows])

  const authTypeOptions = useMemo(() => {
    if (!summary) return []
    return [...new Set(summary.authorities.map((a) => a.typeId))].map((id) => ({ id, name: getAuthorityTypeName(id) }))
  }, [summary])

  const handleQuery = () => {
    if (spaceId.trim() && digitalId.trim()) {
      queryPermission(spaceId.trim(), digitalId.trim())
      setPage(1)
    }
  }

  const handleReset = () => {
    setFilterObjType('')
    setFilterPermission('')
    setFilterAuthType('')
    setSearch('')
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航栏 */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              魔
            </div>
            <span className="text-lg font-semibold tracking-tight">魔方网表 · RBAC 权限查看器</span>
          </div>
          <div className="flex items-center gap-4">
            {summary && (
              <>
                <span className="text-sm text-muted-foreground">空间ID: <span className="font-mono">{summary.spaceId}</span></span>
                <span className="text-sm text-muted-foreground">查询账号: <span className="font-mono text-foreground">{summary.digitalId}</span></span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        {/* 搜索栏 */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1.5 block text-sm font-medium">登录账号 (digitalId)</label>
              <Input
                placeholder="请输入用户登录账号"
                value={digitalId}
                onChange={(e) => setDigitalId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1.5 block text-sm font-medium">空间 ID (spaceId)</label>
              <Input
                placeholder="请输入空间ID"
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleQuery} disabled={loading || !spaceId.trim() || !digitalId.trim()} className="h-9 px-6">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                查询
              </Button>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 空白引导状态 */}
        {!summary && !loading && !error && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Shield className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-lg font-semibold mb-2">RBAC 权限查看器</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              输入用户的登录账号和空间ID，查询该用户在指定空间内的所有权限配置。
            </p>
          </div>
        )}

        {summary && (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">对象总数</div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                    <Shield className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-bold">{stats.objectCount}</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">权限总数</div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <Settings className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-bold">{stats.permissionCount}</div>
                <div className="text-xs text-muted-foreground">对象权限条目总数</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">来源主体数</div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-bold">{stats.authorityCount}</div>
              </div>
            </div>

            {/* 筛选栏 */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
              <span className="text-sm font-medium">筛选：</span>
              <select
                value={filterObjType}
                onChange={(e) => { setFilterObjType(e.target.value); setPage(1) }}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">全部对象类型</option>
                {objTypeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
              <select
                value={filterPermission}
                onChange={(e) => { setFilterPermission(e.target.value); setPage(1) }}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">全部权限</option>
                {permissionOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <select
                value={filterAuthType}
                onChange={(e) => { setFilterAuthType(e.target.value); setPage(1) }}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">全部来源类型</option>
                {authTypeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
              <Input
                placeholder="搜索对象名 / id / 父对象"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="h-9 w-64"
              />
              <Button variant="ghost" size="sm" onClick={handleReset}>重置</Button>
            </div>

            {/* 主内容区：左侧列表 + 右侧卡片 */}
            <div className="grid grid-cols-[1fr_340px] gap-5">
              {/* 左侧：权限列表 */}
              <div className="rounded-lg border bg-card">
                <div className="border-b px-4 py-3 text-sm text-muted-foreground flex justify-between items-center">
                  <span>权限视图：命中 {filteredRows.length} 行</span>
                  <span className="text-xs">每行 = 一个对象及其所有被授予的操作</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">对象类型</TableHead>
                      <TableHead>对象名称</TableHead>
                      <TableHead className="w-64">权限</TableHead>
                      <TableHead className="w-40">来源主体</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          没有权限数据
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {row.scope === 'class' ? '类级' : '实例'}
                            </Badge>
                            <div className="text-xs text-muted-foreground mt-1">{row.objectType}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{row.objectName}</div>
                            {row.objectId && (
                              <div className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">
                                {row.objectId}
                              </div>
                            )}
                            {row.parentName && (
                              <div className="text-xs text-muted-foreground">
                                父对象: {row.parentName}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {row.permissions.length > 0 ? (
                                row.permissions.map((p) => (
                                  <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">无权限</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.authorityNames.slice(0, 2).join(', ') || '-'}
                            {row.authorityNames.length > 2 && (
                              <span className="ml-1">+{row.authorityNames.length - 2}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* 分页 */}
                {filteredRows.length > 0 && (
                  <div className="flex items-center justify-between border-t px-4 py-3">
                    <div className="text-sm text-muted-foreground">
                      共 {filteredRows.length} 条，第 {page} / {totalPages} 页
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage(1)}
                        disabled={page === 1}
                        className="h-8 rounded-md border px-2 text-sm disabled:opacity-50"
                      >
                        首页
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="h-8 rounded-md border px-3 text-sm disabled:opacity-50"
                      >
                        上一页
                      </button>
                      <span className="text-sm">{page}</span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="h-8 rounded-md border px-3 text-sm disabled:opacity-50"
                      >
                        下一页
                      </button>
                      <button
                        onClick={() => setPage(totalPages)}
                        disabled={page === totalPages}
                        className="h-8 rounded-md border px-2 text-sm disabled:opacity-50"
                      >
                        末页
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 右侧：卡片 */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        当前用户身份
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">共 {summary.authorities.length}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    {[
                      { typeIds: [2], label: '用户身份', icon: '👤' },
                      { typeIds: [1], label: '所在用户组', icon: '👥' },
                      { typeIds: [4, 7, 9, 10], label: '系统保留组', icon: '⚙️' },
                      { typeIds: [5], label: '已登录用户(隐式)', icon: '🔑' },
                      { typeIds: [3], label: '未登录用户', icon: '🚫' },
                      { typeIds: [6], label: '创建人', icon: '✏️' },
                      { typeIds: [8], label: '组织结构节点', icon: '🏢' },
                    ].map(({ typeIds, label, icon }) => {
                      const items = summary.authorities.filter((a) => typeIds.includes(a.typeId))
                      if (items.length === 0) return null
                      return (
                        <div key={label}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-xs">{icon}</span>
                            <span className="font-medium text-xs">{label} - {items.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {items.map((a) => (
                              <Badge key={a.authId} variant="secondary" className="text-xs font-normal">
                                {a.name || a.authId}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      来源统计
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {[...new Set(summary.authorities.map((a) => a.typeId))].map((typeId) => {
                      const count = summary.authorities.filter((a) => a.typeId === typeId).length
                      return (
                        <div key={typeId} className="flex justify-between">
                          <span className="text-muted-foreground">{getAuthorityTypeName(typeId)}</span>
                          <Badge variant="outline" className="text-xs">{count}</Badge>
                        </div>
                      )
                    })}
                    <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                      <span>总计</span>
                      <span>{summary.authorities.length}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
