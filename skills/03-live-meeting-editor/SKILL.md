---
name: live-meeting-editor
description: 在会议进行中实时把 ASR（语音转文字）原始稿滚动整理成可读的对话稿。当上游应用按固定节奏（通常 5 分钟一次）投喂 ASR 片段，要求按"会前简报 / 滚动整理 / 实时校正 / 最终成稿"四种模式之一处理时，必须使用此 skill。也适用于用户在 Claude 网页里手动测试这套协议——粘贴一段 ASR 进去看整理效果。触发词包括但不限于："实时整理""滚动整理""分段整理""会议中""ASR""转写整理""每隔几分钟整理一次""边开会边整理""live transcript"。注意：此 skill 不是事后整理（那是 interview-editor，要求一次性看到全文）、不是会议纪要（那是 meeting-minutes，按要点结构化）、不是提炼洞见（那是 insight-extractor）。此 skill 的核心特征是**分段心跳 + 状态累积**——每次只处理一小段，但跨段之间维持术语表、人物表、未完成尾巴的连续性。
---

# Live Meeting Editor

这是一份**给 LLM 自己阅读**的协议文档，不是给最终用户读的。

最终用户使用的是一个独立的录音/转写 App。App 每隔约 5 分钟，把刚刚采集到的 ASR 文字加上当前会议状态，按固定的 XML 协议发给 Claude，由 Claude 返回整理好的对话稿和状态更新。这份 SKILL.md 就是那份协议的完整定义。

整理风格完全继承 [interview-editor](../interview-editor/SKILL.md)。本文件只描述**调度逻辑**——如何分段、如何衔接、如何校正、如何累积状态——不重写整理标准。

---

## 一、四种工作模式

每次调用必须以一个 `<instruction>` 标签开头，指定当前模式。识别不到模式时，**默认按 `process` 处理**。

| 模式 | 触发标签 | 何时使用 | 职责 |
|------|---------|---------|------|
| Briefing | `<instruction>brief</instruction>` | 会议开始前，App 投入会前材料 | 阅读材料，输出会议简报 / 术语表 / 人物表 |
| Process | `<instruction>process</instruction>` | 会议中，每 5 分钟触发一次 | 整理新一段 ASR，更新状态，必要时保留尾巴 |
| Correct | `<instruction>correct</instruction>` | 用户在 App 里点"校正"按钮 | 修改已整理内容或更新术语表 |
| Finalize | `<instruction>finalize</instruction>` | 会议结束，用户点"完成" | 输出完整最终稿和会议术语表 |

---

## 二、Briefing 模式

### 输入格式

```xml
<instruction>brief</instruction>
<materials>
  <material name="某某BP.pdf">...材料原文...</material>
  <material name="pre-DD笔记.md">...材料原文...</material>
</materials>
<meeting_info>
  <type>创始人访谈 / 客户访谈 / 内部讨论 / 其他</type>
  <expected_duration>60分钟</expected_duration>
  <known_attendees>王立群（创始人）、张明（投资人）</known_attendees>
</meeting_info>
```

`materials` 和 `meeting_info` 都是可选的。如果都没有，输出一份空白的初始状态。

### 输出格式

```xml
<briefing>
<summary>
2-3 句话概括本次会议背景：项目是做什么的、当前进展、本次会议关键议题。
</summary>

<terminology>
专有名词|读音/拼写说明|备注
埃贝光学|不是"阿贝光学"|公司全称 Aibei Optics
纳米压印|—|核心工艺
衍射光波导|—|产品类别
</terminology>

<people>
角色|姓名|身份|备注
host|王立群|埃贝光学创始人/CEO|清华光学博士
guest|—|投资人|姓名待会议中识别
</people>

<key_topics>
- 技术壁垒与工艺路径
- A 轮融资进展
- 客户结构与订单能见度
</key_topics>

<watch_list>
ASR 识别时容易出错、需要特别留意的词：
- "埃贝" 容易被识别成 "阿贝" / "爱贝"
- "歌尔" 容易被识别成 "哥尔"
- 数字类：营收、份额、轮次估值
</watch_list>
</briefing>
```

### 关键规则

1. **不要编造**。材料里没写的就留空或写"—"，绝不脑补。
2. **不要写整理稿**。Briefing 模式只产出状态对象，不产出对话内容。
3. **watch_list 是核心价值**。从材料里推断哪些词在 ASR 转写时大概率会出错，提前列出来，process 阶段就能自动校正。

---

## 三、Process 模式（核心）

### 输入格式

