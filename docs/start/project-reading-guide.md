# 看哪个 Agent 项目：按你想解决的问题选源码

开源 Agent 项目很容易越收藏越多。真正有效的读法是先提出一个工程问题，再挑一套能把这个问题讲清楚的实现：模型怎样调用工具？长任务怎样恢复？消息从不同渠道进来以后怎样路由？浏览器页面变化后怎样重新定位？每读一个项目，都用一个小实验验证自己的理解。下面是一条从课程到真实产品的选读路线，学习时不必全部安装，也不必按热门程度逐个刷完。

## 先选一条主线

| 你当前最想弄懂 | 建议先看 | 完成后应能做的验证 |
| --- | --- | --- |
| Agent 的模型—工具—反馈循环 | Hugging Face Agents Course | 解释一次 tool call 的输入、执行者和返回结果 |
| 从场景到生产的设计权衡 | Microsoft AI Agents for Beginners | 为一个 RAG/工具应用写出评测、权限和上线条件 |
| 编码 Agent 内部的 Harness | learn-claude-code | 在最小 loop 上加入权限、压缩、任务与恢复 |
| 消息入口与长运行 Gateway | claw0 | 解释消息如何进入 session、路由到 Agent、可靠投递 |
| 真实个人 Agent 的产品边界 | OpenClaw 或 Hermes Agent | 比较渠道、记忆、Skill、授权和主机执行风险 |
| 多能力长任务平台 | DeerFlow 2.0 | 找出子 Agent、沙箱、记忆和产物如何协作 |
| 网页可观察、可点击的动作 | Browser Use | 复盘一次公开网页任务的观察、动作与失败恢复 |
| IDE 怎样连接 Coding Agent | Agent Client Protocol（ACP） | 区分编辑器—Agent、Agent—Tool、Agent—Agent 三条边界 |

每一行都是不同的学习问题，不是“高级项目覆盖初级项目”。如果你刚会调用模型 API，先把第一行跑通；如果已有后端经验但总被面试追问权限和恢复，可直接从 learn-claude-code 开始。用同一个窄任务贯穿几套实现，才能比较它们新增的能力和代价。

## 第一站：用课程建立可解释的基础

Hugging Face Agents Course 从工具、动作、观察与消息格式讲起，再用 smolagents、LlamaIndex、LangGraph 展示不同框架，最后有 Agentic RAG、最终项目和评测补充。它适合还分不清“模型返回一个工具调用”和“宿主真正执行工具”的读者。先读基础单元，再挑一个框架实践，不必把三套 API 同时背下来。练习可以只用 `calculator` 与 `search` 两个工具：记录模型何时调用、参数是否通过校验、工具空结果如何进入下一轮、何时停止。

Microsoft AI Agents for Beginners 更适合在“会写最小 loop”之后拓宽系统设计视角。它当前课程主线覆盖设计模式、Tool Use、Agentic RAG、可信 Agent、规划、多 Agent、协议、上下文、记忆、Computer Use、部署和安全。读时先围绕一个自己的应用选 4–5 课，例如“工具→RAG→评测→部署→安全”，每学一课给现有项目补一个能测试的机制。当前代码样例以 Microsoft Agent Framework 和 Microsoft Foundry Agent Service V2 为主；看代码前先确认云账号、模型服务和课程配置要求。若暂时没有云资源，先读机制与练习题，不要把运行某个厂商示例当作掌握 Agent 的唯一标准。

本网站已把这两套课程按章节整理成中文文章，适合先在站内理解，再到项目仓库运行示例。验收的关键仍是解释自己的输入、状态和失败路径，而不是完成页面打卡。

## 第二站：拆一套编码 Agent Harness

learn-claude-code 的优势是把一个工具循环逐步扩成真实 Harness。当前应沿根目录 `s01` 到 `s17` 阅读：前几课看 loop、工具、权限和 Hooks；中段看子 Agent、Skill、上下文压缩、记忆、任务系统与后台任务；后段看调度、团队、MCP、集成 Harness、工作流和目标完成条件。仓库里的 `docs/` 与 `agents/` 还保留旧 12 课迁移材料，旧新章节编号并不总一致。不要按一个旧链接的“s03”去对照当前根目录的“s03”。

