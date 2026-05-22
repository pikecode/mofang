# 魔方网表权限查看器

基于 React + TypeScript + Vite + shadcn/ui 开发的单页应用，用于集中展示指定用户在当前空间的所有对象权限信息。

## 功能特性

- **权限主体查询**：查询用户关联的所有权限主体（直接权限、用户组、组织结构节点、系统保留组等）
- **对象类权限**：按对象类型（表单、导航树、分析项目等）展示操作权限
- **对象权限**：展示具体对象的操作权限，自动获取对象名称
- **ACL权限融合**：自动合并多个权限来源（按位或运算）
- **TOKEN鉴权**：支持同源部署（会话继承）和跨域部署（TOKEN鉴权）两种模式

## 技术栈

- **前端框架**：React 18 + TypeScript
- **构建工具**：Vite
- **UI组件**：shadcn/ui
- **样式**：Tailwind CSS
- **图标**：Lucide React

## 安装

### 1. 克隆项目

```bash
git clone <repository-url>
cd mofang
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env`，根据需要配置：

```bash
# TOKEN鉴权配置（跨域部署时启用）
VITE_USE_TOKEN_AUTH=true
VITE_AUTH_USERNAME=yourUsername
VITE_AUTH_PASSWORD=yourPassword
```

## 运行

### 开发模式

```bash
npm run dev
```

访问地址：
```
http://localhost:3000/?spaceId=yourSpaceId
http://localhost:3000/?spaceId=aada6708-898a-4eb2-a24a-3ac55c9a24f3
```

### 生产构建

```bash
npm run build
```

构建产物在 `dist/` 目录，部署到 Web 服务器即可。

## 部署方式

### 方式1：同源部署（推荐）

将 `dist/` 内容部署到魔方网表服务器，访问：
```
http://your-server/magicflu/?spaceId=yourSpaceId
```

**特点**：
- 无需TOKEN鉴权
- 依赖会话继承
- 在 `.env` 中设置 `VITE_USE_TOKEN_AUTH=false`

### 方式2：跨域部署

独立部署到任意Web服务器，在 `.env` 中配置：
```
VITE_USE_TOKEN_AUTH=true
VITE_AUTH_USERNAME=yourUsername
VITE_AUTH_PASSWORD=yourPassword
```

**特点**：
- 自动获取TOKEN
- 支持TOKEN刷新
- 可独立部署

## 测试

### 1. TOKEN测试

页面加载后，点击 **"测试TOKEN获取"** 按钮：
- ✅ 显示"TOKEN获取成功" - TOKEN配置正确
- ❌ 显示"TOKEN获取失败" - 检查用户名密码

### 2. 权限查询测试

1. 输入用户登录账号（如 `mfiv202602130001`）
2. 点击 **"查询"** 按钮
3. 等待加载完成，查看三个标签页：
   - **权限主体**：显示用户关联的所有权限主体
   - **对象类权限**：按对象类型展示权限
   - **对象权限**：展示具体对象的权限

### 3. 验证结果

预期输出示例：

**权限主体**：
| 主体类型 | 主体ID | 描述 |
|---------|--------|------|
| 用户 | a76f1956-... | 普通用户 - mfiv202602130001 |
| 系统保留组 | 9c6e6cac-... | 已登录用户 |

**对象类权限**：
- 表单：[查看, 编辑, 删除]
- 导航树：[查看, 管理]

**对象权限**：
| 对象类型 | 对象ID | 对象名称 | 权限 |
|---------|--------|---------|------|
| 表单 | xxx-xxx | 客户表单 | [查看, 编辑] |

## 配置说明

### Vite代理配置

开发模式下，Vite代理转发API请求到魔方网表服务器：

```typescript
// vite.config.ts
server: {
  proxy: {
    '/service': {
      target: 'http://appdev.com.magicflu.com:16199',
      changeOrigin: true,
    },
    '/jwt': {
      target: 'http://appdev.com.magicflu.com:16199',
      changeOrigin: true,
    },
  },
}
```

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `VITE_USE_TOKEN_AUTH` | 是否启用TOKEN鉴权 | `false` |
| `VITE_AUTH_USERNAME` | TOKEN获取用户名 | - |
| `VITE_AUTH_PASSWORD` | TOKEN获取密码 | - |

## 项目结构

```
src/
├── api/
│   ├── auth.ts           # TOKEN管理
│   └── permission.ts     # 权限API
├── components/
│   └── ui/               # shadcn/ui组件
├── hooks/
│   └── usePermissionQuery.ts  # 权限查询Hook
├── types/
│   └── index.ts          # TypeScript类型
├── App.tsx               # 主应用组件
└── main.tsx              # 入口文件
```

## API说明

### 权限主体查询

```typescript
// 获取用户权限主体
GET /service/s/{spaceId}/authorities/feed?bq=(digitalid,eq,{digitalId})

// 获取组织结构权限主体
GET /service/s/{spaceId}/authorities/feed?digitalId={digitalId}&forOrg=true

// 获取系统保留组
GET /service/s/{spaceId}/authorities/feed?bq=(typeid,eq,{typeId})
```

### 对象权限查询

```typescript
// 获取对象类权限
GET /service/s/{spaceId}/itemtypeacls/feed?bq=(authorityid,eq,{authId})

// 获取对象权限
GET /service/s/{spaceId}/itemacls/feed?bq=(authorityid,eq,{authId})

// 获取操作组
GET /service/s/{spaceId}/itemactiongroups/feed?bq=(itemtypeid,eq,{itemTypeId})
```

### TOKEN获取

```typescript
POST /magicflu/jwt
Content-Type: application/x-www-form-urlencoded

j_username=xxx&j_password=xxx
```

## 常见问题

### Q: 提示"缺少spaceId参数"
A: 在URL中添加 `?spaceId=yourSpaceId` 参数

### Q: 查询时一直加载不出结果
A: 检查：
1. 是否配置了正确的TOKEN鉴权信息（跨域部署时）
2. 网络连接是否正常
3. spaceId是否有效

### Q: 403 Forbidden错误
A: 
1. 检查TOKEN是否有效
2. 检查用户是否有访问该空间的权限
3. 检查spaceId是否正确

### Q: 如何获取spaceId
A: 在魔方网表系统中，点击"关于本空间"，从空间访问地址中获取

## 开发

### 安装新依赖

```bash
npm install <package-name>
```

### 代码规范

- ESLint + Prettier 自动格式化
- TypeScript 严格模式
- 组件使用 PascalCase 命名

### 调试

开发模式下，Vite 自动热更新。修改代码后浏览器自动刷新。

## 构建产物

```
dist/
├── index.html           # 入口HTML
├── assets/
│   ├── index-xxx.js     # 主JS
│   └── index-xxx.css    # 主CSS
└── vite.svg             # 图标
```

## 许可证

MIT
