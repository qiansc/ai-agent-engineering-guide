# Function Calling、MCP、A2A：三种连接解决不同问题

一个 Agent 要查订单、读取文档，还可能委托另一个专门的 Agent 做财务分析。它面对的是三个不同的连接问题：模型怎样表达一次函数调用，应用怎样标准化连接外部工具与上下文，独立 Agent 服务怎样互相交付任务。Function Calling、MCP、A2A 分别对应这三个层面，可以同时出现。

| 层面 | 对接对象 | 解决的核心事 | 例子 |
| --- | --- | --- | --- |
| Function Calling / Tool Use | 模型与宿主程序中的函数 | 模型选择函数并生成结构化参数 | 调用订单查询函数 |
| MCP | AI 应用与外部工具、资源、提示 | 复用连接器与能力发现 | 接代码仓库、数据库、文档库 |
| A2A | 独立 Agent 服务之间 | 发现能力、发送任务、跟踪状态与结果 | 总控 Agent 委托财务分析 Agent |

没有标准时，每个 AI 应用都要为每个服务写私有接入；协议统一后，同一个工具服务可以被不同 Host 使用，同一个远程 Agent 也可对接不同客户端。但协议只规范交互，不自动提供业务授权、结果质量、工作流治理或人类审批。

## MCP 的“USB-C”类比到哪里为止

MCP 标准化 Host、Client、Server 之间的能力发现和调用，因此常被比作工具生态的 USB-C。这个类比适用于“接口可复用”，不代表 Server 插上就可信，也不代表工具能够跨组织无条件使用。企业仍需注册审核、用户授权、租户隔离、审计和数据分类。一个 MCP Server 还可能同时提供 Tools、Resources 与 Prompts，不只是函数集合。

## A2A 接的是服务化的 Agent

A2A 的 Remote Agent 可以有自己的模型、工具、记忆和内部规划，对调用方只公开能力说明、消息/任务接口、状态与产物。它让不同团队和框架实现的 Agent 互操作，不要求共享内部实现。A2A 是应用层协作协议，与 PBFT 等分布式一致性算法无关。若只是应用内一个子函数或单进程子 Agent，就没有必要把它包装成远程 A2A 服务。

## 一个完整请求会如何流动

用户请求季度分析。宿主里的模型用 Function Calling 选择取数动作；若数据工具由外部团队维护，宿主经 MCP Client 调用 MCP Server。之后宿主可能通过 A2A 把一份已授权的数据摘要交给财务 Agent；对方返回任务状态和报告产物。整个过程中，用户权限、共享数据范围、任务超时与最终审批都仍由应用和业务系统控制。

把每一次连接的身份也写下来很重要：宿主调用订单服务时，可以代表当前用户或受控服务账号；调用远程财务 Agent 时，还需要决定哪些数据允许被委托，以及远程服务能否再委托第三方。MCP 与 A2A 只是把接口规范化，并不会自动沿整条链传播用户权限。如果所有下游都拿平台管理员凭证调用，就可能出现“用户只想看自己的订单，Agent 却读到了整个租户”的事故。

从迁移成本看，已有稳定 OpenAPI 的业务系统不必重写内部 API。可以先用薄适配层提供 MCP Tool，保留原有服务的认证和业务校验；远程 Agent 只有在确实需要独立生命周期与责任边界时，再公开 A2A。这样协议对接与业务核心可以分别演进。

## 面试会怎么问

字节 Agent 开发一面问到 Function Calling 与 RAG 的区别，百度 Agent 实习复盘问 MCP transport。若被问“MCP 与 A2A 怎么选”，先说对接的是工具/数据源还是独立 Agent 服务，再讲授权、状态和协作需求。若对方进一步问 Function Calling，要指出模型只生成调用建议，真正执行和权限判断在宿主。

## 来源与延伸阅读

- [AIGC Interview Book：MCP 与 A2A 协议高频考点，第一章](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/04_MCP%E4%B8%8EA2A%E5%8D%8F%E8%AE%AE%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [MCP 2026-07-28 规范](https://modelcontextprotocol.io/specification/2026-07-28)、[A2A 官方概念](https://a2a-protocol.org/latest/topics/key-concepts/)
- [百度 Agent 开发实习复盘](https://www.nowcoder.com/feed/main/detail/bb8c28105f364770b57ff5eb5649cc60)