最有价值的读法是做“增量差异”：在 `s01` 只画模型→工具→观察循环；到 `s03` 看哪些操作被允许、拒绝或要求批准；到上下文压缩课，检查用户目标、未完成项与工具结果怎样留下；到任务系统与后台任务课，模拟“外部动作成功但响应丢失”，问系统凭什么不重复执行。最后对照集成 Harness 看这些机制怎样回到同一个 loop。本站的逐章稿可作为中文课堂，但验证时仍要运行对应章节代码并看实际日志。

如果只为理解 RAG 或做客服助手，不一定要学到多 Agent worktree；如果目标是 Coding Agent 工程岗，权限、状态恢复、Hook 与最终验收则不能跳过。读完可交付一张从用户命令到工具执行的控制权图、一条失败 trace，以及一项你亲自改出的工具或策略测试。

## 第三站：从“单个 Agent”走向“长期在线的入口”

claw0 把焦点从编码 Agent 内部，移到 Agent Gateway。当前十个渐进章节先做 loop、工具和 Session，再接不同消息渠道和 Gateway 路由，后续讲 prompt/记忆/Skill、心跳与定时任务、可靠投递、失败重试和并发 lane。它适合想弄懂“同一个助理怎样在 IM、CLI 与定时任务中持续工作”的人。先读 `s03` 的会话持久化，再读 `s04–s05` 的渠道归一与路由，然后选 `s08` 的可靠投递或 `s10` 的并发控制深挖；如果只关心最小工具循环，本站已有更短路径。

练习时让两个模拟渠道给同一用户发消息，检查会话标识能否正确隔离；再让一次消息在投递前发生故障，看恢复后是否重复发送。心跳任务应和用户主动消息区分来源、权限及取消方式。claw0 是教学用的渐进实现；不要把它的目录结构直接当作所有 Gateway 产品的生产规范。

OpenClaw 是实际运行在个人或团队环境中的 Agent 产品：Gateway 连会话、工具、事件和消息渠道，工具、Skill 与插件扩展能力。它更适合在懂得基础 loop 与 Gateway 后观察真实产品如何处理渠道连接、授权和主机动作，而不适合作为“安装后让它接入所有个人账号”的第一节课。先读 Gateway/Channels 的架构说明，再读安全与沙箱说明。特别注意：主会话的工具可以在宿主机运行，沙箱需要单独配置；接入外部发件人、共享部署或远程暴露前要明确配对与权限。学习实验尽量只用隔离测试账号和可撤销的只读动作。

Hermes Agent 同样提供 CLI、消息 Gateway、长期记忆、Skill、工具集和定时任务，适合对照“长期助理如何积累上下文与方法”。先读官方 Architecture，再分别看 Memory、Skills System、Messaging Gateway 与 Security；不要只比较首页功能词。可以用同一条任务在两套产品中画出“消息入口→会话→记忆/Skill→工具→回复”的路径，并标出谁能批准外部动作。若目标只是学习原理，两套产品选一套深读即可；另一套作为边界对照，不必为了凑项目数都部署。

## 第四站：读多能力系统时先分清版本

DeerFlow 2.0 当前定位为支持子 Agent、记忆、沙箱和可扩展 Skill 的长任务 Harness。原 Deep Research 框架保留在 `1.x` 分支，2.0 是重写，不能把旧版论文或教程里的调用关系直接套到主分支。先读当前架构和核心功能，再选一个问题追踪：子任务如何分配与回收、沙箱里的文件怎样成为最终产物、上下文压缩后哪些状态仍可恢复，或多模型配置怎样保持授权边界。运行示例前先看安全配置，尤其是 shell、文件写入与沙箱模式；复杂产品 Demo 的成功不等于你已经理解内部状态机。

一个有用的验证任务是把同一份小型调研分别交给“单 Agent + 两个只读工具”和带子任务的方案，记录任务完成、引用质量、调用次数、延迟和人工接管。若复杂方案没有改善目标，就保留简单实现。这样读项目能得到架构判断，而不只是复述“它支持多 Agent”。

## 浏览器与 ACP：两个容易混淆的外部边界

Browser Use 解决的是 Agent 如何观察网页、定位元素并执行点击或输入；它既有可在自己代码里运行的开源库，也有让现有 Agent 使用浏览器的 CLI 和托管服务。先看开源库的最小例子与动作历史，再给公开、无登录的网页做一个只读提取任务：记录页面观察、选中目标、失败重试和最终证据。加入页面延迟、弹窗或元素变化，检查失败时能否停下和重新定位。不要把网页中的指令当成用户授权；登录、支付、删除和绕过网站规则不是入门练习。

