# 企业 Agent 协议平台：工具、远程 Agent 与治理怎样接起来

企业协议平台要让工具和 Agent 能复用，也能解释每一次调用是谁发起、访问了什么、为什么被允许、产生了什么结果。它比“列出最多的 MCP Server”更重视身份、版本、审计和失败恢复。这里讲协议接入层；模型选型、产品 Builder 与商业运营属于更大的企业 Agent 平台范围。

## 先按职责拼装

业务系统原有 OpenAPI 可被包装成宿主内 Function Tool，或由 MCP Server 标准化暴露。MCP Registry 记录工具能力、版本与风险，Tool Gateway 控制调用；A2A Registry 根据 Agent Card 发现独立服务；编排层用状态机管理取数、委托、审批和发布。Agent SDK 或框架提供模型循环、工具调用、handoff、guardrail 与 trace，但不替代业务权限。

| 层 | 核心责任 | 需要保存的关键状态 |
| --- | --- | --- |
| 入口/Host | 接收 Web、IDE、IM、API、Webhook、Cron 请求 | 用户身份、目标、会话 |
| MCP 工具层 | 发现和调用受批准工具/资源 | Server 版本、授权、调用结果 |
| A2A Agent 层 | 发现并委托独立 Agent | Agent Card、Task ID、Artifact |
| 编排层 | 管理步骤、依赖、人审、重试与补偿 | 计划版本、节点状态、幂等键 |
| 治理层 | IAM、RBAC、租户隔离、审计、评测与灰度 | 策略版本、trace、指标 |

例如办公 Agent 生成季度报告：先经 MCP 读取已授权数据仓库和文档，再用 A2A 委托财务 Agent 解释指标。工作流保存“取数→分析→草稿→人工审批→发布”的状态。若 A2A 任务还在进行中，不能仅凭一段流式文本发布报告；若发布请求超时，先根据幂等键查询是否已经成功。

## 哪些时候不用新协议

应用内一个简单函数直接调用更轻；同进程子 Agent 不必立刻变成 A2A 服务；固定流程节点交给工作流即可。MCP 工具若没有稳定契约、权限或维护负责人，强行标准化会扩大攻击面。A2A 若没有独立服务边界、长期任务状态或跨团队互操作需求，只会增加网络延迟与运维成本。

“可复用”也有前提：工具语义、schema、错误和副作用要稳定；Agent Card 要准确说明能力与认证；下游用户身份或委托权限要沿链路传播，不能让平台身份代替所有用户访问企业数据。

平台也需要版本治理。Tool schema 增加必填参数时，旧 Host 可能持续发送旧调用；Agent Card 修改认证方式时，旧客户端可能反复失败。注册目录要显示兼容版本、所属团队与下线计划，Gateway 记录按版本分组的错误率；灰度阶段保留旧入口或明确拒绝并给迁移指引。对于跨 Agent 调用，trace ID 应从入口贯穿 MCP 工具和 A2A Task，方便定位是模型选错工具、网关拒绝、远端任务失败还是发布节点超时。

故障处理也要按层区分：MCP 工具限流可等待或返回可恢复错误；A2A 远程任务超时要按 Task ID 查询状态；工作流审批长期未到可进入超时终态；业务发布未知状态必须对账。若平台把这些都包装成“Agent 执行失败”，运维和读者都无从知道下一步。

## 设计题怎么展开

面试设计可按六层解释接入、Host/Runtime、MCP 工具、A2A 服务、工作流、治理。先给出用户和工具数、敏感级别、延迟和租户要求，再画调用与身份链。随后讨论成功率、参数正确率、任务完成率、延迟、费用、人工接管、越权和注入拦截，以及跨 Agent trace 是否能串起来。若当前系统只有一个内部工具和一条固定流程，应主动说明暂不需要 MCP/A2A，先把权限和业务验收做好。

## 面试会怎么问

Raytheon 复盘覆盖 A2A、生产 RAG 与安全治理；国内面经追问 Harness、恢复和多 Agent 路由。回答“设计企业级 Agent 协议平台”时，不要从模型参数开讲；先界定工具与远程 Agent 的接口，再讲身份透传、注册审核、工作流状态、观测与灰度。若面试官要求落到具体故障，选远程 Agent 超时或工具越权说明处理路径。

## 来源与延伸阅读

- [AIGC Interview Book：MCP 与 A2A 协议高频考点，第六章](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/04_MCP%E4%B8%8EA2A%E5%8D%8F%E8%AE%AE%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [MCP 2026-07-28 规范](https://modelcontextprotocol.io/specification/2026-07-28)、[A2A v1.0 规范](https://a2a-protocol.org/latest/specification/)、[LangGraph 官方文档](https://docs.langchain.com/oss/python/langgraph/overview)
- [Raytheon Agentic AI 产品系统工程复盘](https://pocketfullofdhruv.wordpress.com/2026/08/18/agentic-ai-product-systems-eng-interview-experience-raytheon-tuscon-az-2026/)
