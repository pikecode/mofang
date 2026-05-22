import { useState } from 'react'
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
import { Loader2, Search, Settings, Users, FileText, Layers, Target, Shield, Info, UserCircle, Building2, UserCog, UserMinus, Crown, UsersRound } from 'lucide-react'

type TabType = 'itemPermissions' | 'itemTypePermissions' | 'authorities'

const TAB_META: Record<TabType, { label: string; desc: string }> = {
  itemPermissions: {
    label: '实例级对象权限',
    desc: '针对某一个具体对象的授权，例如某张表单、某个分析项目、某个工作簿。',
  },
  itemTypePermissions: {
    label: '对象类/范围权限',
    desc: '针对一类资源或某个范围的授权，例如表单类、字段、导航树节点、问卷记录。',
  },
  authorities: {
    label: '权限来源主体',
    desc: '本次查询命中的用户、用户组、组织结构节点、已登录用户等权限来源。',
  },
}

// 权限主体类型图标映射
function getAuthorityIcon(typeId: number) {
  switch (typeId) {
    case 1: return UsersRound // 用户组
    case 2: return UserCircle // 用户
    case 3: return UserMinus // 未登录用户
    case 4: return Shield // 空间管理员
    case 5: return UserCog // 已登录用户
    case 6: return Crown // 创建人
    case 7: return UserCog // 代管理员
    case 8: return Building2 // 组织结构节点
    case 9: return Shield // 审计员
    case 10: return Shield // 流程管理员
    default: return Users
  }
}

const PAGE_SIZE = 20

