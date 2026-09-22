# Builder、Registry、模型网关：平台核心模块怎样协作

一个可运营的企业 Agent 平台，至少要覆盖构建入口、任务执行、模型接入、工具与数据治理、状态持久化，以及质量运营。模块可以来自自研或现成产品，但边界不能靠“Agent 自己会判断”来填补。

## 从搭建到运行的模块清单

| 模块 | 主要责任 |
| --- | --- |
| Agent Builder | 配角色、Prompt、模型、工具、知识、工作流与测试样例 |
| Agent Runtime | 模型循环、工具调用、上下文、streaming、重试与交接 |
| Model Gateway | 多模型接入、路由、配额、脱敏、成本和回退 |
| Tool/MCP Registry | 管工具及 MCP Server 的 Schema、owner、版本、认证与风险 |
| Agent Registry | 管可复用 Agent 服务、能力说明、版本、SLA 与授权 |
| Knowledge/RAG | 文档切片、索引、重排、来源与权限过滤 |
| Memory/Session/Task | 按不同生命周期保存对话、工作状态与长期信息 |
| Workflow Engine | 状态机、审批、后台任务、重试、补偿 |
| Governance/AgentOps | 身份、权限、评测、Trace、灰度、回滚与审计 |

Builder 应允许开发者或业务专家预览工具权限、试跑任务、查看 trace、比较 Prompt/模型版本、发布与回滚。高级能力可以从 OpenAPI 生成工具 Schema、从历史工单生成评测样本。但它不能绕过统一治理，所有模型、数据源与工具仍要受平台授权。

## 三种 Registry 各管什么

Tool Registry 管函数级能力，例如内置工具、OpenAPI 接口和数据库操作；MCP Registry 管 MCP Server 地址、传输、认证以及服务暴露的 tools/resources/prompts；Agent Registry 管能够独立接任务的 Agent 服务，包括能力描述、输入输出、版本与 SLA。三类对象的粒度不同，但都需要 owner、数据分级、权限、调用审计、可用性监控与下线机制。

例如“查询订单状态”可以是工具，“企业订单 MCP Server”是一组通过标准协议提供的能力，“售后 Agent”则能在规则下完成一类售后任务。若把三者都称为“插件”，开发者就很难判断授权到底授给哪一层。

## 模型网关解决统一调用和治理

网关可统一接公有、私有和本地模型，按任务难度、数据敏感性、延迟、成本或模型能力路由；调用失败时按策略重试或 fallback。它也负责鉴权、配额、token 与费用统计、必要的脱敏和版本灰度。简单分类可试低成本模型，复杂规划用更强模型；涉密数据可能要求私有部署。最终选择要通过评测和实际合规条件验证，不能只靠任务名称。

## 四类数据要分开

Session 保存对话和交互上下文；Task 保存步骤、进度、等待审批与后台状态；Memory 保存跨会话的偏好、项目规则和经验；Knowledge 保存企业文档、产品手册与制度。它们的所有者、更新节奏、权限和删除方式不同。若把一次任务的临时预算写进长期用户偏好，或把知识库文档当成用户记忆，就会产生错误行动。

平台应对四类数据分别设计存储、索引、权限、版本和保留周期；Runtime 只在当前一步提取需要的部分组装上下文。这样评测可复现，删除也更可控。

## 面试会怎么问

**企业平台有哪些核心模块？** 按 Builder→Runtime→Gateway/Registry/Knowledge/Memory→Workflow→Governance/AgentOps 讲一条任务路径。

**三种 Registry 如何分工？** 明确函数级、协议服务器级和独立 Agent 服务级，并说明 owner、风险和版本治理。

**模型网关有何价值？** 讲路由、配额、fallback、数据边界、成本与观测，而不是只说“统一 API”。

**Session、Task、Memory、Knowledge 为何分开？** 以临时任务状态误入长期记忆为反例，强调生命周期和权限差异。

## 来源与延伸阅读

- [AIGC Interview Book：企业级 Agent 平台与产品落地高频考点，第二章 Q005–Q009](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/07_%E4%BC%81%E4%B8%9A%E7%BA%A7Agent%E5%B9%B3%E5%8F%B0%E4%B8%8E%E4%BA%A7%E5%93%81%E8%90%BD%E5%9C%B0%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [LangGraph 文档](https://docs.langchain.com/oss/python/langgraph/overview)
