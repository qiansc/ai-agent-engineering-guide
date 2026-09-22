# 固定流程交给脚本：Workflow 的编排、结构化结果与续跑

s01–s15 中，模型每一轮观察工具结果，再决定下一步。这适合路径要随发现变化的开放任务。但代码审查等工作可能有固定的“分维度审查 → 验证发现 → 汇总”顺序。每次都让主模型重新决定编排，会增加波动；若执行一半中断，也难知道哪一步可直接复用。s16 在原 Agent Loop 的工具池里加一个 `Workflow`：主模型选择已保存的流程，宿主脚本负责步骤与检查点。

## 模型选流程，代码掌握流程

模型可见的 `Workflow` 参数只有 `name`、`args` 和可选的 `resume_from_run_id`。它不能把任意 Python 代码提交给运行时执行；宿主的 `WORKFLOWS` 注册表预先保存元数据与函数。名称未知或参数不合约，适配器返回工具错误，主 Agent Loop 仍可继续。

课程示例 `review-changes` 的脚本先按 correctness、security、performance、style 四个维度审查，再对每项 finding 作独立验证，最后汇总确认的问题。脚本中的每个 `agent()` 负责判断一个局部问题；哪些维度并行、何时验证、如何汇总，则由已保存代码决定。脚本中间结果保存在局部变量和 journal，不必把所有子 Agent 的全文塞进主聊天历史。

`WorkflowTool.call()` 在运行前校验元数据、权限和 run ID，注册本地任务并发 `async_launched`、`task_started` 事件。随后调用保存好的脚本、写结果和状态，最后发 `task_notification`。这里的 `async_launched` 是生命周期事件，教学适配器的调用仍等待脚本返回完整结果；不要把它误解为“主 Agent 一定在后台完全无阻塞”。

适配器通过 `install_workflow_tool(host)` 将 `Workflow` schema 与 handler 装进 s15 的工具池，原来那些文件、Task、MCP 等工具仍可用。主模型的一次 `tool_use` 进入适配器后，由 `run_workflow(name, args, resume_from_run_id)` 从 `WORKFLOWS` 查可信函数；未知名称返回可读错误，不能把模型给的 `name` 当脚本路径执行。这个边界使“模型决定调用哪套流程”和“模型临时写一段任意编排代码”彻底分开。

## 元数据与参数为什么先校验

宿主注册的元数据至少有 `name` 与 `description`，可选 `phases`。`name` 也用在本地文件名中，因此必须是 1–64 字符的安全 slug：字母或数字开头，后面可含字母、数字、点、下划线和连字符。`phases` 若存在，必须是非空字符串列表。校验发生在脚本执行前；损坏的注册信息不能等写出半份 journal 后才发现。

模型给的 `args` 也要按具体 Workflow 的要求处理。恢复运行时，如果没传 `args`，宿主使用原快照保存的参数；如果传入与原参数不同的值，直接拒绝，避免拿同一个 run ID 混跑两组输入。`resume_from_run_id` 也必须符合安全格式并匹配保存的 workflow 名称。

新运行通过排他创建预留 run ID；续跑先加载同 ID 的快照和 journal，验证记录每行都是带 `key`、`value` 的 JSON 对象。journal 损坏会指出行号并拒绝继续，不会静默丢掉已完成调用。整次运行持有 `<runId>.lock`，避免两台进程同时把同一 journal 的后续条目交错写入。这里的“锁”保护一个 run，不等于全局串行：不同 run ID 可以并发执行，仍受总调用数和 semaphore 限制。

## 六个编排原语的分工

| 原语 | 什么时候用 | 结果和边界 |
| --- | --- | --- |
| `agent(prompt, schema, label, phase)` | 要让模型完成一个局部判断 | 返回局部结果，必要时按 schema 校验 |
| `parallel(thunks)` | 下游要等一批并行调用全部完成 | `asyncio.gather` 等齐；任一失败则流程失败 |
| `pipeline(items, *stages)` | 每个 item 独立经过相同步骤 | 某 item 可先进入下一阶段，不等别的 item |
| `phase(title)` | 显示当前进度阶段 | 相同阶段重复出现不会反复公告 |
| `log(message)` | 发一条可见进度日志 | 不改变编排与结果 |
| `workflow(name, args)` | 调用另一个已注册流程 | 只允许一层嵌套，共享预算和 journal |

`parallel` 和 `pipeline` 都有并发，但同步点不同。假设四个审查维度，每个维度都有 audit、verify 两步：`pipeline(DIMENSIONS, audit, verify)` 让 security 一审完就可验证自己的 finding，不必等 style 审完；在 verify 阶段，对该维度的多条 finding 使用 `parallel(...)`，等它们全部返回后才决定哪些确认。若下一步必须综合四维完整结果，才需要在外层等整批 `pipeline` 结束。

并发不是无限的。`ExecutionLimits` 共享一次运行的 agent 调用计数和 `asyncio.Semaphore(CONCURRENCY)`；实现代码硬上限 `AGENT_CAP = 1000`，同时最多 8 个 agent runner 调用。嵌套 Workflow 也共享这些限制和 token 预算。超过预算时应失败并留下可恢复状态，而不是默默继续花费。

## 让下游代码拿到稳定数据

`ctx.agent(..., schema=...)` 要求子 Agent 返回 JSON 对象，运行时用 `SimpleJsonSchema` 校验。第一次不合格，就补一条“返回合法 JSON”再试一次；仍不合格则报 `WorkflowInputError`，当前 Workflow 失败。下游 `verify` 因而可以读 `findings`、`isReal` 等字段，不必从散文中猜答案。

