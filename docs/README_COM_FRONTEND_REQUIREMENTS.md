# Kemo.AI 前端重构需求文档：ReadMe 风格 SaaS 版本

最后更新：2026-06-05

面向对象：前端设计师、UI 设计师、前端工程师  
参考网站：[ReadMe](https://readme.com/)  
目标：把 Kemo.AI 做成一个成熟、清晰、带轻量动画的 SaaS 产品界面。前端只承接后端已经存在的真实能力，不做假按钮，不额外发明功能，不用静态样例伪装业务数据。

## 1. 一句话目标

Kemo.AI 是一个访谈研究工作台：用户导入资料、录音或实时采集访谈，后端完成转写、术语确认、AI 成果生成，前端负责把这些真实状态以 ReadMe 风格的两段式 SaaS 界面呈现出来。

## 2. 视觉参考：必须参照 ReadMe

本次视觉方向以 `readme.com` 当前官网为参照，不是复制 Logo、文案或品牌资产，而是复用它的界面语言。

### 2.1 需要吸收的 ReadMe 特征

- 居中、克制、产品化的顶部导航：中间品牌，两侧导航和 CTA，按钮小而明确。
- 大标题和产品截图预览结合：第一屏要让用户马上知道这是一个“研究/文档/知识工作台”，不是普通后台。
- 文档产品感：左侧导航、中央内容、右侧 AI/助手/上下文面板。
- 清晰的分段控件：例如 ReadMe 的 `View / Edit`、功能 tab、产品能力切换。
- 轻量线框和卡片：细边框、浅阴影、低饱和背景，不做厚重 dashboard。
- 页面有纵深感：可以使用细线连接、角标、分隔线、轻微浮动，但不能做花哨背景。
- 动画是解释产品结构的，不是装饰：文字切换、面板进入、卡片 hover、tab 切换、实时转写滚动。

### 2.2 禁止项

- 不要照抄 ReadMe 的 Logo、品牌图形、客户 Logo、英文营销文案。
- 不要做一堆假的 dashboard 指标。
- 不要出现后端没有支持的按钮，例如“Share team”“Invite members”“Export to Notion”。
- 不要为了好看做不可点击的假搜索、假通知、假帮助、假 AI Agent。
- 不要把按钮做成纯摆设。每个按钮必须能落到路由、API、弹窗、文件上传、真实 disabled 状态之一。

## 3. 两段式界面布局

### 第一段：公开/入口层

用于 `/[locale]`、登录前首页、注册登录引导。

结构参考 ReadMe 首页：

1. 顶部居中导航。
2. 大标题，说明 Kemo.AI 的核心价值。
3. 一个真实产品预览框，展示“项目 / 转写 / 成果 / 追问助手”的工作台布局。
4. 一个邮箱或注册 CTA。
5. 不做复杂营销长页，第一屏必须能看见实际产品形态。

入口层只允许出现这些动作：

| 元素 | 动作 |
| --- | --- |
| 登录 | 跳转 `/{locale}/login` |
| 注册 / 开始使用 | 跳转 `/{locale}/register` |
| 语言切换 | 切换 `zh` / `en` 路由 |
| 产品预览 | 静态展示真实功能结构，不放假数据按钮 |

### 第二段：登录后工作台层

用于 `/[locale]/app/jobs` 和 `/[locale]/app/settings`。

结构参考 ReadMe 的文档产品界面：

1. 左侧窄导航：搜索、项目/访谈、资料、设置、新建。
2. 中央主工作区：当前项目、最近访谈、转写详情、资料详情或成果文档。
3. 右侧上下文栏：成果、实时笔记、追问助手、当前套餐提示。
4. Live 模式切换为深色实时采集界面：左侧实时转写，右侧实时笔记和追问助手。

桌面布局必须保持三栏清晰。移动端可以折叠为：

1. 顶部/底部简化导航。
2. 主内容优先。
3. 成果栏变成可打开的底部面板或独立 view。

## 4. 后端真实能力概览

前端需要适配以下真实业务对象：

| 业务对象 | 后端表 / 类型 | 前端应该怎么叫 |
| --- | --- | --- |
| 项目 | `projects` / `ProjectRow` | 项目、研究工作台 |
| 访谈/材料 | `jobs` / `JobRow` | 访谈、转写任务、材料 |
| 音频资产 | `audio_assets` | 音频文件、实时录音 |
| 转写 | `transcripts` / `TranscriptRow` | 转写文本 |
| 资料来源 | `sources` / `SourceRow` | 资料、来源、参考材料 |
| 生成成果 | `artifacts` / `WorkspaceArtifact` | 成果、文稿、追问、摘要 |
| 收藏 | `favorites` | 收藏 |
| 术语确认 | `term_occurrences` | 待确认术语 |
| 用户套餐 | `subscriptions` + usage counters | 当前套餐、用量 |

前端不应该直接展示表名、内部 kind、storage path、provider 名称、service role 或任务内部日志。

## 5. 页面路由

| 页面 | 路由 | 说明 |
| --- | --- | --- |
| 首页 | `/{locale}` | 登录前入口层，ReadMe 风格 hero + 产品预览 |
| 登录 | `/{locale}/login` | Supabase Auth 登录 |
| 注册 | `/{locale}/register` | Supabase Auth 注册 |
| 工作台 | `/{locale}/app/jobs` | 主 SaaS 工作区 |
| 打开指定任务 | `/{locale}/app/jobs?job={jobId}` | 初始选中某个 job |
| 新建入口 | `/{locale}/app/jobs?new=1` | 打开新材料 / live 入口 |
| 任务详情兼容路由 | `/{locale}/app/jobs/{id}` | 重定向或进入对应任务 |
| 设置 | `/{locale}/app/settings` | 个人资料、主题、用量和套餐 |
| 旧新建页 | `/{locale}/app/new` | 如保留，必须复用真实创建逻辑，不新增假 UI |

`locale` 当前至少要支持：

- `zh`：纯中文界面。
- `en`：纯英文界面。

不能在同一界面混用中英文，除非是产品名 `Kemo.AI`、套餐名 `Pro+`、技术格式名如 `DOCX`。

## 6. 工作台初始数据

`/[locale]/app/jobs/page.tsx` 会在服务端一次性读取：

- `projects`
- `jobs`
- `transcripts`
- `memos`
- `artifacts`
- `favorites`
- `sources`
- `term_occurrences`
- 当前用户 plan

设计要求：

- 初始页面不要再做一个假 dashboard。
- 如果没有任何项目/访谈，显示真实 empty state，并提供“开始实时访谈”或“导入资料”。
- 如果有项目，优先展示最近项目和最近访谈。
- 如果有 artifacts，右栏直接展示真实成果。
- 所有列表都需要 loading、empty、error、ready 四种状态。

## 7. API 路由与前端动作映射

所有 API 返回格式统一：

```ts
{ ok: true, data: ... }
{ ok: false, error: { message?: string } }
```

### 7.1 项目

| 动作 | API | 方法 | 前端要求 |
| --- | --- | --- | --- |
| 获取项目 | `/api/projects` | `GET` | 用于刷新项目列表 |
| 创建项目 | `/api/projects` | `POST` | title 可选；为空时后端使用默认标题 |
| 删除项目 | `/api/projects/{id}` | `DELETE` | 必须有确认，不可静默删除 |

### 7.2 访谈 / Job

| 动作 | API | 方法 | 前端要求 |
| --- | --- | --- | --- |
| 获取 job 列表 | `/api/jobs` | `GET` | 按创建时间展示 |
| 创建上传任务 | `/api/jobs` | `POST` | 支持 JSON 或 multipart；必须选择 project |
| 创建 live 任务 | `/api/jobs` | `POST` | `captureMode: "live"`，不要求文件 |
| 获取单个 job | `/api/jobs/{id}` | `GET` | 用于详情刷新 |
| 重命名 job | `/api/jobs/{id}` | `PATCH` | 标题保存后要有反馈 |
| 删除 job | `/api/jobs/{id}` | `DELETE` | 必须有确认 |
| 入队处理 | `/api/jobs/{id}/run` | `POST` | 只入队，不在页面里等待长任务完成 |

Job 状态：

| 后端状态 | 前端文案 | UI 表现 |
| --- | --- | --- |
| `pending` | 待处理 / Ready | 中性 |
| `queued` | 排队中 | pending badge |
| `transcribing` | 转写中 | 进度中 |
| `extracting_terms` | 提取术语中 | 进度中 |
| `needs_review` | 需要确认术语 | 阻断但不是错误 |
| `summarizing` | 生成成果中 | 进度中 |
| `completed` | 已完成 | ready |
| `failed` | 失败 | 显示 `error_message` 和重试入口 |

### 7.3 资料来源

| 动作 | API | 方法 | 前端要求 |
| --- | --- | --- | --- |
| 获取项目资料 | `/api/projects/{id}/sources` | `GET` | 显示 URL、文本、导入状态 |
| 导入 URL / 文本资料 | `/api/projects/{id}/sources` | `POST` | URL 会尝试抽取正文；失败也会保存 failed source |
| Web 搜索 | `/api/search/web` | `GET` | 只有做搜索入口时才展示，不要假搜索框 |
| 项目内搜索 | `/api/projects/{id}/search?q=` | `GET` | 只做真实 quick jump，不做静态假搜索 |

### 7.4 成果 Artifacts

| 动作 | API | 方法 | 前端要求 |
| --- | --- | --- | --- |
| 获取 job 成果 | `/api/jobs/{id}/artifacts` | `GET` | 右栏或成果面板展示 |
| 生成成果 | `/api/jobs/{id}/artifacts` | `POST` | body 传 `kind`；必须有 pending 状态 |
| 下载成果 | `/api/artifacts/{id}/download` | `GET` | 只在后端可下载时显示按钮 |
| 收藏成果 | `/api/favorites` | `POST` | 成功后本地立即更新 |
| 取消收藏 | `/api/favorites?artifactId=...` | `DELETE` | 成功后移除 favorite 状态 |

当前支持的 artifact kind：

- `live_meeting_editor`
- `live_question_coach`
- `publish_script`
- `roadshow_transcript`
- `meeting_minutes`
- `quick_summary`
- `key_insights`
- `inspiration_questions`
- `podcast_script`
- `podcast_audio`
- `mind_map`
- `ppt_outline`
- `ic_qa`
- `wechat_article`

设计师不要展示 raw kind。需要映射成用户可读名称，例如：

- 实时笔记
- 追问助手
- 发布文稿
- 会议纪要
- 快速摘要
- 投研 Q&A
- 公众号长文

### 7.5 术语确认

| 动作 | API | 方法 | 前端要求 |
| --- | --- | --- | --- |
| 获取澄清项 | `/api/jobs/{id}/clarifications` | `GET` | 如展示，放在任务详情或侧栏 |
| 新增澄清 | `/api/jobs/{id}/clarifications` | `POST` | 保存用户补充信息 |
| 确认术语 | `/api/jobs/{id}/confirm-terms` | `POST` | accept / edit / reject 后继续任务 |

`needs_review` 是正常流程，不是失败。UI 应该像 ReadMe 文档里的“需要补充信息”卡片，而不是红色错误。

### 7.6 Live 实时采集

| 动作 | API | 方法 | 前端要求 |
| --- | --- | --- | --- |
| 音频网关健康检查 | `/api/live/audio/health` | `GET` | 后台 warmup，不需要用户看到 |
| 开始 live audio session | `/api/jobs/{id}/live/audio` | `POST` | 进入 realtime ASR |
| 查询 live audio snapshot | `/api/jobs/{id}/live/audio` | `GET` | 可用于恢复状态 |
| 保存实时录音资产 | `/api/jobs/{id}/live/audio-asset` | `POST` | 停止后保存音频 |
| 同步/结束 live 文稿 | `/api/jobs/{id}/live` | `POST` | 保存 transcript snapshot、生成 draft artifacts |

Live 采集模式：

- 面对面：本机麦克风。
- 会议 App：屏幕/窗口分享并勾选系统音频。
- 浏览器页面：选择 tab 并分享音频。

Live UI 必须是核心体验，不是小录音 widget：

- 左侧：实时转写流。
- 右侧：实时笔记 + 追问助手。
- 顶部：状态、计时、暂停/停止。
- 底部：手动补充笔记。
- 波形只能用真实音频 level；没有音频时用静态安静状态，不做假跳动。

## 8. Settings 页面真实数据

设置页读取：

- Supabase Auth 用户邮箱。
- 用户 metadata：`full_name`、`avatar_url`。
- 当前 plan：`free` / `pro`。
- 文件大小限制：Free 50MB，Pro 默认 500MB。
- Free 每月 job 上限：10。
- usage counters：已使用文件数 / job 数 / 周期结束时间。

Settings UI 必须包含：

- 头像上传。
- 姓名编辑。
- 邮箱只读。
- Light / Dark / System 三段式主题。
- 当前套餐和用量进度。
- Pro+ 申请 CTA。

不要展示：

- Supabase project-level storage 技术说明。
- Stripe webhook 或 subscription 内部字段。
- service role / env 相关信息。

## 9. ReadMe 风格动画要求

动画要少，但要准确。

| 场景 | 动画要求 |
| --- | --- |
| 首页大标题 | 可做短词切换，类似 ReadMe hero 中关键词变化；不要一直闪 |
| 产品预览进入 | 轻微 fade + translate，200-320ms |
| View / Edit 或模式切换 | segmented control 滑块移动，180-240ms |
| 打开成果面板 | 右侧 pane slide/fade，180-260ms |
| 关闭成果面板 | 不挤压主内容，平滑收起 |
| Live 转写 | 新文本追加时保持滚动锚点，不跳屏 |
| Live 追问助手 | 建议逐条替换，不整栏闪烁 |
| 生成成果 | 按钮进入 pending，成果内容逐步出现 |
| 错误提示 | 小 toast 或 inline alert，不能突然弹大 modal |

动画禁区：

- 不做大面积背景渐变动画。
- 不做循环漂浮装饰。
- 不做和真实状态无关的假 loading。
- 不做让按钮位置变化的 hover 动画。

## 10. 组件与按钮规则

### 10.1 可以出现的按钮

| 按钮 | 必须连接的真实动作 |
| --- | --- |
| Start live session / 开始实时访谈 | 创建 project/job，进入 live |
| Upload / 上传 | 文件选择 + `/api/jobs` |
| Import URL / 导入链接 | `/api/projects/{id}/sources` |
| Process / 开始处理 | `/api/jobs/{id}/run` |
| Generate / 生成成果 | `/api/jobs/{id}/artifacts` |
| Copy / 复制 | 复制真实 artifact content |
| Download / 下载 | `/api/artifacts/{id}/download` |
| Favorite / 收藏 | `/api/favorites` |
| Save Changes / 保存更改 | Supabase Auth updateUser |
| Apply for Pro+ / 申请 Pro+ | 进入设置或申请流程；无真实支付页时只作为明确 CTA，不假装已购买 |

### 10.2 不允许出现的按钮

- 没有后端的 Share、Invite、Team、Export All。
- 不能点击的假通知铃铛。
- 假帮助中心。
- 假 AI Ask 输入框。
- 假搜索框。
- 静态 card 上的 fake menu。

如果设计上需要占位，只能用非 button 的静态文本，或者明确 disabled 并写出原因。

## 11. 中英文要求

必须做纯中文和纯英文两套 copy：

| 语言 | 路由 | 要求 |
| --- | --- | --- |
| 中文 | `/zh/...` | 除产品名和技术格式外全部中文 |
| 英文 | `/en/...` | 除产品名外全部英文 |

不要出现：

- 中文页里的 `Live notes`、`Question coach`。
- 英文页里的 `实时笔记`、`追问助手`。
- 乱码。
- 后端 raw kind 直接暴露。

## 12. 页面级设计要求

### 12.1 首页 / 登录前入口

参考 ReadMe 首页，但内容属于 Kemo：

- 顶部导航：Kemo.AI、产品、登录、注册。
- Hero：一句非常清楚的产品定位。
- 产品预览：展示两段式工作台，而不是抽象插画。
- CTA：邮箱/注册。
- 动画：关键词轻微切换；产品预览卡片轻微进入。

### 12.2 工作台

参考 ReadMe 文档产品预览：

- 左侧：窄导航。
- 中间：当前项目和最近访谈。
- 右侧：Artifacts。
- 空状态：引导创建真实 live 或导入资料。
- 不能放 Sarah、Focus Group、Product Feedback 这类假样例。

### 12.3 Job 详情

需要展示：

- 标题。
- 状态。
- 转写内容。
- 术语确认。
- 可生成成果。
- 已生成成果。
- 来源资料。

### 12.4 Live 页面

必须采用深色实时模式：

- 顶部状态条。
- 计时。
- pause / stop。
- 左侧 transcript。
- 右侧 live notes / coach。
- 手动 note 输入。

按钮逻辑：

- 没有 project 时，先创建默认 project。
- 没有 job 时，先创建 live job。
- 麦克风/屏幕权限失败要恢复按钮状态并显示错误。
- 停止后保存 transcript 和 draft artifacts。

### 12.5 Settings

参考用户提供的 Settings & Plan 页面：

- Profile。
- Appearance。
- Usage & Plan。
- CTA：尽快申请到 Pro+ / Apply for Pro+。

数据必须来自后端，不使用 Dr. Elena、research.institute 之类占位。

## 13. 状态设计清单

每个核心模块必须有这些状态：

- loading
- empty
- ready
- pending
- error
- disabled with reason

特别注意：

- 上传中不能重复提交。
- 生成成果中不能反复点生成。
- Live starting 不能卡死；失败要回到可操作状态。
- 搜索没有 project 时不要展示假结果。
- 下载链接不存在时不要显示下载按钮。

## 14. 设计交付物

前端设计师需要交付：

1. 中文版全流程设计。
2. 英文版全流程设计。
3. 桌面端三栏工作台。
4. 移动端折叠工作台。
5. Live 深色实时模式。
6. Settings & Plan。
7. Empty/error/loading/pending 状态。
8. 动画说明：每个动画在哪个状态触发、持续时间、退出方式。
9. 按钮动作清单：每个按钮对应路由/API/disabled 原因。

## 15. 验收标准

设计通过的标准：

- 第一眼像 ReadMe 这种成熟 SaaS/文档产品，而不是普通后台模板。
- 两段式结构清楚：入口层展示产品，登录后工作台承接真实业务。
- 所有按钮都有真实动作或明确 disabled 原因。
- 没有假数据、假搜索、假通知、假 AI 输入。
- 中文页全中文，英文页全英文。
- 所有后端状态都能在 UI 中找到对应呈现。
- Live 流程能解释清楚：创建 project、创建 live job、获取权限、实时转写、生成 draft、停止保存。
- 设计稿可以直接交给工程实现，不需要工程再猜后端有哪些能力。

