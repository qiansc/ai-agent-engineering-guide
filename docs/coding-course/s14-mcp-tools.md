# 把外部工具接进同一循环：发现、命名与宿主权限

前面的工具都写在 `code.py` 中。接入文档服务或部署平台时，若每个接口都手写一份工具定义与处理函数，服务一变就要跟着改 Harness。s14 用 MCP 展示另一种边界：server 提供工具目录与调用入口，宿主连接、规范化名称、设权限，再把工具加入模型可见的工具池。本章用进程内模拟 server 讲清发现与调用，**没有实现真实 MCP 网络 transport**。

## 连接前后模型看见什么

开始时模型只有 s04 的五个基础工具和 `connect_mcp`。当它调用 `connect_mcp(name="docs")`，宿主创建 docs client、保存其发现的工具定义。下一轮 `assemble_tool_pool()` 重新组装工具池，模型才看见 `mcp__docs__search` 与 `mcp__docs__get_version`。连接 `deploy` 后也同理出现状态与部署工具。循环仍按 `tool_use` 与 `tool_result` 往返，工具来源的变化发生在调用模型前的组装阶段。

`MCPClient.register(tool_defs, handlers)` 保存 server 的工具描述和本地模拟 handler；`call_tool(tool_name, args)` 查到原始处理函数后调用。未知工具返回 `MCP error: unknown tool`；参数不合法或处理函数异常被包装成 `MCP error: <异常类型>: <信息>`，作为结果送回模型，不让 CLI 无故退出。真实 MCP client 还要处理 transport 连接、认证、超时、重连与协议版本，本章没有展示。

## 为什么名字必须带来源

两个 server 都可能导出 `search`。宿主给模型的名称采用 `mcp__{server}__{tool}`，原始 server/tool 名在实际调用时仍保留。`normalize_mcp_name()` 把不适合工具名的字符替换为下划线；组装时检查规范化后的重名和 64 字符限制。否则两个不同原始名字可能归一化成同一字符串，模型请求的调用会被路由到错误 server。一个工具条目要同时加入 `tools` schema 和 `handlers` map，不能只给模型看目录而忘记调用入口。

循环里的 lambda 用默认参数绑定当前 `server` 和原始 `tool`，避免 Python 闭包在循环结束后都指向最后一个工具。这个细节很适合作为代码审查练习：若去掉 `client=server, tool=raw_name`，连接多个 server 后可能出现“模型选了 docs 搜索，实际却调用 deploy 工具”的错路由。

## server 声明不能替宿主授权

MCP 工具定义可能带 `readOnlyHint`、`destructiveHint` 等描述，它们来自 server 自己，不是宿主授权结论。本章用 `MCP_HOST_POLICY` 维护精确规则：docs 的 `search`、`get_version` 与 deploy 的 `status` 允许，deploy 的 `trigger` 需要确认；其他未配置外部工具默认也要确认。`permission_hook()` 根据规范化后的工具名查宿主策略，先审批再执行。即使描述写“只读”，宿主仍应按实际身份、资源和动作判断。

对于前台 CLI，确认可以请求用户输入；无人值守场景遇到 `confirm` 应暂停或拒绝，不能让后台线程卡住等人按 `y`。工具参数错误与权限拒绝也不能混为一谈：前者可能修正 schema 后重试，后者需要授权变化或更安全的替代动作。

## 动手跟一次动态工具池

运行 `python s14_mcp_plugin/code.py`，请求“连接 docs server，搜索 agent hooks，并告诉我文档 API 版本”。观察第一轮只有 `connect_mcp`，连接成功后下一轮出现 `mcp__docs__search` 与 `mcp__docs__get_version`。再连接 deploy server，仅查询服务状态，确认它无需审批；尝试触发部署时，观察宿主是否要求确认。不要在真实服务上用教学代码试部署，这里的 server 是 mock。

还可以故意给 `search` 漏传 `query`，确认错误以工具结果回传；再试不存在的 server 名，看可用名称是否清楚。最后构造两个归一化后重名的工具定义，确认工具池组装拒绝冲突，而不是静默覆盖。

## 与后续集成的关系

s14 从 s04 的基础循环分支出发，没有同时带入 Task、Background、Cron、Team 和 Worktree。它的目标是把 MCP 的发现、命名、授权与调用入口讲清。s15 才把这些分支接回同一个宿主。不要把本章 mock 中“返回 Python 字符串”理解成真实 MCP server 的全部语义；真实 transport 的连接生命周期、错误码、内容类型和凭据管理仍需按使用的协议版本单独实现与测试。

## 面试会怎么问

面经常问“MCP 与函数调用是什么关系、外部工具如何鉴权、失败怎么办”。回答可以分层：模型的工具调用机制负责提出名称和参数；MCP 负责 server 工具的发现与调用协议；宿主把发现的 schema 纳入模型工具池、消解重名、按身份和资源做授权，并把失败归一化回工具结果。server 自称只读不等于自动放行。若问“连接后为什么下一轮才可见”，指出工具池在每次模型调用前动态组装，连接结果先进入消息，随后才有新目录。

## 来源与延伸阅读

- [Learn Claude Code 新版 s14 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s14_mcp_plugin)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/bb8c28105f364770b57ff5eb5649cc60)：MCP transport、工具权限与恢复追问。