```xml
<instruction>process</instruction>

<context>
  <briefing>
    ...上一轮 briefing 的完整输出，原样回传...
  </briefing>
  <terminology>
    ...截至当前的术语表（包括 briefing 阶段建立的 + 历次 process 新增的）...
  </terminology>
  <people>
    ...截至当前的人物表...
  </people>
  <previous_tail>
    ...上一轮 process 返回的 unprocessed_tail 原文，如果没有则留空...
  </previous_tail>
  <last_two_lines>
    ...上一轮已整理稿的最后两行，用于检查衔接是否自然...
  </last_two_lines>
</context>

<new_transcript>
  ...刚刚 5 分钟的 ASR 原文，可能很乱、有错字、有口语停顿...
</new_transcript>
```

### 处理步骤（必须按顺序）

**Step 1：拼接**
把 `<previous_tail>` 和 `<new_transcript>` 拼成一段完整的待处理文本。tail 在前，new 在后。

**Step 2：识别"语义闭合点"**
从拼接后的文本中，找到**最后一个明显的语义闭合点**，作为本轮整理的截止位置。判断标准：
- 一个完整问答的结束（一个人问完，另一个人答完）
- 一个话题明显切换（例如说话人开始转入下一个议题）
- 一个长段独白的自然停顿（句号 + 较长停顿 + 内容明显告一段落）

**最后一个闭合点之后**的内容，整段保留为 `unprocessed_tail`，不整理。

如果整段文本都是连续未闭合的（例如说话人正在长篇陈述），则**整个 new_transcript 都作为 tail 返回**，本轮 polished_segment 为空，并在 notes 里说明原因。

**Step 3：按 interview-editor 标准整理闭合部分**
对截止位置之前的部分，严格按 `interview-editor` 的整理标准处理：
- 删除时间戳、说话人编号、纯噪声词、机械重复
- 修正错别字、ASR 识别错误的专有名词（**优先参考 terminology 和 watch_list**）
- 不总结、不改写、不调整语序、不补充背景
- 同一说话人连续发言不重复打标签
- 话题切换 3-8 次才插入一次小标题（频率宁少勿滥）

**重要**：**首次 process 输出时不要写文章标题**。标题是 finalize 阶段才生成的东西。process 模式只输出对话内容本身。

**Step 4：检查衔接**
对照 `<last_two_lines>`，确认本轮开头和上一轮结尾衔接自然：
- 如果上一轮结尾是某说话人讲到一半（被 tail 截断），本轮开头不要重复打标签
- 如果上一轮结尾是一个话题，本轮开头是新话题，可以考虑插入小标题

**Step 5：更新状态**
对比 context 里的 terminology 和 people，列出本轮**新发现**的项目。
对于不确定的（比如新出现的人名、ASR 识别不清的术语），用 `[?xxx]` 标注，并放入 uncertainties。

### 输出格式

```xml
<polished_segment>
（如果整理出了内容，markdown 格式的对话稿放在这里。注意：纯净的对话稿，不要标题、不要前言、不要"以下是整理结果"之类的话。）

王立群：
我们这套纳米压印工艺，从研发到量产花了三年时间……

张明：
量产阶段最大的卡点是什么？

王立群：
其实是良率。早期良率只有 30% 左右，去年才爬到 [?75%]……
</polished_segment>

<unprocessed_tail>
（最后一个语义闭合点之后的原文，原样保留，不整理。如果没有 tail 则留空标签。）
</unprocessed_tail>

<state_updates>
  <new_terminology>
  歌尔股份|—|客户
  阵列光波导|—|产品分类
  </new_terminology>
  <new_people>
  guest|张明|投资人|本轮自报姓名
  </new_people>
  <uncertainties>
  - 良率数字 "75%" 听不清，标注为 [?75%]，待用户确认
  - "某 H 客户" 王立群仍未点名
  </uncertainties>
  <notes>
  （可选。如果本轮发生异常情况，比如整段都是 tail 没产出 polished、或者 ASR 质量极差大量内容标 [识别不清]，在这里说明。常规情况留空。）
  </notes>
</state_updates>
```

### 关键规则

1. **绝对不要总结**。哪怕只是一两句的概括也不行。这是字幕级逐字还原任务。
2. **绝对不要重发上一轮已整理过的内容**。`polished_segment` 只包含本轮新整理的部分。
3. **tail 必须原样保留**。不要"顺便先整理一下 tail 的开头"——那会和下一轮拼接时产生重复。
4. **terminology 和 watch_list 必须发挥作用**。如果 watch_list 里写了"埃贝容易被识别成阿贝"，本轮 ASR 出现"阿贝"时无条件改成"埃贝"，不要再问用户。
5. **不确定的人名/术语用 `[?xxx]` 标注**，宁可留疑问也不能删内容（这条来自 interview-editor）。
6. **App 端不会回传完整累积稿**。Claude 在每一轮 process 中只看到 last_two_lines 和 previous_tail，必须信任这两个上下文足够维持衔接。如果发现 last_two_lines 和当前内容明显冲突（比如说话人对不上），在 notes 里报告。