结构化输出仍可能在语义上错误。Schema 只能证明字段和类型大致符合，不能证明 finding 真有问题，所以示例另设验证阶段。这也是审查流程里“生成候选”和“独立核验”分开的原因。编排代码不能把一个子 Agent 的自信陈述直接当成确认结论。

本章的 `SimpleJsonSchema` 是轻量验证器，只覆盖对象、数组、字符串、布尔、数字、枚举与 required 字段；它不是完整 JSON Schema 实现。实现代码甚至把 `integer` 与 `number` 放在同一个 Python 数值检查里，浮点数也可能通过标成 integer 的字段。使用真实业务合同前，要换成完整验证器，并对字段范围、额外属性和语义约束单独测试。课程演示的重点是“子 Agent 输出进入下一步之前必须验证”，不应把简化校验器直接当生产标准。

真实 `AnthropicAgentRunner` 把 schema 附在 prompt 后，请模型返回一个 JSON 对象，再解析文本并读取 API usage；解析失败交给 `ExecutionState.agent()` 的一次重试。演示 `MockAgentRunner` 则按 prompt 和 label 生成确定性数据，使 journal 和并发测试可复现。两者通过相同的 runner 返回 `RunnerOutput(value, tokens)`，编排层不必为“真实模型”与“固定测试”写两套流程。子 Agent 系统提示还明确要求它只处理给定步骤，不声称访问 prompt 未包含的文件或结果；workflow 参数中没有交给它的资料，它并不会自动拥有。

## Journal 如何让续跑不重复做旧工作

每次运行在 `s16_workflow_runtime/.runtime/` 生成快照 `<runId>.json`、结果 `<runId>.output.json`、逐条记录的 `<runId>.journal.jsonl` 和锁文件。新 run ID 用排他文件创建预留；执行与最终持久化期间持有 run lock，另一个进程不能同时 resume 同一运行。快照保存 workflow 名、参数与任务状态；journal 保存每个成功 `agent()` 的 key/value。记录写入时 flush，便于中断后重读。

续跑会重新执行可信脚本，但每次 `agent()` 先计算稳定语义 key，基于调用种类、label、prompt、schema，而不是“第几个完成”。并发完成顺序不确定，若按顺序编号，第二次运行很可能把 security 的旧结果错用给 performance。若 key 命中 journal，运行时返回缓存并发 `status=cached` 进度；若未命中，才实际调用 runner，校验输出并记录。缓存命中结果若带 schema，还会重新验证，防止损坏的历史值被直接用于下游。

调用 key 只对包含在 key 中的输入敏感。若脚本里某个隐藏外部依赖变了，而 prompt、label、schema 都没变，resume 仍会复用旧结果。因此输入应把影响判断的变更内容、版本和范围显式写进 prompt 或参数；必要时启动全新 run。若只更改某个 audit 的 prompt，该调用的 key 会变，下游使用它生成的新 prompt 也会改变，从而重新验证；其他未受影响维度则可继续命中缓存。

这是一种**按调用内容复用**，不是“一切副作用恰好执行一次”的保证。该教程的 `agent()` 主要产出判断结果；若子 Agent 后面可调用写入、发信或部署工具，还要另设计幂等和外部状态核对。仅靠 journal 的 key 无法保证网络请求执行后、写 journal 前崩溃的安全性。

## 生命周期与可见进度

`LocalWorkflowTask` 保存 `running/completed/failed` 状态、已调用 agent 数、token 数和进度事件。运行前发 `async_launched`、`task_started`；脚本中的 `phase`、`log`、`agent` 会产生 `task_progress` 类事件；最后的 `task_notification` 带结果文件路径和用量。失败时也写失败结果与最终通知，不让用户只看见“开始”而看不见结局。恢复命中全部缓存时，演示会显示本次新增 `agents=0 tokens=0`，并不代表历史运行没有消耗。

`Budget` 记录本次运行已消耗 token，在调用前检查剩余额度，在实际 runner 返回后计入 usage；超额会报错，避免继续启动后续步骤。由于模型请求本身先发生、usage 才能读到，任何预算都应留余量并控制每次调用上限，不能期待一个事后计数器在超额请求开始前知道精确 token。`ExecutionLimits.claim_agent()` 同时限制每 run 的 agent 调用数，嵌套 workflow 共用同一份计数。

## 跟着运行一遍

先运行 `python s16_workflow_runtime/code.py demo`，用固定 MockRunner 观察四维 audit、verify、阶段事件、journal 文件与最终输出。再运行 `python s16_workflow_runtime/code.py resume`，确认相同输入的 agent 调用命中缓存。修改保存好的 workflow 代码或输入时，不要复用旧 run ID 冒充同一运行；若需验证变更带来的重跑，应明确哪些 prompt/schema 改变及哪些后续结果需重新计算。

准备真实 API 后，运行 `python s16_workflow_runtime/code.py`，主模型与 Workflow 子 Agent 都会走真实模型。先让主模型读取待审查改动，把文本放到 `args.changes`，再调用已注册的 `review-changes`。检查输出 JSON 中确认的问题和原 diff，不能仅凭“Workflow completed”断定发现准确。

## 面试会怎么问

“什么时候用 Workflow 而不是让 Agent 自己规划？执行一半断了怎么续？”可以回答：路径已知、需要稳定并行与可校验中间结果时，把编排写进可信宿主代码；模型只负责局部不确定判断。每个子调用用结构化输出约束，下游再验证；运行时把成功结果写 journal，按稳定语义 key 复用，run lock 防同一运行并发续跑，参数变化拒绝直接复用。若题目涉及外部副作用，必须额外说明幂等与崩溃窗口，不能把 journal 当万能事务。

## 来源与延伸阅读

- [Learn Claude Code 新版 s16 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s16_workflow_runtime)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)：Harness、恢复与系统设计追问。
