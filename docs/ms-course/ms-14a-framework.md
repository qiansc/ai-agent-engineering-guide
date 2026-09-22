# Microsoft Agent Framework：Agent、工具、线程与中间件

Microsoft Agent Framework（MAF）把模型客户端、Agent 指令、工具和运行状态组织在一起。你可以先用它完成一次问答，再逐步加入工具、连续会话、记忆和观测；同一框架也可用于更复杂的工作流。学习时先分清这几个对象各管什么，避免把“模型返回一段文字”误认为完整任务已经执行。

## Agent 从客户端、名字和指令开始

客户端有多种接入方式：Azure OpenAI、Microsoft Foundry Agent Service、OpenAI Responses、OpenAI Chat Completion，也列出 MiniMax 这样的 OpenAI 兼容端点，以及通过 A2A 接入远程 Agent。不同客户端暴露的模型能力、认证和状态管理不完全一样；代码不能只改类名就假定可互换。选定一种与第 0 课环境对应的客户端，把 `name`、`instructions` 和工具交给 `create_agent(...)` 或对应 API，先跑一条简单请求。

典型调用是 `await agent.run("What are good places to visit in Amsterdam?")`，返回完整结果；`agent.run_stream(...)` 则逐步给出更新，适合边生成边显示。流式文本到达不是最终任务完成：工具执行、审批或文件产物可能还在后面。应用需分别处理部分内容、最终状态和错误。运行时可按任务限定模型、最大输出 token 或本轮工具集合，但这些覆盖选项要与默认权限策略兼容。

旅行推荐 Agent 示例使用 `AzureOpenAIChatClient(credential=AzureCliCredential())`；另有 `OpenAIResponsesClient()`、`OpenAIChatClient()` 例子。若想试 OpenAI 兼容服务，还需正确 base URL、密钥和模型 ID。部分单行示例是单行片段，甚至有未闭合括号；它们展示入口而非保证可直接粘贴运行。动手时以同仓库 Python Notebook 和所安装版本的 SDK 签名为准。

## 工具可在创建时或一次运行时提供

旅行助手的 `get_attractions(location)` 可以在 Agent 创建时注册，成为它持续可见的工具；也可仅传给某一次 `agent.run(..., tools=[get_attractions])`。前者适合固定角色能力，后者适合按任务缩小候选集。函数签名和参数说明会影响模型如何调用；函数本身仍需要处理输入、超时、权限和返回值。用 `Annotated[str, Field(description=...)]` 给地点参数补描述，目的就是让模型理解这个参数的语义。

假如用户问西雅图景点，而本轮只开放景点查询，模型不该看到航班预订工具。只在运行时隐藏工具不等于撤销服务端权限；执行端仍要拦截不允许的调用。相反，工具注册了也不保证模型一定会选它，评测要包含应该调用、不该调用和错误参数三类输入。

## 线程如何延续会话

用 `agent.get_new_thread()` 建立对话线程，再把同一 thread 传给多次 `agent.run()`。它能让后续“那住宿呢”承接前面的目的地。若希望跨进程恢复，需序列化线程、持久化存储，再由 Agent 反序列化；只把 thread 保存在当前 Python 变量里，不会自动成为长期记忆。不显式提供线程时，运行可只创建临时上下文，适合独立问题。

持久线程还要处理身份与权限：用户 A 的 thread 不应被用户 B 恢复；线程里如果包含旧订单、旧价格，恢复后要核对时效。序列化解决“内容能存下”，没有自动解决“哪些事实还有效”。

## 中间件是执行路径上的关口

MAF 的函数中间件位于 Agent 与工具之间，可以在调用前后记录事件、检查策略或统计耗时。聊天中间件位于 Agent 与模型调用之间，可以查看本轮消息数量、添加允许的遥测或处理请求。中间件示例函数都接受 `context` 和 `next`：先做前置动作，`await next(context)` 推进到下一处理器或真实调用，随后做后置动作。若权限检查不通过，应明确阻止继续，而不是仍调用 `next`。

记录日志时不要直接打印完整模型消息或工具参数，其中可能有证件、订单、密钥或用户私密文本。可用任务 ID、工具名、状态、耗时、参数安全摘要。若同时接入认证、限流和日志中间件，顺序会影响行为：例如应在昂贵工具执行前完成权限与配额检查，最终日志则要记录通过、拒绝和失败三种结果。

## 记忆与观测接到哪里

记忆可以从三层接入：线程内的即时消息；通过 `chat_message_store_factory` 提供自定义消息存储；通过 `context_providers` 接入 Mem0 等外部动态记忆。前者用于当前对话，中者让消息在会话间有存储机制，后者可按用户读取长期偏好。示例中 `Mem0Provider(api_key=..., user_id=..., application_id=...)` 的 key 是占位值，不能硬编码进产品；`user_id` 必须由认证身份得到，不能信任模型生成。

观测通过 OpenTelemetry 的 tracer 与 meter 记录 span 和指标。`get_tracer()` 可创建自定义运行片段，`get_meter()` 可定义计数器；框架的自动追踪可和自定义业务事件一起看。但“有 span”仍要检查是否记录了工具调用结果、错误、版本和任务 ID，是否安全导出到合适的观测后端。

## 练习：把一个问答扩成受控工具任务

先运行不带工具的旅行推荐 Agent；再加只读景点工具，让它引用真实返回值；用同一 thread 追问“那住哪里”，检查目的地是否被承接；序列化线程后恢复，确认身份隔离。给函数调用加中间件，记录工具名、耗时和状态，但不记录用户完整输入。最后在一次运行中撤掉该工具，测试 Agent 能否诚实说明目前无法实时查询，而不是编造景点开放时间。

## 面试会怎么问

小红书面经问 Harness 与长短期记忆，百度 Coding Agent 面经问上下文隔离和 Skill 误调用。回答“框架帮你做了什么”时，指出模型客户端、工具注册/消息往返、线程、编排与观测；再明确业务应用仍负责身份、工具权限、长期记忆写入和失败处理。若被问线程与记忆区别，用“当前会话、持久消息、按需检索的用户偏好”三层说明。

## 来源与延伸阅读

- [Microsoft AI Agents for Beginners · Exploring Microsoft Agent Framework](https://github.com/microsoft/ai-agents-for-beginners/tree/main/14-microsoft-agent-framework)（本文承接原章 Agent、运行、工具、线程、中间件、记忆和观测部分）
- [小红书 Agent 开发面经](https://www.nowcoder.com/feed/main/detail/f1ed02bfdae04730837753b62e0d58b9)、[百度 Coding Agent 三轮](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)
