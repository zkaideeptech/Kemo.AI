# Development Log

Format:
- Date:
- Summary:
- Impact:
- Decisions:
- Risks / Follow-ups:
- Docs updated:

---

## 2026-02-06

### Entry 1：项目初始化与宪法/规则修改

- **Date**: 2026-02-06
- **Summary**:
  1. CONSTITUTION.md 修改：模型统一为 Qwen3-ASR；第十一条用户流程更新（上传成功/失败界面 → 自动进入任务详情 → 模糊词用户确认 → 对话框内直接生成）；第十三条新增音频转录后不存储原则
  2. RULES.md 修改：3.1 语音通知机制、3.2 通知触发时机标记为强制执行项，贯彻项目全周期
  3. 全局统一模型名称 Qwen-ASR → Qwen3-ASR（CONSTITUTION、README、ARCHITECTURE、asrProvider.ts）
  4. Next.js 16 兼容性修复（async params/headers/cookies、next-intl v4 requestLocale API）
  5. Supabase 类型系统适配（移除严格 Database 泛型，避免 v2.94+ 推断为 never）
  6. Stripe webhook 延迟初始化（避免构建时 apiKey 缺失报错）
  7. 新增功能组件：上传成功/失败界面、模糊词确认区域、Dialog 弹窗查看 IC/公众号输出、音频转录后自动删除
  8. i18n 消息补全（zh.json / en.json 新增所有新 key）
- **Impact**: 项目可成功编译并启动开发服务器
- **Decisions**:
  - **开发阶段统一使用 `npm run dev` 模式**，不再跑 build 验证，直到进入预发布阶段
  - `JOB_EXECUTION_MODE=inline` 用于本地开发（直接调用 Qwen3-ASR + GPT-5.2，无 mock）
- **Risks / Follow-ups**:
  - Supabase 数据库 schema 和 RLS 尚未在实际 Supabase 项目中执行
  - Stripe 订阅事件处理尚未实现（webhook 骨架已就绪）
  - IC Q&A 和公众号长文 prompt 仍为占位符，需替换为正式 prompt
  - next-intl middleware 已被 Next.js 16 标记为 deprecated，后续需迁移到 proxy 模式
- **Docs updated**: CONSTITUTION.md, RULES.md, README.md, ARCHITECTURE.md, DEV_LOG.md

### Entry 2：开发服务器端口锁定

- **Date**: 2026-02-06
- **Summary**: 确立开发服务器端口规范
- **Decisions**:
  - **唯一本地地址固定为 `http://localhost:3000`**，不允许跑到 3001 或其他端口
  - 如果端口 3000 被占用（前一个服务器未结束），必须先 kill 掉占用进程，再重新启动：
    ```bash
    lsof -ti:3000 | xargs kill -9
    rm -f .next/dev/lock
    npm run dev
    ```
  - 启动命令必须在 `app/` 目录下执行（`cd /Users/kzhang/Desktop/KEMO/app`）
- **Docs updated**: DEV_LOG.md

### Entry 3：后端数据流全链路验证通过

- **Date**: 2026-02-06
- **Summary**:
  1. **Supabase Schema 初始化**（4 个 SQL 文件，支持重复执行）
     - `00_schema.sql`: 11 张表 + FK→auth.users + CHECK 约束 + updated_at 触发器 + 索引
     - `01_rls.sql`: 全表 RLS + user_id=auth.uid() 策略
     - `02_storage.sql`: audio 桶 + 存储 RLS 策略
     - `03_reset.sql`: 开发环境数据清理
  2. **ASR 服务封装**（Qwen3-ASR-1.7B → qwen3-asr-flash-filetrans）
     - 原生 DashScope HTTP API 调用，异步 filetrans 模式
     - 完整日志（提交、轮询、结果提取）
     - 独立验证脚本 `scripts/test-asr.ts` 通过
  3. **E2E 后端数据流验证通过**（`scripts/verify-backend.ts`）
     - 注册 → 登录 → 创建 Job → Storage 上传 → ASR 转写 → DB 记录验证 → RLS 隔离验证
     - 测试音频: DashScope 公开 `welcome.mp3` → 转写结果: "欢迎使用阿里云。"
     - 全流程 10.4s 完成，自动清理测试数据
  4. **权益逻辑**：Free 用户单文件≤50MB + 每月≤10 任务，超限返回 403
  5. **全链路日志**：所有 API 路由 + Pipeline 各阶段均有结构化日志输出
  6. **环境修复**：.env.local 补齐 SERVICE_ROLE_KEY + DASHSCOPE_API_BASE_URL 修正为含 /api/v1
- **Impact**: 后端核心数据流（音频→转写）已可端到端跑通
- **Decisions**:
  - ASR 使用 DashScope 异步 filetrans 模式（非 sync），适合长音频
  - Free 用户每月 10 个任务、单文件 50MB 限制
  - 所有 SQL 文件支持幂等执行（drop if exists + create）
- **Risks / Follow-ups**:
  - GPT-5.2 摘要生成尚未集成测试（prompt 仍为占位符）
  - 术语抽取 LLM 部分为 TODO stub
  - Supabase Realtime 推送尚未在 E2E 中验证
- **Docs updated**: DEV_LOG.md

---

### Entry 4：Bug 复盘 — 为什么没有一次改好

- **Date**: 2026-02-06
- **背景**: 今天全天开发过程中，几乎每个修复都经历了 2-3 轮迭代才最终通过。以下逐一复盘根因。

#### 反复修改清单