function App() {
  const [spaceId, setSpaceId] = useState(() => getSpaceId())
  const [digitalId, setDigitalId] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('itemPermissions')
  const [search, setSearch] = useState('')
  const [filterItemType, setFilterItemType] = useState('')
  const [filterItemTypeAcl, setFilterItemTypeAcl] = useState('')
  const [filterItemTypeAclSearch, setFilterItemTypeAclSearch] = useState('')
  const [filterAuthType, setFilterAuthType] = useState('')
  const [itemTypeAclPage, setItemTypeAclPage] = useState(1)
  const [itemPermissionPage, setItemPermissionPage] = useState(1)
  const { summary, loading, error, queryPermission } = usePermissionQuery()


  const handleQuery = () => {
    if (spaceId.trim() && digitalId.trim()) {
      queryPermission(spaceId.trim(), digitalId.trim())
    }
  }

  const handleReset = () => {
    setSearch('')
    setFilterItemType('')
    setFilterItemTypeAcl('')
    setFilterItemTypeAclSearch('')
    setFilterAuthType('')
    setItemTypeAclPage(1)
    setItemPermissionPage(1)
  }

  // 对象权限扁平化（带筛选）
  const flatItemPermissions = summary?.itemPermissionGroups.flatMap((group) =>
    group.items
      .filter((item) => {
        if (filterItemType && group.itemTypeId.toString() !== filterItemType) return false
        if (filterAuthType && !item.authorityIds?.some((id) => summary.authorities.find((a) => a.authId === id)?.typeId.toString() === filterAuthType)) return false
        if (search && !item.itemName.toLowerCase().includes(search.toLowerCase()) && !item.itemId.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .map((item) => ({
        ...item,
        itemTypeName: group.itemTypeName,
        itemTypeId: group.itemTypeId,
      }))
  ) || []

  // 对象权限分页
  const itemPermissionTotalPages = Math.ceil(flatItemPermissions.length / PAGE_SIZE)
  const itemPermissionPagedData = flatItemPermissions.slice((itemPermissionPage - 1) * PAGE_SIZE, itemPermissionPage * PAGE_SIZE)

  // 统计
  const stats = summary?.stats || { authorityCount: 0, itemPermissionCount: 0, itemTypePermissionCount: 0 }

  // 按类型分组的权限主体
  const groupedAuthorities = summary?.authorities.reduce<Record<number, { typeName: string; items: typeof summary.authorities }>>((acc, auth) => {
    if (!acc[auth.typeId]) {
      acc[auth.typeId] = { typeName: getAuthorityTypeName(auth.typeId), items: [] }
    }
    acc[auth.typeId].items.push(auth)
    return acc
  }, {}) || {}

  // 权限主体类型（用于筛选下拉）
  const authTypeOptions = summary?.authorities
    ? [...new Set(summary.authorities.map((a) => a.typeId))].map((id) => ({ id, name: getAuthorityTypeName(id) }))
    : []

  // 对象类型（用于筛选下拉）
  const itemTypeOptions = summary?.itemPermissionGroups
    ? summary.itemPermissionGroups.map((g) => ({ id: g.itemTypeId, name: g.itemTypeName }))
    : []

  // 对象类权限类型（用于筛选下拉）
  const itemTypeAclOptions = summary?.itemTypeAcls
    ? Array.from(summary.itemTypeAcls.keys()).map((id) => ({ id, name: getItemTypeName(id) }))
    : []

  // 对象类权限分页数据
  const itemTypeAclRows = summary?.itemTypeAcls
    ? Array.from(summary.itemTypeAcls.entries())
        .filter(([itemTypeId]) => !filterItemTypeAcl || itemTypeId.toString() === filterItemTypeAcl)
        .filter(([, acls]) => {
          if (!filterItemTypeAclSearch) return true
          const q = filterItemTypeAclSearch.toLowerCase()
          return acls.some((acl) =>
            (acl.itemParentId || '').toLowerCase().includes(q) ||
            (acl.itemTypeValue || '').toLowerCase().includes(q)
          )
        })
        .flatMap(([itemTypeId, acls]) =>
          acls.map((acl, aclIdx) => {
            const actionGroupList = getActionGroupsByScope(summary.actionGroups, itemTypeId, 0)
            const permissions = parseAclPermissions(acl.acl, actionGroupList)
            const authNames = (acl.authorityIds || [])
              .map((id) => summary.authorities.find((a) => a.authId === id))
              .filter(Boolean)
              .map((a) => a!.name || a!.authId)
              .slice(0, 2)
            const extraCount = (acl.authorityIds || []).length - authNames.length
            return {
              key: `${itemTypeId}-${aclIdx}`,
              itemTypeId,
              itemParentId: acl.itemParentId,
              itemParentName: acl.itemParentName,
              itemTypeValue: acl.itemTypeValue,
              itemTypeValueName: acl.itemTypeValueName,
              permissions,
              authNames,
              extraCount,
            }
          })
        )
    : []

  const itemTypeAclTotalPages = Math.ceil(itemTypeAclRows.length / PAGE_SIZE)
  const itemTypeAclPagedData = itemTypeAclRows.slice((itemTypeAclPage - 1) * PAGE_SIZE, itemTypeAclPage * PAGE_SIZE)

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
                {summary.error && (
                  <span className="text-xs text-destructive">⚠ {summary.error}</span>
                )}
              </>
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <span className="text-xs">👤</span>
            </div>
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
          <p className="mt-2 text-xs text-muted-foreground">
            使用当前会话调用空间权限接口，会聚合接口命中的用户 / 用户组 / 组织结构节点 / 节点所在用户组 / 已登录用户权限设置。
          </p>
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
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              输入用户的登录账号和空间ID，查询该用户在指定空间内的所有权限配置，包括权限主体、对象权限和对象类权限。
            </p>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-3 max-w-lg">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>系统会自动聚合接口明确返回的用户、用户组、组织结构节点等多个维度的权限信息。</span>
            </div>
          </div>
        )}

          {/* 统计卡片 */}
          {summary && (
            <div className="grid grid-cols-4 gap-4">
              <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">权限主体</div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-bold">{stats.authorityCount}</div>
              </div>
              <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">实例级对象权限</div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <FileText className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-bold">{stats.itemPermissionCount}</div>
              </div>
              <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">对象类/范围权限</div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                    <Layers className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-bold">{stats.itemTypePermissionCount}</div>
              </div>
              <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">可筛选对象类型</div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
                    <Target className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-bold">{itemTypeOptions.length}</div>
              </div>
            </div>
          )}

        {summary && (
          <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3">
            <div>
              <div className="mb-1 text-sm font-medium">{TAB_META.itemTypePermissions.label}</div>
              <p className="text-xs leading-5 text-muted-foreground">{TAB_META.itemTypePermissions.desc}</p>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{TAB_META.itemPermissions.label}</div>
              <p className="text-xs leading-5 text-muted-foreground">{TAB_META.itemPermissions.desc}</p>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{TAB_META.authorities.label}</div>
              <p className="text-xs leading-5 text-muted-foreground">{TAB_META.authorities.desc}</p>
            </div>
          </div>
        )}

        {/* 内容区域：左侧主体 + 右侧面板 */}
        {summary && (
          <div className="grid grid-cols-[1fr_340px] gap-5">
            {/* 左侧主体 */}
            <div className="space-y-4">
              {/* Tab 切换 */}
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {([
                  { key: 'itemTypePermissions' as const, label: TAB_META.itemTypePermissions.label, count: stats.itemTypePermissionCount },
                  { key: 'itemPermissions' as const, label: TAB_META.itemPermissions.label, count: stats.itemPermissionCount },
                  { key: 'authorities' as const, label: TAB_META.authorities.label, count: stats.authorityCount },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1.5 text-xs text-muted-foreground">· {tab.count}</span>
                  </button>
                ))}
              </div>

              {/* 筛选栏（仅对象权限tab显示） */}
              {activeTab === 'itemPermissions' && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                  <span className="text-sm font-medium">筛选：</span>
                  <select
                    value={filterItemType}
                    onChange={(e) => { setFilterItemType(e.target.value); setItemPermissionPage(1) }}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    disabled={itemTypeOptions.length === 0}
                  >
                    <option value="">
                      {itemTypeOptions.length === 0 ? '暂无实例级对象类型' : '对象类型：全部'}
                    </option>
                    {itemTypeOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                  <select
                    value={filterAuthType}
                    onChange={(e) => { setFilterAuthType(e.target.value); setItemPermissionPage(1) }}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">全部权限主体类型</option>
                    {authTypeOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                  <Input
                    placeholder="搜索对象名称/ID"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setItemPermissionPage(1) }}
                    className="h-9 w-48"
                  />
                  <Button variant="ghost" size="sm" onClick={handleReset}>重置</Button>
                </div>
              )}

              {/* 表格内容 */}
              <div className="rounded-lg border bg-card">
                {/* 对象权限表格 */}
                {activeTab === 'itemPermissions' && (
                  <>
                    <div className="border-b px-4 py-3 text-sm text-muted-foreground">
                      共 {flatItemPermissions.length} 条实例级对象权限
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">序号</TableHead>
                          <TableHead>对象ID</TableHead>
                          <TableHead>对象名称</TableHead>
                          <TableHead>权限操作</TableHead>
                          <TableHead className="w-[160px]">来源主体</TableHead>
                          <TableHead>对象类型</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flatItemPermissions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              <div className="space-y-1">
                                <div className="font-medium text-foreground">没有实例级对象权限数据</div>
                                <div className="text-xs">
                                  这表示接口未返回针对具体对象的单独授权；请优先查看"对象类/范围权限"。
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          itemPermissionPagedData.map((item, idx) => (
                            <TableRow key={`${item.itemTypeId}:${item.itemId}`}>
                              <TableCell className="text-muted-foreground">{(itemPermissionPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
                              <TableCell className="font-mono text-xs max-w-[200px] truncate">{item.itemId}</TableCell>
                              <TableCell className="font-medium max-w-[250px] truncate">{item.itemName}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {item.permissions.length > 0 ? (
                                    item.permissions.map((perm, pidx) => (
                                      <Badge key={pidx} variant="secondary" className="text-xs">{perm}</Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">无权限（操作模板未加载）</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground truncate">
                                {(item.authorityIds?.slice(0, 2).map((id) => summary?.authorities.find((a) => a.authId === id)?.name || id).join(', ') || '-')}
                                {(item.authorityIds?.length || 0) > 2 && <span className="ml-1">+{(item.authorityIds?.length || 0) - 2}</span>}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.itemTypeName}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    {/* 分页 */}
                    {flatItemPermissions.length > 0 && (
                      <div className="flex items-center justify-between border-t px-4 py-3">
                        <div className="text-sm text-muted-foreground">
                          共 {flatItemPermissions.length} 条，第 {itemPermissionPage} / {itemPermissionTotalPages} 页
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setItemPermissionPage(1)}
                            disabled={itemPermissionPage === 1}
                            className="h-8 rounded-md border px-2 text-sm disabled:opacity-50"
                          >
                            首页
                          </button>
                          <button
                            onClick={() => setItemPermissionPage(p => Math.max(1, p - 1))}
                            disabled={itemPermissionPage === 1}
                            className="h-8 rounded-md border px-3 text-sm disabled:opacity-50"
                          >
                            上一页
                          </button>
                          <span className="text-sm">{itemPermissionPage}</span>
                          <button
                            onClick={() => setItemPermissionPage(p => Math.min(itemPermissionTotalPages, p + 1))}
                            disabled={itemPermissionPage === itemPermissionTotalPages}
                            className="h-8 rounded-md border px-3 text-sm disabled:opacity-50"
                          >
                            下一页
                          </button>
                          <button
                            onClick={() => setItemPermissionPage(itemPermissionTotalPages)}
                            disabled={itemPermissionPage === itemPermissionTotalPages}
                            className="h-8 rounded-md border px-2 text-sm disabled:opacity-50"
                          >
                            末页
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 对象类权限表格 */}
                {activeTab === 'itemTypePermissions' && (
                  <>
                    <div className="flex flex-wrap items-center gap-3 border-b p-3">
                      <span className="text-sm font-medium">筛选：</span>
                      <select
                        value={filterItemTypeAcl}
                        onChange={(e) => { setFilterItemTypeAcl(e.target.value); setItemTypeAclPage(1) }}
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="">全部对象类型</option>
                        {itemTypeAclOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                      </select>
                      <Input
                        placeholder="搜索父对象/值"
                        value={filterItemTypeAclSearch}
                        onChange={(e) => { setFilterItemTypeAclSearch(e.target.value); setItemTypeAclPage(1) }}
                        className="h-8 w-40 text-xs"
                      />
                      <span className="ml-auto text-sm text-muted-foreground">
                        共 {stats.itemTypePermissionCount} 条
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">序号</TableHead>
                          <TableHead>对象类型</TableHead>
                          <TableHead>父对象/值</TableHead>
                          <TableHead>权限</TableHead>
                          <TableHead className="w-[160px]">来源主体</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemTypeAclRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              <div className="space-y-1">
                                <div className="font-medium text-foreground">没有对象类/范围权限数据</div>
                                <div className="text-xs">如果权限主体有数据，说明这些主体当前没有返回可展示的类权限记录。</div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          itemTypeAclPagedData.map((row, idx) => (
                            <TableRow key={row.key}>
                              <TableCell className="text-muted-foreground">{(itemTypeAclPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{getItemTypeName(row.itemTypeId)}</Badge>
                              </TableCell>
                              <TableCell className="text-xs max-w-[200px] truncate">
                                {row.itemParentName || row.itemParentId || '-'}
                                {row.itemTypeValue && (
                                  <span className="text-muted-foreground">
                                    {' / '}{row.itemTypeValueName || row.itemTypeValue}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {row.permissions.length > 0 ? (
                                    row.permissions.map((perm, pidx) => (
                                      <Badge key={pidx} variant="secondary" className="text-xs">{perm}</Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">无权限（操作模板未加载）</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground truncate">
                                {row.authNames.join(', ') || '-'}
                                {row.extraCount > 0 && <span className="ml-1">+{row.extraCount}</span>}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    {/* 分页 */}
                    {itemTypeAclRows.length > 0 && (
                      <div className="flex items-center justify-between border-t px-4 py-3">
                        <div className="text-sm text-muted-foreground">
                          共 {itemTypeAclRows.length} 条，第 {itemTypeAclPage} / {itemTypeAclTotalPages} 页
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setItemTypeAclPage(1)}
                            disabled={itemTypeAclPage === 1}
                            className="h-8 rounded-md border px-2 text-sm disabled:opacity-50"
                          >
                            首页
                          </button>
                          <button
                            onClick={() => setItemTypeAclPage(p => Math.max(1, p - 1))}
                            disabled={itemTypeAclPage === 1}
                            className="h-8 rounded-md border px-3 text-sm disabled:opacity-50"
                          >
                            上一页
                          </button>
                          <span className="text-sm">{itemTypeAclPage}</span>
                          <button
                            onClick={() => setItemTypeAclPage(p => Math.min(itemTypeAclTotalPages, p + 1))}
                            disabled={itemTypeAclPage === itemTypeAclTotalPages}
                            className="h-8 rounded-md border px-3 text-sm disabled:opacity-50"
                          >
                            下一页
                          </button>
                          <button
                            onClick={() => setItemTypeAclPage(itemTypeAclTotalPages)}
                            disabled={itemTypeAclPage === itemTypeAclTotalPages}
                            className="h-8 rounded-md border px-2 text-sm disabled:opacity-50"
                          >
                            末页
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                    {/* 权限主体表格 */}
                    {activeTab === 'authorities' && (
                      <>
                        <div className="border-b px-4 py-3 text-sm text-muted-foreground">
                          共 {summary.authorities.length} 个权限主体
                        </div>
                        {summary.authorities.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                              <Users className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <p className="text-sm text-muted-foreground">无权限主体</p>
                          </div>
                        ) : (
                          <div className="divide-y">
                            {Object.entries(groupedAuthorities).map(([typeId, group]) => {
                              const IconComponent = getAuthorityIcon(parseInt(typeId))
                              return (
                                <div key={typeId}>
                                  <div className="flex items-center gap-2 bg-muted/30 px-4 py-2.5">
                                    <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
                                      <IconComponent className="h-3 w-3" />
                                    </div>
                                    <span className="text-sm font-medium">{group.typeName}</span>
                                    <Badge variant="secondary" className="text-xs px-1.5 py-0">{group.items.length}</Badge>
                                  </div>
                                  <div className="divide-y">
                                    {group.items.map((auth, idx) => (
                                      <div key={`${auth.authId}-${idx}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30">
                                        <div className="w-12 text-sm text-muted-foreground shrink-0">{idx + 1}</div>
                                        <div className="w-[200px] shrink-0 truncate font-mono text-xs text-foreground">{auth.authId}</div>
                                        <div className="flex-1 min-w-0 truncate text-sm">{auth.name || <span className="text-muted-foreground">-</span>}</div>
                                        <div className="w-[200px] shrink-0 truncate font-mono text-xs text-muted-foreground">
                                          {auth.parentId || '-'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
              </div>
            </div>

            {/* 右侧信息栏 */}
            <div className="space-y-4">
              <Card className="bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm">
                    当前用户会话
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Settings className="h-3.5 w-3.5" />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">登录账号</span>
                    <span className="font-mono text-foreground bg-muted/50 rounded px-2 py-0.5">{summary.digitalId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">空间ID</span>
                    <span className="font-mono text-xs text-foreground bg-muted/50 rounded px-2 py-0.5 truncate max-w-[140px]">{spaceId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">权限主体数</span>
                    <span className="font-semibold text-foreground bg-primary/10 text-primary rounded px-2 py-0.5">{stats.authorityCount}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm">
                    所属组织树
                    <div className="flex h-5 items-center">
                      <Badge variant="secondary" className="text-xs px-2 py-0">
                        {summary.authorities.filter((a) => a.typeId === 8).length}
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {summary.authorities.filter((a) => a.typeId === 8).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-2">
                        <Users className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-xs text-muted-foreground">该用户未关联组织结构</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {summary.authorities
                        .filter((a) => a.typeId === 8)
                        .map((auth, idx) => (
                          <div key={idx} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                              <span className="text-[10px] font-bold">{idx + 1}</span>
                            </div>
                            <span className="truncate">{auth.name || auth.authId}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 权限主体类型汇总 */}
              {Object.keys(groupedAuthorities).length > 0 && (
                <Card className="bg-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">主体类型分布</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.values(groupedAuthorities).map((group) => (
                        <div key={group.typeName} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{group.typeName}</span>
                          <Badge variant="outline" className="text-xs">{group.items.length}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
