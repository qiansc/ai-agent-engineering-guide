# Agent 框架怎么选：CrewAI、AutoGen、Google ADK、LlamaIndex 与图式运行时

框架比较常被做成一张“优缺点”表，然后给每个名字贴上标签：CrewAI 是多角色，LangGraph 是状态图，LlamaIndex 是 RAG。这些标签可以帮助入门，但不能直接决定项目选型。2026 年的框架功能不断重叠：CrewAI 同时有 Crews 和结构化 Flows，Google ADK 2.0 也有图式工作流，LlamaIndex 既有数据连接也有 Agent/Workflow。更稳妥的问法是：你的任务需要哪种**控制权**，现有框架把哪部分工作替你做好，仍有哪部分必须自己负责。

## 先辨认你需要的五种能力

一个框架可能同时属于多类，下面按“最想借用什么能力”来读，而非给产品贴永久标签。

| 你优先需要的能力 | 代表选择 | 先验证的边界 |
| --- | --- | --- |
| 轻量 Agent 循环、工具、交接和 trace | OpenAI Agents SDK 等通用 SDK | 身份授权、业务状态、厂商/模型约束 |
| 显式状态图、检查点、暂停与恢复 | LangGraph、ADK 2.0 Workflow、Microsoft Agent Framework Workflow | schema 迁移、外部副作用幂等、部署后端 |
| 有角色分工的协作与任务分配 | CrewAI Crews、部分多 Agent 框架 | 角色是否真的必要、信息丢失与重复推理 |
| 数据接入、检索和知识增强 | LlamaIndex Agent/Workflow | 文档权限、版本、召回与引用正确性 |
| 既有云与企业身份体系集成 | ADK、Microsoft Agent Framework 等 | IAM、数据边界、运营成本、迁移成本 |

这些选择可组合。例如数据层用 LlamaIndex 组织可检索资料，运行时用 LangGraph 管审批状态，工具服务通过 MCP 暴露。组合不是越多越好：每多一层抽象，就多一处版本兼容、trace 关联与错误归因。先用一个真实任务做纵向原型，证明组合带来明确收益。

## CrewAI：角色协作和受控流程是两种模式

CrewAI 的 Crews 把 Agent、Task 和协作流程组织在一起，适合能自然拆成“研究者收集材料 → 分析者核对 → 写作者成稿”的工作。每个角色应有不同资料、工具或验收职责；若只是给三个相同模型换名字，通常只会增加成本和信息传递损失。任务定义要写清输入、预期产物、依赖和最终谁验收，不能指望“多 Agent 互相讨论”自动提高准确率。

Flows 提供更结构化、事件驱动的执行路径和状态管理。比如供应商尽调先读取材料，再按确定规则分到“缺件补交”“常规审查”“高风险人工复核”；其中常规分析可以调用 Crew。这样固定规则由 Flow 控制，开放性分析才交给 Agent。若任务本来完全固定，只用 Flow 或普通工作流也可能足够，不必额外套一层 Crew。

上生产前要故意测试三个坏例子：研究 Agent 找到了过期材料、写作 Agent 遗漏关键反证、某 Task 失败后下游仍继续输出。好的多角色系统要记录每个结论来自哪一步、哪些资料经过了权限过滤、失败时是否阻断或请求人接手。角色分工不是安全边界，实际工具仍需独立授权。

## AutoGen：值得理解其思想，但新项目要看继任路线

AutoGen 曾推动多 Agent 对话、GroupChat 与事件驱动 Agent Runtime 的实践。它适合学习“消息如何在专员之间流动”“怎样让人加入讨论”“多个 Agent 如何形成共同产物”。但把几个 Agent 放进群聊并不等于编排完成：轮次何时结束、重复争论如何截断、工具权限由谁持有、最终答案由谁负责，都需要明确规则。

截至 2026 年 9 月，AutoGen 官方仓库明确标为**维护模式**，新项目建议考虑 Microsoft Agent Framework；既有项目可按官方迁移指南评估，而不是因为文章里仍列着 AutoGen 就默认它是首选。Microsoft Agent Framework 由 AutoGen 与 Semantic Kernel 相关团队推进，强调统一 Agent 抽象与类型化工作流。迁移不是改几个 import：AutoGen 的事件/群组式编排与继任框架的数据流工作流有不同控制模型，真实系统的状态、工具和观测要逐项映射。

这并非说已经运行的 AutoGen 项目必须立即重写。先看是否需要新特性、维护风险与迁移收益，再用回归任务集比较行为。一次性把多 Agent 编排全部替换，可能引入比继续维护更大的生产风险。

## Google ADK：不只是“Gemini 的多 Agent 框架”

Google ADK 支持定义 Agent、工具、会话与多 Agent 协作。早期常见的顺序、并行和循环模板适合可预测的子任务调度；ADK 2.0 进一步引入图式和动态工作流，可把模型节点、函数节点、工具、人类输入与条件路由组成更明确的执行图。把它简单说成“Google 的 CrewAI”会漏掉运行时控制方式，也会误导版本选择。

