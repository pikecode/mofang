import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePermissionQuery, getAuthorityTypeName, getItemTypeName, parseAclPermissions } from '@/hooks/usePermissionQuery'
import { Loader2, Search, User, Shield, FileText } from 'lucide-react'

function App() {
  const [digitalId, setDigitalId] = useState('')
  const { summary, loading, error, queryPermission, spaceId } = usePermissionQuery()

  const handleQuery = () => {
    if (digitalId.trim()) {
      queryPermission(digitalId.trim())
    }
  }

  // 获取有权限的对象类型列表
  const itemTypeIds = summary?.itemTypeAcls ? Array.from(summary.itemTypeAcls.keys()) : []

  // 获取按类型分组的对象权限列表
  const itemPermissionGroups = summary?.itemPermissionGroups || []

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">魔方网表权限查看器</h1>
          <p className="text-muted-foreground">
            查询指定账号在当前空间的所有对象权限设置信息
          </p>
        </div>

        {!spaceId && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
            <p className="font-medium">提示</p>
            <p className="text-sm">当前使用默认 spaceId: a1c747bb-8dd2-4e1d-813e-d16416d989cf</p>
          </div>
        )}

        {/* Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              查询用户权限
            </CardTitle>
            <CardDescription>
              输入用户登录账号，查询该用户在当前空间的所有权限
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                placeholder="请输入用户登录账号"
                value={digitalId}
                onChange={(e) => setDigitalId(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleQuery} disabled={loading || !digitalId.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                查询
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        {/* Results */}
        {summary && (
          <Tabs defaultValue="authorities" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="authorities">
                <User className="mr-2 h-4 w-4" />
                权限主体
              </TabsTrigger>
              <TabsTrigger value="itemTypes">
                <Shield className="mr-2 h-4 w-4" />
                对象类权限
              </TabsTrigger>
              <TabsTrigger value="items">
                <FileText className="mr-2 h-4 w-4" />
                对象权限
              </TabsTrigger>
            </TabsList>

            {/* Authorities Tab */}
            <TabsContent value="authorities">
              <Card>
                <CardHeader>
                  <CardTitle>权限主体列表</CardTitle>
                  <CardDescription>
                    该用户关联的所有权限主体（直接权限、用户组、组织结构、系统保留组等）
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {summary.authorities.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      {summary.error || '未找到权限主体'}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>权限主体</TableHead>
                          <TableHead>主体ID</TableHead>
                          <TableHead>描述/名称</TableHead>
                          <TableHead>所属组</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.authorities.map((auth, idx) => (
                          <TableRow key={`${auth.authId}-${idx}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">
                                  {getAuthorityTypeName(auth.typeId)}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {auth.authId}
                            </TableCell>
                            <TableCell className="text-sm">
                              {auth.name || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {auth.parentId || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Item Type Permissions Tab */}
            <TabsContent value="itemTypes">
              <Card>
                <CardHeader>
                  <CardTitle>对象类权限</CardTitle>
                  <CardDescription>
                    该用户对各类对象（表单、导航树等）的操作权限
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {itemTypeIds.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      未找到对象类权限
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {itemTypeIds.map((itemTypeId) => {
                        const acls = summary.itemTypeAcls.get(itemTypeId) || []
                        const actionGroups = summary.actionGroups.get(itemTypeId) || []

                        return (
                          <div key={itemTypeId} className="space-y-2">
                            <h3 className="text-lg font-semibold">
                              {getItemTypeName(itemTypeId)}
                            </h3>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>父对象/值</TableHead>
                                  <TableHead>权限</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {acls.map((acl, idx) => {
                                  const permissions = parseAclPermissions(acl.acl, actionGroups)
                                  return (
                                    <TableRow key={idx}>
                                      <TableCell className="font-mono text-sm">
                                        {acl.itemParentId || '-'}
                                        {acl.itemTypeValue && ` / ${acl.itemTypeValue}`}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                          {permissions.length > 0 ? (
                                            permissions.map((perm, pidx) => (
                                              <Badge key={pidx} variant="outline">
                                                {perm}
                                              </Badge>
                                            ))
                                          ) : (
                                            <span className="text-muted-foreground text-sm">
                                              无权限
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Item Permissions Tab */}
            <TabsContent value="items">
              <Card>
                <CardHeader>
                  <CardTitle>对象权限</CardTitle>
                  <CardDescription>
                    该用户对具体对象（表单、导航树、分析项目等）的操作权限
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {itemPermissionGroups.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      未找到对象权限
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {itemPermissionGroups.map((group) => (
                        <div key={group.itemTypeId} className="space-y-2">
                          <h3 className="text-lg font-semibold">
                            {group.itemTypeName}
                          </h3>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>对象ID</TableHead>
                                <TableHead>对象名称</TableHead>
                                <TableHead>权限操作</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.items.map((item) => (
                                <TableRow key={item.itemId}>
                                  <TableCell className="font-mono text-sm">
                                    {item.itemId}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {item.itemName}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {item.permissions.length > 0 ? (
                                        item.permissions.map((perm, idx) => (
                                          <Badge key={idx} variant="outline">
                                            {perm}
                                          </Badge>
                                        ))
                                      ) : (
                                        <span className="text-muted-foreground text-sm">
                                          无权限
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

export default App