---

## 四、Correct 模式

App 把用户在界面上发起的校正请求翻译成此模式调用。校正分两类，由 `<correction_type>` 区分。

### 类型 A：术语校正（影响后续所有 process）

```xml
<instruction>correct</instruction>
<correction_type>terminology</correction_type>

<context>
  ...同 process 模式的 context...
</context>

<correction_request>
  <description>"埃贝" 应该写成 "埃贝光学"，公司名要写全称。另外"海康威视"在 2010 年还叫"海康"，请按时间区分。</description>
</correction_request>
```

**处理**：
- 解析用户意图，更新术语表
- 不重写已整理内容（除非用户明确要求）
- 输出更新后的完整 terminology

```xml
<state_updates>
  <updated_terminology>
  ...完整术语表，包含本次更新...
  </updated_terminology>
  <change_log>
  - "埃贝" → "埃贝光学"（统一用全称）
  - 新增规则：2010 年前的引用写"海康"，2010 年后写"海康威视"
  </change_log>
</state_updates>
```

### 类型 B：内容校正（修改已整理稿的某一段）

```xml
<instruction>correct</instruction>
<correction_type>content</correction_type>

<context>...</context>

<correction_request>
  <target_segment>
  （用户要修改的那一段已整理稿，原文）
  王立群：
  ……成本能砍到原来的三分之一不到。
  </target_segment>
  <description>"三分之一不到" 听错了，应该是 "五分之一"</description>
</correction_request>
```

**处理**：
- 只修改 target_segment 内的对应内容，**不要扩大修改范围**
- 输出修改后的整段

```xml
<corrected_segment>
王立群：
……成本能砍到原来的五分之一。
</corrected_segment>

<state_updates>
  <updated_terminology>
  ...如果这次校正涉及一个会反复出现的事实（比如成本压缩比例），把它加入术语表，避免下次再错...
  </updated_terminology>
  <change_log>
  - 数字修正：成本压缩比例 1/3 → 1/5
  - 已加入术语表，后续 process 会自动按 1/5 处理
  </change_log>
</state_updates>
```

### 关键规则

1. **校正不要顺便"优化"**。用户只让改 A，就只改 A，不要顺手把旁边的语序也"改得更顺"。
2. **可推广的校正要写进术语表**。一次性的校正（比如某句话听错了）只改这一处；规律性的校正（比如人名、公司名、反复出现的数字）必须加入术语表，让后续 process 自动遵守。
3. **保留原对话的口语风格**。校正只换错的部分，不要把"那个那个"补回去也不要把保留的口语部分变得书面化。

---

## 五、Finalize 模式

### 输入格式

```xml
<instruction>finalize</instruction>

<context>...同 process...</context>

<all_polished_segments>
  ...历次 process 输出的 polished_segment 全部拼接，按时间顺序...
</all_polished_segments>

<final_tail>
  ...最后一轮没整理完的 tail，如果有...
</final_tail>

<meeting_info>
  <title_hint>埃贝光学创始人访谈</title_hint>
  （可选。用户在 App 里输入的会议标题。没有的话由 Claude 生成。）
</meeting_info>
```

### 处理步骤

1. **整理 final_tail**（如果有）。这是最后一段没闭合的内容，finalize 时不再保留 tail，直接整理完。
2. **生成标题**。格式：`「主标题 | 对谈：嘉宾1身份 & 嘉宾2身份…」`（继承自 interview-editor）。
3. **检查整体连贯性**。检查全文有没有重复段落、有没有说话人标签错乱。
4. **小标题层级最终化**。按全文话题流，把小标题位置确定下来（process 阶段插入的可能过密或过疏）。
5. **输出完整成稿 + 术语表**。

### 输出格式

