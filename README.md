## Kemo.AI – 音频 SaaS 平台（P0 环境）

Kemo.AI 是一个专注于音频处理与生成的 SaaS 工具，当前版本聚焦于 **基础环境搭建和账号绑定（P0）**，为后续功能迭代打好底座。

### 技术栈

- **前端**：Next.js 16（App Router）+ TypeScript
- **样式**：Tailwind CSS 4 + shadcn/ui（中性、非「AI 味」SaaS UI）
- **多语言**：`next-intl`（支持 zh / en）
- **后端 / 数据**：Supabase（Auth + Postgres + RLS + Realtime）
- **部署**：Vercel（与 GitHub 仓库 `Kemo.AI` 绑定）

---

### 本地开发

1. 克隆仓库

```bash
git clone https://github.com/zkaideeptech/Kemo.AI.git
cd Kemo.AI/app
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量（见下文）

4. 启动开发服务器

```bash
npm run dev
```

默认访问地址：`http://localhost:3000`

---

### 环境变量（P0）

在 `app` 目录下创建 `.env.local`（不会提交到 Git）：

```bash
cp .env.example .env.local  # 推荐方式，如果存在示例文件
```

或手动创建并填入以下变量（名称示例，后续可根据实际调整）：

```bash
NEXT_PUBLIC_SUPABASE_URL=<Supabase Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon public key>

SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>  # 仅服务端使用，切勿暴露到前端

OPENAI_API_KEY=<OpenAI API key>
```

---

### 多语言（next-intl）

项目使用 `next-intl` 做 i18n：

- 默认语言：`zh`
- 支持语言：`zh`, `en`
- 通过中间件进行语言路由，后续页面将以 `/zh`、`/en` 等前缀形式访问。

具体实现细节会在后续迭代中完善，包括：

- 公用文案字典
- 语言切换控件
- 与路由的深度集成

---

### Supabase & OpenAI

- **Supabase**
  - 使用 Supabase Pro 计划
  - 负责用户身份认证（Auth）、数据库（Postgres）、行级安全策略（RLS）以及实时能力（Realtime）
- **OpenAI**
  - 通过官方 SDK 接入，用于后续音频相关的智能处理能力

当前代码库中仅完成 **环境级别的接入与配置准备**，业务逻辑会在后续版本逐步上线。

---

### 部署

建议使用 Vercel 进行部署：

- 将 GitHub 仓库 `Kemo.AI` 导入 Vercel
- 配置与本地一致的环境变量
- 每次 push 到 `main` 分支将自动触发部署

---

### 开发路线（Roadmap 概要）

1. 完成 UI 设计体系（布局、导航、表单组件等）
2. 打通 Supabase Auth（注册 / 登录 / 会话管理）
3. 接入首个音频处理 / 生成的 OpenAI 流程
4. 仪表盘与使用配额管理
5. 计费与团队协作功能

当前仓库处于 **P0：环境与基础设施阶段**，欢迎在 Issue 中提出需求与建议。