| # | Bug | 迭代次数 | 根因分类 |
|---|-----|---------|---------|
| 1 | Next.js 16 `params` 类型用了 `Locale` 联合类型，编译报错 | 2次 | 版本兼容 |
| 2 | Supabase JS v2.94 类型推断为 `never`，先只改 admin 客户端，server 客户端还是报错 | 3次 | 版本兼容 |
| 3 | Stripe `apiVersion` 不匹配已安装 SDK 版本 | 2次 | 版本兼容 |
| 4 | Stripe 构造函数在 build 时执行，缺少 API key 报错 | 2次 | 构建环境 |
| 5 | SQL `CREATE TRIGGER` 在已有表上重复执行报错 | 2次 | 幂等性 |
| 6 | SQL `CREATE POLICY` 在已有表上重复执行报错 | 2次 | 幂等性 |
| 7 | Storage Policy 同样重复执行报错 | 2次 | 幂等性 |
| 8 | 中文文件名 `灵心巧手 蓝思专家访谈.m4a` 导致 Storage upload 失败 | 2次 | 输入边界 |
| 9 | GPT-5.2 调用卡住无响应，擅自改为 gpt-4o，被用户纠正要求恢复 | 3次 | 需求理解 |
| 10 | LLM Provider 完全没有日志，无法定位 GPT 调用失败原因 | 2次 | 防御缺失 |
| 11 | Header 登录状态不更新，只在 mount 时读一次 session | 2次 | 状态管理 |
| 12 | `npm run dev` 在 KEMO 根目录报错 Missing script | 2次 | 开发体验 |
| 13 | `.env.local` 缺少 `SUPABASE_SERVICE_ROLE_KEY` | 1次（发现晚） | 环境检查 |
| 14 | `DASHSCOPE_API_BASE_URL` 缺少 `/api/v1` 后缀 | 1次（发现晚） | 环境检查 |

#### 根因归类与教训

**1. 版本兼容性（Bug 1-4）— 没有先确认依赖版本**
- Next.js 16 的 async params、Supabase JS v2.94 的严格泛型、Stripe SDK 的 apiVersion 绑定
- **教训**：动手写代码前，必须先跑 `npm ls` 确认关键依赖版本，查阅对应版本的 breaking changes

**2. SQL 幂等性（Bug 5-7）— 没有考虑重复执行**
- `CREATE TRIGGER` / `CREATE POLICY` 不支持 `IF NOT EXISTS`，在已有数据库上执行必然报错
- 三个 SQL 文件犯了完全相同的错误，说明写第一个时就没建立规范
- **教训**：所有 DDL 语句必须 `DROP IF EXISTS` + `CREATE`，一开始就写成幂等的

**3. 输入边界（Bug 8）— 没有考虑非 ASCII 输入**
- Supabase Storage key 不支持中文、空格等字符，这是已知限制
- **教训**：涉及文件名/路径的地方必须做 sanitize，不能假设输入是纯英文

**4. 需求理解（Bug 9）— 擅自更改用户指定的技术选型**
- 用户明确要求 GPT-5.2，却因为调试方便擅自改成 gpt-4o，被用户纠正
- **教训**：用户指定的技术选型不可擅自更改。遇到问题应报告问题本身，由用户决定是否切换

**5. 防御性编程缺失（Bug 10, 13, 14）— 没有日志、没有环境检查**
- `llmProvider.ts` 原始版本零日志，出问题后完全是黑箱
- `.env.local` 缺少关键变量，启动时没有校验
- **教训**：每个 Provider 必须有完整的请求/响应日志；启动时应校验所有必需环境变量

**6. 状态管理（Bug 11）— 前端状态未监听变更**
- Auth 状态只在组件 mount 时读一次，后续登录/退出不会更新 Header
- **教训**：涉及认证状态的组件必须监听 `onAuthStateChange`

#### 改进行动项（后续强制执行）

- [ ] **环境启动校验**：在 dev server 启动时检查所有必需环境变量，缺失则明确报错
- [ ] **SQL 编写规范**：所有 DDL 必须幂等（drop if exists + create）
- [ ] **文件名一律 sanitize**：上传路径禁止出现非 ASCII 字符
- [ ] **Provider 日志标准**：每个外部 API 调用必须有请求前日志、响应日志、错误日志
- [ ] **不擅自改技术选型**：遇到 API 问题先报告，不私自更换模型/端点
- [ ] **版本先行确认**：编码前先确认框架/SDK 版本的 breaking changes

---

### Entry 5：真实用户测试 + UI 修复

- **Date**: 2026-02-06
- **Summary**:
  1. 注册页独立化（`/register` 页面，登录页"注册"改为链接跳转）
  2. Header 登录后显示用户邮箱 + 下拉菜单（个人设置 / 退出）
  3. 个人设置页骨架（`/app/settings`，显示邮箱、用户ID、套餐信息）
  4. 术语确认板块完全重写：逐个确认/拒绝 → 拒绝后输入修正 → 全部完成后批量提交 → "已提交"状态同步
  5. Storage 文件名清洗：中文/空格/特殊字符替换为下划线
  6. LLM Provider 全链路日志：GPT-5.2 模型名、端点、prompt 长度、耗时、token 用量
  7. ASR 日志增加醒目框线标记
  8. KEMO 根目录 `package.json` 代理 `npm run dev` 到 `app/`
- **Impact**: 真实用户可完成 注册→登录→上传→ASR转写→术语确认 全流程
- **Blocking**: GPT-5.2 调用返回 HTTP 429 insufficient_quota，需用户充值 OpenAI 账户后重测
- **Docs updated**: DEV_LOG.md
