# MAF 工作流与 LangGraph 托管：把步骤、状态和部署连起来

Agent 能选择工具，但有些流程必须明确顺序、并发和交接。Microsoft Agent Framework 的 Workflow 把 Agent 或普通程序都作为执行器，用边连接消息流，并在运行中发出事件。还有另一条路径：已有 LangGraph Agent 不必重写全部逻辑，可通过 Foundry 的托管协议公开。

## 五种编排思路先选任务形状

常见编排包括顺序、并发、群聊、交接和 Magentic 五类。顺序适合“检索 → 分析 → 审核”；并发适合独立搜多处资料；群聊适合多个角色讨论同一方案；交接适合从客服转到支付或人工；Magentic 风格由协调者制定和修改任务列表。它们并非能力等级。先看依赖与权限，再选最简单的编排。

Workflow 中的**执行器（Executor）**接收消息、处理并发出结果，可以是 Agent，也可以是确定性代码。**边（Edge）**规定结果去哪里：直接边连接两个执行器，条件边按结果决定是否继续，分支边把消息路由到不同执行器，分发边送到多个目标，合并边收集多个结果。最小例子用 `WorkflowBuilder()`，加一条 `builder.add_edge(source_executor, target_executor)`，指定起点再 `build()`。此处只构建图，不代表执行器已经有正确的输入输出合同。

例如旅行工作流可先并发查航班和酒店，但汇总执行器要等两个结果到齐；若航班结果为空，应走“询问是否改日期”条件分支；收到用户同意后才重新查。合并边不能仅按文本拼接：它要知道哪个子任务成功、哪个失败、哪些价格已过期。付款或下单必须在人工批准之后，由确定性服务执行。

## 用事件与检查点观察长流程

运行时有 `WorkflowStartedEvent`、`WorkflowOutputEvent`、`WorkflowErrorEvent`、`ExecutorInvokeEvent`、`ExecutorCompleteEvent` 和 `RequestInfoEvent`。这些事件分别帮助定位整体启动、输出、错误、某执行器开始/完成与请求。将事件关联到同一任务 ID，才能还原“哪一步在等”“失败前是否已写订单”。

Workflow 可做检查点保存，长任务中断后从已知状态恢复。检查点至少要保存当前节点、已完成执行器结果、待处理输入、外部副作用 ID 和批准状态；恢复前重新核对时效与权限。若只存模型消息、不存工具副作用，进程恢复后可能重复订票。中间件组合、动态工具选择和多 Agent 交接，都是让编排可控的手段：日志、鉴权、限流按确定顺序执行；工具只展示当前任务需要且有权使用的集合；交接通过条件边和明确的消息合同完成。

## 已有 LangGraph，为什么还看 Foundry 托管

编译好的 LangGraph 图可以通过 `langchain_azure_ai.agents.hosting` 暴露成 Foundry 托管 Agent。框架逻辑仍在 LangGraph，Foundry 负责托管运行时、会话、扩展、身份与协议端点。它给了两种主机：`ResponsesHostServer` 暴露 `/responses`，适合对话、流式响应和历史；`InvocationsHostServer` 暴露 `/invocations`，适合自定义 JSON 或非对话请求。两者用例不同，不能因为部署在同一平台就随意交换客户端。

安装命令与环境配置示例如下：

```bash
python -m pip install -U "langchain-azure-ai[hosting]>=1.2.9" azure-identity
az login
export FOUNDRY_PROJECT_ENDPOINT="https://<resource>.services.ai.azure.com/api/projects/<project>"
export FOUNDRY_MODEL_NAME="gpt-5-mini"
```

当前官方托管教程的安装门槛是 `langchain-azure-ai[hosting]>=1.2.9`；课程归档的 `>=1.2.4` 是当时的要求。这也不是永久最新版本承诺，实际应用应锁定经测试的依赖版本。`14-langchain-hosted-agent.py` 创建 Foundry `AIProjectClient`、取得 OpenAI 兼容客户端与 Entra token provider，交给 `ChatOpenAI`，再用 `create_agent(...)` 形成图并通过 `ResponsesHostServer(graph).run(port=8088)` 启动。本地可向 `http://localhost:8088/responses` 发请求。这里 OpenAI 兼容 base URL 与 token 由 Foundry 项目导出，不应把裸密钥写入代码。已有 `langgraph.json` 的项目还可用 `python -m langchain_azure_ai.agents.hosting.run --protocol responses` 暴露现成图；若图没有预期的 `messages` 状态，必须适配输入模式，不能假定任意图都能直接挂载。

会话续接可传 `previous_response_id` 或 `conversation` ID。若图使用 LangGraph checkpoint，生产应有持久化检查点；本地的内存式 `MemorySaver` 不能保证进程重启后恢复。若图用 `interrupt()` 等待人工批准，主机会把等待呈现为 Responses 的 `function_call` / `mcp_approval_request` 等项，再通过对应输出/批准响应恢复。审批必须绑定动作和参数，不能把一个“批准继续”视作所有后续工具都获准。

## 从本地到托管的路径

还可以走 Azure Developer CLI 路线：安装 `azure.ai.agents` 扩展，`azd ai agent init -m <manifest>` 初始化，`azd ai agent run` 在本地运行（需要 Docker），然后 `azd provision` 与 `azd deploy`。部署托管 Agent 需要 Foundry 项目管理员权限。读者应先用同版本样例确认本地 `/responses` 行为、身份与日志，再在测试项目 provision 和 deploy；云资源可能产生费用，部署之后还要做 smoke test 和权限检查。

上线前核对三件事：客户端真的能续接会话；人工中断能在断线/重启后恢复且不会重复执行；LangGraph 输出的文件或结构化数据能通过所选协议被调用方正确理解。托管解决了运行地点和服务能力，不替代你对图逻辑、模型输出和业务动作的评测。

## 面试会怎么问

小红书面经问 Planner/Executor/Critic 与并发，百度面经问 Harness 恢复。回答工作流设计时，先画执行器与依赖，再说边如何处理空结果、人工批准、并行汇总，最后说检查点保存什么及如何避免重复副作用。被问“框架迁移”时说明 Agent 逻辑与托管协议的边界：不用为进 Foundry 就重写 LangGraph，但必须验证会话、审批和产物的协议映射。

## 来源与延伸阅读

- [Microsoft AI Agents for Beginners · Exploring Microsoft Agent Framework](https://github.com/microsoft/ai-agents-for-beginners/tree/main/14-microsoft-agent-framework)（本文承接 Workflow 与托管 LangGraph 部分，另见仓库 `code-samples/14-langchain-hosted-agent.py`）
- [Microsoft Learn · Host LangGraph agents as Foundry hosted agents](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/langchain-hosted-agents)（核对托管包版本、图状态要求和 Responses/Invocations 协议）
- [小红书 Agent 开发面经](https://www.nowcoder.com/feed/main/detail/223fa82f976b4418b214894bd7d941fd)、[百度 Coding Agent 三轮](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)