ACP 则不负责控制网页，也不负责让 Agent 找工具。它标准化编辑器/IDE 与 Coding Agent 的通信，解决“每个编辑器都要为每个 Agent 做一套私有集成”的问题。它与 MCP 的边界不同：ACP 在宿主界面和 Agent 之间，MCP 常在 Agent/宿主与工具、数据源之间；A2A 面向 Agent 之间的协作。入门先读 ACP 的 Introduction 和 Architecture，画一个 IDE 向 Agent 发任务、Agent 回传状态或 diff 的时序图。官方文档当前明确本地子进程的 stdio JSON-RPC 路径；远程 Agent 的完整支持仍在推进，设计远程产品时应按当前协议版本核对，不宜把本地样例的能力直接推断为完整远程合同。

## 哪些项目暂时不排进主线

如果目标是学习 Agent 的最小可控系统，不需要同时读 CrewAI、AutoGen 和数套角色扮演框架；先用单 Agent 和确定性 Workflow 建基线，再在真实权限隔离或并行需求出现时选一个多 Agent 实现。GPT Researcher、Open Deep Research、STORM、Onyx、RAGFlow 等项目有各自价值，但都应由具体问题驱动：研究报告的引用质量、企业知识权限、文档解析或检索评测。没有这类问题时，它们会把时间变成产品安装和术语比较。

同理，Aider、OpenHands、SWE-agent、Codex、OpenCode、Goose 等 Coding Agent 很适合横向比较，但先拆透一套 Harness 的工具、权限、状态和测试，再挑一个与自己岗位相关的产品看差异。对“某框架是否先进”的判断，用同一任务集和失败样例验证，而不是用 star 数或页面截图。项目清单会继续变化，学到的应是选型方法和可复现的实验。

读每个项目时留下一页学习卡：你要回答的问题、实际阅读的模块、画出的控制路径、亲自运行的最小实验、一次失败和仍未知的边界。若只读 README，学习卡就诚实写“仅核对项目定位与入口”；没有运行和源码证据时，不要声称掌握了生产实现。完成两三个项目的这类卡片，比收藏几十个链接更能支撑面试中的系统设计回答。

## 面试会怎么问

**给你一个 Agent 项目，怎样判断先读哪里？** 先定任务问题，再读入口、一次执行路径、权限/状态、失败恢复和测试；从最小实验验证，而不是从所有目录顺序浏览。

**Coding Agent 与个人助理 Gateway 的学习重点为什么不同？** 前者强调仓库读写、diff、测试、权限和任务完成；后者还要处理渠道、会话路由、后台触发、可靠投递与外部发件人。共同底座仍是模型—工具—观察循环。

**ACP、MCP、A2A 怎么区分？** 分别画出编辑器—Agent、Agent—工具/数据源、Agent—Agent 三条连接。协议不自动解决身份与业务授权，外部动作仍要由宿主实施权限检查。

## 来源与延伸阅读

- [Datawhale Agent Learning Hub：Learning Todo List、Project Map 与 Project Ladder](https://github.com/datawhalechina/Agent-Learning-Hub)。本文依据其项目选读问题重新组织，未把项目清单视为已逐仓审计。
- [Hugging Face Agents Course](https://huggingface.co/learn/agents-course/unit0/introduction)、[Microsoft AI Agents for Beginners](https://github.com/microsoft/ai-agents-for-beginners)、[learn-claude-code 当前根目录课程](https://github.com/shareAI-lab/learn-claude-code)。本站已有这三套材料的逐章中文学习稿；项目仓库与课程仍可能更新。
- [claw0](https://github.com/shareAI-lab/claw0)、[OpenClaw 文档](https://docs.openclaw.ai/)、[Hermes Agent 文档](https://hermes-agent.nousresearch.com/docs)、[DeerFlow 2.0](https://github.com/bytedance/deer-flow)、[Browser Use](https://github.com/browser-use/browser-use)、[ACP 官方说明](https://agentclientprotocol.com/get-started/introduction)。本文核对的是截至 2026 年 9 月的官方 README/文档入口和项目定位，未对这些未归档仓库做源码级验证。
