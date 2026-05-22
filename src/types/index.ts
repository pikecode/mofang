// 权限主体类型
export interface Authority {
  typeId: number
  authId: string
  parentId?: string
  name?: string
}

// 对象类型定义
export interface ItemType {
  id: number
  name: string
}

// 对象操作组
export interface ItemActionGroup {
  groupName: string
  aclCoding: number
  classOrInst: number
}

// 对象类权限
export interface ItemTypeAcl {
  acl: string
  itemTypeId?: number
  itemParentId?: string
  itemTypeValue?: string
  authorityIds?: string[]
}

// 对象权限
export interface ItemAcl {
  acl: string
  itemTypeId: number
  itemId: string
  authorityIds?: string[]
}

// 对象基本信息
export interface ItemInfo {
  id: string
  name: string
  typeId: number
}

// 用户权限汇总
export interface UserPermissionSummary {
  digitalId: string
  authorities: Authority[]
  itemTypeAcls: Map<number, ItemTypeAcl[]>
  itemAcls: Map<string, ItemAcl[]>
  itemNames: Map<string, string>
}

// 对象类型ID映射
export const ITEM_TYPE_MAP: Record<number, string> = {
  0: '魔方实例',
  1: '空间',
  2: '表单',
  3: '记录',
  4: '表单模板',
  5: '数据文件',
  6: '字段',
  7: '全文检索',
  8: '报表公式',
  9: '查看图表',
  10: '手动回写公式',
  11: '树下拉复选',
  12: '导航树及其节点',
  13: '空间全文检索',
  14: '微应用导航页按钮及分组',
  15: '数据分析项目',
  16: '数据分析工作簿',
  17: '导航树',
  18: '问卷',
  19: '问卷记录',
  20: '交叉导航节点',
  21: '交叉导航',
  22: '知识库',
}

// 主体类型ID映射
export const AUTH_TYPE_MAP: Record<number, string> = {
  1: '用户组',
  2: '用户',
  3: '未登录用户',
  4: '空间管理员',
  5: '已登录用户',
  6: '创建人',
  7: '代管理员',
  8: '组织结构节点',
  9: '审计员',
  10: '流程管理员',
}
