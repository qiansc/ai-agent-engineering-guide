# MCP 核心架构与 2026 版协议变化

MCP（Model Context Protocol）让 AI 应用以统一方式连接外部工具和上下文。用户直接使用的是 Host；Host 内的 Client 负责与一个 Server 通信；Server 提供工具、资源和提示模板。读协议时要把版本写清：这篇材料的原文以 2025-06-18 为主要依据，而到 2026-07-28，连接生命周期已发生重要变化。

## Host、Client、Server 怎样协作

Host 负责模型、界面、用户权限与上下文总控；Client 是 Host 中面向一个 MCP Server 的协议连接；Server 暴露能力，通常不负责模型推理。Host 可连接文件、Git、数据库、浏览器、知识库或业务 API 等多个 Server。模型需要某个工具时，Host 先校验可用性与授权，经 Client 请求 Server；Server 返回的内容由 Host 当作工具结果处理，而不是提升为系统指令。

在 2025-06-18 版中，典型流程先有 `initialize` / `initialized` 握手与能力协商，再列出 Tools、Resources、Prompts。2026-07-28 版协议核心改成无状态、自描述请求，移除了上述握手和 `Mcp-Session-Id`；请求携带协议版本及元信息，`server/discover` 可选。应用仍可有业务会话，但不能再把旧版协议级 Session 当作新 Server 的必要条件。

## 三类服务能力不要混淆

| 能力 | 用途 | 例子 | 主要由谁选择 |
| --- | --- | --- | --- |
| Tool | 执行动作或查询 | 创建 Issue、查询订单 | 模型建议，Host 验权 |
| Resource | 提供可读取上下文 | 文件或记录 URI | 通常由应用装配 |
| Prompt | 提供复用的消息模板 | 代码审查模板 | 用户或应用 |

读取 README 可做 Resource；创建 Issue 是 Tool；“生成一次代码审查任务”的模板可做 Prompt。Tool 即便看似只读，也可能访问敏感数据；Resource 内容也可能含注入文本。Host 要为不同能力设权限与信任边界。

## Roots、Sampling、Elicitation 的版本边界

旧版 MCP 的 Roots 让 Host 向 Server 提供可用工作区提示；Sampling 让 Server 请求 Host 调用模型；Elicitation 让 Server 向用户补充信息。Roots 不应被当成文件访问的强制安全沙箱，Server 仍需自己限制路径与身份。到 2026-07-28，Roots 和 Sampling 已标记弃用，官方建议分别改由工具参数/资源 URI/Server 配置表达目录，以及直接集成模型服务。Elicitation 仍是客户端能力，但交互机制改为 Multi Round-Trip Requests（MRTR）：Server 在调用结果中返回 `input_required`，Client 收集输入后携答案重发原请求；不是保持一条旧式双向流让 Server 随时发问。

这些旧能力仍有兼容期。维护现有 Server 时先看客户端与 Server 协商的版本；写新实现时以 2026-07-28 规范和对应 SDK 为准。不要将旧版握手、Roots 的旧用法与新版无状态请求拼成一套流程。

| 项目 | 2025-06-18 资料常见写法 | 2026-07-28 需要掌握的变化 |
| --- | --- | --- |
| 生命周期 | `initialize` / `initialized`，可有协议 Session | 请求自描述、无握手和协议级 Session |
| Server 向 Client 要输入 | 依赖处理中保持双向通信 | MRTR 以 `input_required` 往返 |
| Roots / Sampling | 常作为 Client 能力介绍 | 标记弃用，新实现优先替代路径 |
| Elicitation | Server 发起补充输入请求 | 能力仍在，但通过 MRTR 表达 |
| HTTP+SSE | 旧远程传输 | 已弃用，迁移 Streamable HTTP |

新版 `tools/list`、`prompts/list` 等列表结果还可带缓存提示，HTTP 层的 `Mcp-Method` 与 `Mcp-Name` 便于网关路由和限流。工具 schema 已支持更完整的 JSON Schema 2020-12 表达；这些变化对注册与治理平台有实际影响，例如工具目录缓存不该无限期保留。兼容客户端时必须按具体协商版本决定请求形态。

## 本地与远程传输

`stdio` 适合本地子进程，Host 启动 Server，用标准输入输出传 JSON-RPC；它部署简单，但进程会继承可用的本地权限，需核对可执行来源。Streamable HTTP 适合远程共享与集中治理，需要 TLS、认证授权、限流和审计。旧 HTTP+SSE 传输在 2026-07-28 已弃用；注意这不等于所有基于 HTTP 的事件流都不能使用。新版 HTTP 请求还带 `Mcp-Method`、`Mcp-Name` 等路由头，便于网关按能力处理。

## 面试会怎么问

百度 Agent 开发实习复盘问 MCP transport。回答时先描述本地 stdio 与远程 Streamable HTTP 的部署和安全取舍，再主动标注协议版本：2025 版的握手与 2026-07-28 版无状态请求不同。若问 Host/Client/Server，说明 Host 管用户与模型、Client 管协议连接、Server 提供能力，避免说 Server 直接“控制模型”。

## 来源与延伸阅读

- [AIGC Interview Book：MCP 与 A2A 协议高频考点，第三章](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/04_MCP%E4%B8%8EA2A%E5%8D%8F%E8%AE%AE%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [MCP 2026-07-28 正式规范](https://modelcontextprotocol.io/specification/2026-07-28)、[2026 版发布说明](https://blog.modelcontextprotocol.io/posts/2026-07-28/)、[2025-06-18 旧版规范](https://modelcontextprotocol.io/specification/2025-06-18)
- [百度 Agent 开发实习复盘](https://www.nowcoder.com/feed/main/detail/bb8c28105f364770b57ff5eb5649cc60)