```xml
<final_transcript>
「埃贝光学：押注衍射光波导的下一个十年 | 对谈：投资人张明 & 创始人王立群」

**从清华到海康，再到埃贝**

张明：
王总你好，先简单介绍一下自己。

王立群：
好的。我 2006 年从清华博士毕业……

（全部对话内容，按 interview-editor 标准）
</final_transcript>

<final_terminology>
（本次会议最终的完整术语表。下次见同一项目时，App 可以把它作为 briefing 阶段的输入材料，实现跨会议复用。）

埃贝光学|公司全称 Aibei Optics|核心标的
纳米压印|—|核心工艺
衍射光波导|—|产品类别
歌尔股份|—|客户
...
</final_terminology>

<final_people>
host|王立群|埃贝光学创始人/CEO|清华光学博士，前海康/海康威视
guest|张明|XX资本投资人|—
</final_people>

<unresolved>
（如果还有未解决的 [?xxx] 标注，列在这里，提示用户最终人工确认。如果没有，留空。）
- 第3段一处数字 "[?75%]" 仍未确认
</unresolved>
</final_transcript>
```

### 关键规则

1. **finalize 输出的是定稿**。不再有 tail，不再有 process 状态对象。
2. **保持本次会议所有内容**。不要因为成稿要"漂亮"就开始压缩或删减——这违反 interview-editor 的核心原则。
3. **`unresolved` 是给用户的最后一道关卡**。所有 [?xxx] 标注必须列出来，让用户人工拍板。

---

## 六、错误处理与边缘情况

### 情况 1：context 不完整或缺失

App 调用时如果 context 缺失（比如第一次 process，没有 briefing），按以下顺序处理：
- 没有 briefing：terminology 和 people 当作空表，依靠 ASR 内容自行识别
- 没有 previous_tail：从 new_transcript 开头处理
- 没有 last_two_lines：本轮整理时不强求衔接，按独立段落处理
- 在 `<state_updates>/<notes>` 里说明缺失情况

### 情况 2：ASR 完全是乱码

如果 new_transcript 里超过 50% 内容明显是噪音/识别失败：
- 不要硬整理
- polished_segment 留空
- unprocessed_tail 也留空（不要让乱码污染下一轮）
- 在 notes 里写明："本段 ASR 质量过低，建议用户检查录音设备"

### 情况 3：用户在 process 模式输入里直接夹带校正

例如 App 没有按协议走，用户把"刚才那段把'阿贝'改成'埃贝'"和新一段 ASR 混在一起发过来。
- 在 polished_segment 里按校正后的术语处理新内容
- 在 state_updates 里把校正反映到 terminology
- 在 notes 里提示："检测到 new_transcript 中混入校正指令，已合并处理。建议 App 端使用 correct 模式调用以获得更精确的控制。"

### 情况 4：说话人识别冲突

如果 ASR 给的说话人编号和 people 表对不上（比如 people 里说话人 1 是王立群，但本段语气明显不像）：
- 优先按语义判断
- 在 notes 里报告冲突，让 App/用户决定

---

## 七、给在 Claude 网页里手动测试的用户

如果你（人类用户）正在 Claude 网页里直接试这个 skill——也就是没有走 App，而是手动粘贴内容来测试协议——可以这样用：

**会前**：
> 我要开始测试 live-meeting-editor。模式：brief。
> 材料：[贴上 BP 内容]
> 会议类型：创始人访谈

**会中**（每次粘 ASR 进来）：
> 模式：process。
> 上一轮 tail：[粘贴]
> 上一轮最后两行：[粘贴]
> 新转写：[粘贴]
> （术语表和人物表用上一轮输出的）

**校正**：
> 模式：correct。类型：terminology。
> 校正：把"阿贝"统一改为"埃贝光学"。

**结束**：
> 模式：finalize。
> 全部已整理段落：[粘贴]
> 最后的 tail：[粘贴]

如果你嫌每次都拼 XML 太麻烦，也可以用自然语言说"现在是 process 模式，这是新一段……"，Claude 会自行映射到协议格式处理。但 App 调用时**必须严格走 XML**，否则解析端没法稳定工作。

---

## 八、设计准则速查

写到这里，把贯穿全文的几条铁律再列一遍：

1. **整理风格一律继承 interview-editor**——字幕级逐字还原，不总结、不改写、不调整语序、不补充背景。本 skill 只新增"分段调度"逻辑。
2. **状态由 App 维护，Claude 无记忆**。每一轮调用必须自带 context。Claude 不能假设"上次记得什么"。
3. **tail 机制是核心**。宁可让本轮少整理几句（保留为 tail 等下轮拼接），也不要把半截话拦腰截断硬整理。
4. **术语表是质量飞轮**。每次校正都尽量沉淀进术语表，让后续 process 越来越准。
5. **不确定的内容用 `[?xxx]` 标注，绝不删除**。
6. **输出严格按 XML 格式**。App 端用 XML 解析器抓取，任何格式漂移都会破坏自动化流水线。
