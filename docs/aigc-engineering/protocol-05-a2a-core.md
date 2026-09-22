# A2A：让独立 Agent 服务交换任务与产物

A2A（Agent2Agent）用于一个客户端 Agent 或应用委托远程 Agent 完成工作。远程方可以由不同团队、模型和框架实现；调用方不必看到它的内部 prompt、工具或记忆，只需要知道其公开能力、怎样发请求、任务状态和最终交付物。

截至 2026 年 9 月，A2A 最新正式规范为 v1.0。原参考材料沿用了较早版本的术语框架，概念仍有用，但协议绑定不能再简单概括为“只用 JSON-RPC”：v1.0 同时规定 JSON-RPC、gRPC 和 HTTP+JSON/REST 等绑定，Agent Card 会声明支持的接口。实现互操作时先核对双方版本与绑定，再决定具体请求格式。

## Agent Card 先说明能做什么

Agent Card 是远程 Agent 的 JSON 能力说明，包含身份、服务入口、认证要求、输入输出模式、支持的能力和 skills。客户端可用它判断“财务分析 Agent 是否能收表格、能否流式报告、需要什么授权”。企业 Registry 可据此做发现与路由，但 Card 是服务声明，不能替代真实鉴权或对结果质量的评估。

## Message、Task、Part、Artifact 分工

| 对象 | 主要作用 | 示例 |
| --- | --- | --- |
| Message | 一轮沟通，可是请求、回答或追问 | “请补充统计周期” |
| Task | 有 ID 和生命周期的工作单元 | 生成季度经营分析 |
| Part | Message/Artifact 内的内容单元 | 文本、文件引用、结构化数据 |
| Artifact | 任务交付的具体结果 | 报告、图表、JSON 文件 |

快速问题可以直接得到 Message；需要长期处理、状态更新和交付产物的工作可返回 Task。Task 与 Message 不是“输入/输出”一一对应。一个 Task 可以经历多轮追问和状态变化，最后产生多个 Artifact；客户端要保存 Task ID，而不是仅拼接流式文本。

## 长任务怎样保持可见

客户端可以轮询 Task 状态，或通过流式订阅接收状态与产物更新；很长的任务还可配置 Push Notification，等服务端通过 Webhook 通知。典型状态包括已提交、执行中、需要输入、完成、失败、取消；不同协议版本的枚举与接口名称以当前规范为准。进入 input-required 时应把缺失信息交给用户补全，而不是把任务当成普通失败。最终 Artifact 可能包含文本、文件和结构化数据，调用方需要核对媒体类型和访问权限。

流式事件要有顺序与重连策略。网络断开后按 Task ID 查询权威状态，不能因为没收到最后一条事件就重新创建任务。Push Notification 也要验证来源、去重、限制可访问的回调地址，避免把回调当作不受保护的通知通道。

假设研究 Agent 委托财务 Agent 生成一份指标解释：客户端先读 Agent Card，核对能否接收表格和所需权限，再发送 Message。远端若能立即回答，可直接返回 Message；若需要查多个数据源，则创建 Task 并返回 ID。任务进入 working 后，客户端可订阅状态；远端需要确认会计口径时切到 input-required，补充后继续。完成时报告作为 Artifact 返回，正文说明只是 Message。若取消发生在报告已生成之后，客户端还要确认 Artifact 是否仍可读取及是否应保留。

Agent Card 可以声明服务地址和认证方式，但不应把 Card 当成可信的权限授予。客户端要校验发现来源、HTTPS 目标和可访问的服务范围；服务器侧仍按调用者身份授权。远端输出同样是外部内容，不能因为来自“另一个 Agent”就自动获得高于用户或系统规则的优先级。

## 哪些场景值得使用 A2A

跨团队、跨供应商、跨部署的专业 Agent 互调是典型场景：客服 Agent 委托订单 Agent，研究 Agent 委托数据分析 Agent，或总控 Agent 调用独立代码服务。同进程的两个函数、固定 DAG 节点、数据库查询或文件读取，通常不需要 A2A；内部调用或 MCP 更轻。选择依据是对方是否真有独立任务能力、生命周期和责任边界。

## 面试会怎么问

英文 Raytheon Agentic AI 产品系统工程复盘提到多 Agent/A2A；国内面经也问多 Agent 路由与状态汇总。回答“A2A 能带来什么”时，解释独立服务如何发现能力、跟踪 Task 和交付 Artifact，再说鉴权、重试与长任务恢复。不要把它说成一种让模型自动变聪明的算法。

## 来源与延伸阅读

- [AIGC Interview Book：MCP 与 A2A 协议高频考点，第五章](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/04_MCP%E4%B8%8EA2A%E5%8D%8F%E8%AE%AE%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [A2A 官方核心概念](https://a2a-protocol.org/latest/topics/key-concepts/)、[A2A v1.0 规范](https://a2a-protocol.org/latest/specification/)
- [Raytheon Agentic AI 产品系统工程复盘](https://pocketfullofdhruv.wordpress.com/2026/08/18/agentic-ai-product-systems-eng-interview-experience-raytheon-tuscon-az-2026/)