例如旅行变更助手要确认航班、检查费用、让用户批准、再执行改签。查询与费用规则可用确定性节点，解释可由模型完成，真正改签在审批之后执行。用 ADK 的图式工作流时，同样要设计状态字段、外部写入幂等和审批身份；框架能安排步骤，不会替航空接口确保交易唯一。

选择 ADK 时除了模型和云集成，还要看团队所用语言、当前 ADK 主版本、旧项目迁移成本、A2A/MCP 接入需求及部署方式。它可以接入 Google 生态，但“支持某协议”不代表企业认证、工具权限和审计已经自动到位。特别是 1.x 与 2.0 的 Workflow Runtime 有架构变化，新旧教程代码不要混用。

## LlamaIndex：让知识成为可核对的工具

LlamaIndex 的长处在数据接入、索引、检索和把知识能力交给 Agent。想做企业文档问答，第一步不是给模型一个名为 `search` 的工具，而是处理解析、切分、元数据、权限过滤、版本更新、召回、重排和引用。LlamaIndex 能提供这些模块及 Agent/Workflow 组合方式，但检索命中不等于答案正确。

假设员工问“这个合同能否提前终止”。知识层要找出当前有效合同、补充协议和适用条款，保证用户有权阅读；Agent 可以按需调用检索工具，比较条款并指出歧义；最终法律判断或外部承诺仍要由法务处理。若检索到旧版本合同，Agent 即便推理流畅也会答错。评测要分开看检索召回、引用定位和最终结论，才能定位问题在数据还是模型。

LlamaIndex 也提供事件驱动 Workflow 与 Agent 实现，不必假设它只能做 RAG。反过来，如果应用几乎不使用私有数据，也不需要复杂检索，仅有少量业务 API，单纯因为“Agent 项目”而引入完整知识框架可能没有收益。

## 用同一任务做选型实验

拿“处理供应商合规问询”做对照，而不是拿功能清单投票。准备二十条真实或脱敏样例，包含正常政策查询、缺失资料、相互冲突的版本、跨部门审批、工具超时和越权请求。先做一个固定 Workflow 加检索的基线；再试一个单 Agent；只有出现明确的角色边界或长任务状态需求，才引入 Crew、图式工作流或其他框架。

比较指标不止最终回答：要看引用是否准确、是否读取无权限资料、错误能否恢复、同一任务多次运行是否稳定、P95 时延、每次成功任务成本以及 trace 是否能还原决策。选型时再加工程条件：团队熟悉的语言、是否能自托管、依赖升级节奏、运行时可观测性、和既有 IAM/消息队列/数据库的连接成本。

一种常见结果是“框架 A 最快做出 Demo，框架 B 更容易表达复杂恢复，自研代码最容易贴合当前权限模型”。这些都不是绝对结论。把同一批任务、同样模型和工具合同放在候选实现中跑，才有比较意义。若一项业务本质上是固定步骤，直接保留普通程序不是落后，而是降低不必要的不确定性。

## 面试会怎么问

美团 2026 年 9 月一手复盘确实问到 LangChain、原帖写作“LongGraph”的方案与原生手写 Agent 的取舍。现场应先确认 `LongGraph` 是否指 LangGraph；不能把未经确认的拼写当确定事实。回答框架题时，先说任务的状态复杂度、数据密度、角色边界和企业约束，再谈候选方案。若回答“我做过”，要区分读过文档、做过原型、参与线上维护和自己负责的部分。

**问：多 Agent 框架一定比单 Agent 好吗？** 不一定。分工只有在权限、上下文或并行能力确实可分时才有价值；否则会增加协调成本和错误传播。用同一批任务比较准确率、成本、时延和可追溯性，再决定是否拆角色。以上是教学性的回答思路，不是面经候选人的现场答案。

## 来源与延伸阅读

- [AIGC Interview Book：AIGC 时代 AI Agent 基础高频考点，第四章 Q016、Q019](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/01_AIGC%E6%97%B6%E4%BB%A3AI%20Agent%E5%9F%BA%E7%A1%80%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [CrewAI 官方概念](https://docs.crewai.com/core-concepts/Agents)、[LangGraph 官方总览](https://docs.langchain.com/oss/python/langgraph/overview)、[LlamaIndex Agent 指南](https://developers.llamaindex.ai/python/framework/understanding/agent/)
- [Google ADK 2.0 官方说明](https://adk.dev/2.0/)、[图式工作流](https://adk.dev/graphs/)、[AutoGen 官方仓库维护状态](https://github.com/microsoft/autogen)、[Microsoft Agent Framework 迁移指南](https://learn.microsoft.com/en-us/agent-framework/migration-guide/from-autogen/)
- [美团 AI Agent 一面复盘](https://www.nowcoder.com/feed/main/detail/50bcdc47e7754aa7be59b6318fea514b)
