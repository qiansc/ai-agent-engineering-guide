# 选 Agent 框架与平台，先看任务和企业边界

工具和平台名称很多，选型时先问系统要做什么：是快速做一个带工具的应用、编排长时间可恢复流程、让业务人员维护知识问答，还是在既有云和身份体系中部署。随后检查数据能否出域、工具与 IAM 能否接入、是否具备评测、trace、审计、私有化及长期维护能力。

## 按定位看技术选择

| 定位 | 代表方案 | 值得评估的场景 |
| --- | --- | --- |
| 通用 Agent SDK | OpenAI Agents SDK、Google ADK | 自定义工具调用、多 Agent 交接 |
| 状态图和工作流 | LangGraph | 长任务、检查点、人机协作 |
| 企业集成框架 | Semantic Kernel | .NET/Java、企业插件生态 |
| 数据与 RAG | LlamaIndex | 文档和数据密集型任务 |
| 多 Agent 协作 | AutoGen、CrewAI | 研究探索、角色分工 |
| 低代码 Builder | Dify、Coze、Copilot Studio | 快速 PoC、知识问答、标准流程 |
| 云托管平台 | Vertex AI Agent Builder、Bedrock Agents 等 | 已在对应云上的企业集成 |

OpenAI Agents SDK 提供 Agent、Tool、Handoff、Guardrails 与 Tracing 等构件；LangGraph 更重状态图、持久化和可恢复流程；Semantic Kernel 适合微软技术栈与企业插件集成；Google ADK 可结合 Google/Gemini 生态与多 Agent 能力。实际项目也可组合：工作流框架管状态，MCP 接工具，模型网关管理多模型，而不是强求一个框架包办所有层。

低代码产品适合业务专家维护标准问答与流程。Dify 常用于知识库与工作流、快速试验；Coze 可用于 Bot/Agent 快速搭建；Copilot Studio 对 Microsoft 365、Dynamics、Power Platform 用户更顺手。Vertex AI Agent Builder 与 Bedrock Agents 分别在 GCP、AWS 生态中提供托管与集成能力。具体功能、部署方式和价格会变化，正式采购或方案评审应对照当时官方文档验证。

## 把选型问题变成一张需求表

先列数据驻留和敏感等级、企业身份与角色、已有工具/API、知识库类型、任务长度、副作用、评测和审计要求、是否私有化/混合部署、团队语言与维护能力。对候选方案跑同一组真实任务，比较成功率、轨迹安全、P95 延迟、成功任务成本、迁移和平台锁定风险。若某方案的演示很快，但不能给工具调用加企业授权或导出完整 trace，它可能只适合 PoC。

## 一道完整的平台设计题怎样答

可以从七层组织方案：入口层接 Web、IM、API、IDE、Webhook 或定时任务；Builder 配 Agent 与测试；Runtime 执行模型循环、上下文、session/task 与工具；能力层提供模型网关、Tool/MCP/Agent Registry、知识与记忆；编排层管状态、审批、后台任务、重试与补偿；治理层管 IAM、多租户、Guardrails、数据分级与审计；AgentOps 层管 Eval Harness、Trace、成本、灰度和回滚。

讲架构时先明确业务场景、租户与数据边界，再画一次真实任务的调用路径。工具和数据先治理，再授权给 Agent；用户与 Agent 身份分离；默认只读、逐级开放写操作；副作用要可审计、可对账。上线前有自建评测集和灰度门槛，扩规模后再沉淀市场和模板。不要只把七层名称念完，面试官更关心关键授权与失败恢复怎样落地。

## 面试会怎么问

**OpenAI Agents SDK、LangGraph、Semantic Kernel、Google ADK 怎么选？** 根据任务是否需要轻量 SDK、复杂状态、微软企业集成或 Google 生态回答，并说明可以分层组合。

**低代码和云平台何时合适？** 对标准流程、已有生态和部署约束进行匹配；核心生产写入要核实权限、评测、观测与回滚。

**请设计企业 Agent 平台。** 先问场景和边界，再按入口、构建、运行、能力、编排、治理、运营七层走一条任务路径，重点讲授权、状态与事故处理。

## 来源与延伸阅读

- [AIGC Interview Book：企业级 Agent 平台与产品落地高频考点，第六章 Q025–Q028](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/07_%E4%BC%81%E4%B8%9A%E7%BA%A7Agent%E5%B9%B3%E5%8F%B0%E4%B8%8E%E4%BA%A7%E5%93%81%E8%90%BD%E5%9C%B0%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)、[LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)、[Semantic Kernel](https://learn.microsoft.com/en-us/semantic-kernel/)、[Google ADK](https://google.github.io/adk-docs/)
