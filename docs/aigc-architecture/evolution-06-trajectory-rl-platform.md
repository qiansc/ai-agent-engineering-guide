# Agent 轨迹如何进入评测、训练与系统设计

一个工具型 Agent 的轨迹，不只是最终回复，还包括消息、模型决定、工具调用及返回、环境变化和任务结果。它可以帮团队诊断失败、构造评测任务、改进工具 schema，也可在经过授权和脱敏后用于监督微调或强化学习。把轨迹用于训练前，必须先知道每一步对应什么环境状态和奖励，否则容易学到“说得像成功”的行为，而非真正完成任务。

## 轨迹应包含哪些信息

至少保存输入消息、结构化工具调用与结果、环境初始/最终状态、最终答复、评分与失败标签，以及模型、Prompt、工具版本。若保存模型推理或 Scratchpad，要遵守具体模型与平台的许可、隐私和保留规则，不能假设所有内部推理都可采集或用于训练。

同一轨迹可以服务几种不同目的：线上失败分析与回放；把失败固定为 Eval Harness 任务；发现高频成功流程并候选化为 Skill；检查工具 schema 是否诱发参数错误；生成经筛选的 SFT 数据；在交互环境里做 RL Rollout 和 Reward 设计。用途越靠近训练，越要严格去除用户信息、密钥与不可信工具内容，并记录数据授权与版本。

## 交互式 RL 环境怎样工作

一个常见闭环是：取 Dataset Item → 构造 Prompt 和初始环境 → Agent Loop 多轮调用模型与工具 → 环境产生状态变化 → Reward Function 根据测试或状态给奖励 → 保存 Rollout 用于训练或评测。

| 部件 | 职责 |
| --- | --- |
| BaseEnv | 管 Worker、服务、日志与任务环境 |
| Agent Loop | 多轮模型决策与工具调用 |
| ToolContext | 让工具和 Reward 访问同一个 Sandbox 状态 |
| Terminal/Browser/File 工具 | 提供真实交互动作 |
| Reward Function | 运行测试、检查文件或比较业务状态 |
| Tool Call Parser | 把模型输出适配成结构化工具调用 |

同一 `task_id` 要绑定同一沙箱，Reward 看到的状态才与 Agent 的动作一致。只按最终文本给奖励，会鼓励模型“报告完成”而不执行；只看测试也可能忽略安全越界。评测环境与训练环境可复用底层工具抽象，但训练中探索性动作不能获得生产权限。

## 为什么要单独设计 Tool Call Parser

模型和推理服务可能返回 OpenAI 风格结构化 `tool_calls`、XML/ChatML `<tool_call>` 标签、JSON 数组、Mistral `[TOOL_CALLS]` 标记，或在 Qwen、DeepSeek、Kimi、GLM 等不同模型/服务上采用各自的格式；原始 `/generate` 端点甚至可能只返回待解析的文本。Parser 要提取工具名与参数、保留普通文本边界、多工具顺序，并处理格式错误；训练时还可能生成 Token Mask 和 Reward 对齐信息。

解析器过于宽松会把网页或用户文本中的伪调用当成动作，过于严格则可能把合法但轻微格式错误的输出丢掉。解析失败应形成失败标签、可选择安全回退，并随模型版本升级测试。Parser 是模型输出协议与 Runtime 工具契约的适配层，而不是一段随手写的正则。

## 把所有模块组合成长期运行系统

系统设计题可按九层组织，但先讲一条主路径：CLI、Web、IM、Email、Webhook 或 Cron 送入入口适配；Gateway 归一化消息、路由 Session；Runtime 维持模型循环、任务状态、Interrupt/Resume 和后台执行；Provider Router 选择模型；Tool/Skill/Plugin 层提供能力；Memory/Context 层给当前任务必要信息；受控的 Self-improvement 层维护知识资产；Safety/Governance 检查每个副作用；Eval/Training 层从 Trace、Reward 与失败样本验证改进。

横切原则是：入口与运行时解耦，工具和技能版本化；自进化只修改获准的知识资产；后台复盘受限；外部副作用先鉴权和审批；Trace 脱敏并可审计；任何“自我改进”都要用固定 Harness 比较新旧任务表现。若新 Skill 让一个场景变好、另一个高风险场景变差，不能只看平均成功率就上线。

## 面试会怎么问

**问：轨迹数据能用于什么？** 先讲诊断、评测、Skill 候选和工具改进，再讲经授权的 SFT/RL；说明环境状态和安全标签与文本同样重要。

**问：Atropos 这样的交互式 RL 环境对 Agent 有何启发？** 按 Dataset、Agent Loop、ToolContext、Sandbox、Reward 和 Rollout 解释，举代码测试或数据库状态作为奖励证据。

**问：不同模型为何需要不同 Tool Call Parser？** 说清结构化调用与原始文本格式差异、边界与多工具顺序、格式错误和注入风险。

**问：设计自进化、多平台、长期运行 Agent？** 先用一条真实任务说明入口—Gateway—Runtime—工具—结果，再补 Session 隔离、恢复、安全、Curator 和评测；不要只画九个方框，必须说明版本、权限和失败回滚怎样贯通。

## 来源与延伸阅读

- [AIGC Interview Book：自进化 Agent 与多平台运行时，第 21–24 题](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/09_%E8%87%AA%E8%BF%9B%E5%8C%96Agent%E4%B8%8E%E5%A4%9A%E5%B9%B3%E5%8F%B0%E8%BF%90%E8%A1%8C%E6%97%B6%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
