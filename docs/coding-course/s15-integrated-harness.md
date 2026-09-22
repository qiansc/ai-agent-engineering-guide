# 把机制接回同一个 Agent Loop：集成 Harness 的事件顺序

前十四章把工具、权限、计划、记忆、后台任务、团队和 MCP 分开讲。s15 不再发明一种新 Agent，而是把这些机制接到同一个宿主循环里。读这一章，最重要的是看**事件发生的顺序**：通知何时进入消息、压缩何时进行、动态工具池何时重建、权限在工具执行之前还是之后、出错时哪些状态要恢复。

## 一轮模型调用前，宿主做了什么

`agent_loop(messages, context, active_request)` 先取已经到期的 CronJob，把 `[Scheduled] {prompt}` 追加为消息，并将这份定时请求加入本轮 `active_request`。接着注入已完成的后台通知；若 TODO 已连续多轮未更新，追加 reminder。随后 `prepare_context()` 按 s08 的顺序处理大结果、归档中段、缩短旧结果、必要时摘要；`update_context()` 选择相关记忆、读取 Skill 目录与 MCP/队友状态；最后 `assemble_tool_pool()` 重新生成本轮工具定义与 handler map。

为什么必须每轮重建工具池？`connect_mcp()` 可以在上一轮增加 server，下一轮模型就应看到新工具；某个外部连接失效时也不能继续暴露旧入口。为什么压缩要在调用模型前？因为上下文预算影响的是这次请求，而不是已经返回的上次响应。为什么 Cron 的 prompt 要放进 `active_request`？否则压缩后只保留用户最近手打的请求，可能把定时任务弄丢。

| 阶段 | 进入下一步的条件与数据 |
| --- | --- |
| 事件收集 | Cron 到期、后台结果、TODO 提醒进入 `messages` |
| 上下文准备 | 可恢复的大输出先落盘；旧历史必要时压缩 |
| 提示组装 | 当前记忆、Skill 目录、连接的 MCP、身份与工作区进入 system |
| 工具池组装 | 26 个内置工具与已连接 MCP 工具共同提供 schema/handler |
| 模型调用 | 带重试、fallback、长上下文补救与输出截断处理 |
| 工具执行 | 每个 `tool_use` 先经过 `PreToolUse`，再分发或进入后台 |
| 下一轮 | 每个调用配齐 `tool_result`，通知与新状态继续进入消息 |

`BUILTIN_TOOLS` 列出 26 个名称：五个基础工具，`todo_write`、一次性 `task`、`load_skill`、`compact`，六个 Task 工具，三个 Cron 工具，团队通信与计划工具、`create_worktree`、`connect_mcp`。名字相近但职责不同：`task` 是一次性子 Agent；`create_task` 是持久任务图；`spawn_teammate` 是持久队友。

可以把工具分成几组记忆，而不必死背 26 个名称。基础文件和 Shell 工具负责直接观察与操作；`todo_write` 和 Task 图负责单会话计划与持久协调；`load_skill`、记忆和压缩负责模型可见信息；Cron 与后台 Bash 负责时间和执行等待；Team 与 Worktree 负责多 Agent 的任务/目录；MCP 负责外部工具发现。每组都接入同一个 `tool_use`/`tool_result` 机制，区别在宿主执行边界。

## 工具执行边界不能被集成稀释

模型返回的内容块里可能同时有文本和多个 `tool_use`。实现代码只遍历真实工具块，为每个调用产生唯一配对的结果。普通工具先触发 `PreToolUse`；被拒绝也会返回对应 `tool_result`，不会跳过 ID。允许后若是显式后台 bash，就启动任务并返回占位；否则查 handler 执行，并触发 `PostToolUse`。如果本批次包含 `compact`，它先得到请求压缩的工具结果；整批结果追加后才做历史摘要，防止发生过的写入从对话中消失。

权限在本章比早期教学版更严格：Lead、一次性子 Agent 和队友的工具都先经过权限 hook；文件工具越过 `WORKDIR` 会直接拒绝，每条 bash 命令执行前都要求确认，MCP 未知工具不会因为 server 描述“只读”而自动放行。只有前台轮次可以交互确认；Cron 或队友等异步轮次遇到需要确认的动作会拒绝，不争抢 CLI 输入。计划闸门还会在队友获批前挡住 `bash`、`write_file`、`edit_file`。

## 多种状态各有存放位置

`todo_write` 是内存中的当前会话计划；`.tasks/task_*.json` 是带 ID、依赖和 owner 的持久任务图；`.memory/` 保存跨任务可能复用的知识；`.transcripts/` 与 `.task_outputs/` 保存压缩前的可恢复原文；Cron 的 durable 定义在 `.scheduled_tasks.json`；团队邮箱在 `.mailboxes/`；worktree 绑定写入 Task；MCP 连接与后台线程结果在当前运行时维护。它们用途不同，不能因为“都能恢复某些东西”就互相代替。

一次用户请求可以同时碰到这些层，但每层的更新时间不同。用户说“下周每天早上检查 CI”会先产生 Cron 定义；到点后提示进入 `messages`；模型可读取 Skill、发后台命令、把结果转存；若发现稳定项目事实，回合结束才可能提取为 Memory。把一次性 CI 失败写成长期偏好会污染后续会话，把 Cron 定义只留在聊天里会在重启后消失，把后台占位当最终结果会过早报告。集成运行时的价值之一，就是让每类状态由负责的组件保存。

一次性 `task` 会在干净 `messages` 中做子调查，只把最终摘要返回；持久队友则有自己的循环、收件箱和 WORK/IDLE 生命周期。队友可以接 Lead 指定的 ready task，也可以在空闲时先处理消息、再原子认领一个 ready task。任务 assignment 决定它的文件工具 `cwd`。任务完成不会让同一轮后续工具突然切目录；回到 IDLE 才释放。队友异常会发送 `error` 事件，并尝试把未完成 assignment 释放回任务板，不应让任务永远被离线队友占着。

队友循环每次请求模型前先读收件箱，所以直接消息或关机请求不会被连续 tool-use 轮次饿死。空闲队友短时等邮箱，只有超时才扫描就绪 Task；扫描仍不等于所有权，原子 claim 成功后才切换到 WORK。若 Lead 指定初始 Task，线程启动前已完成认领，避免“队友开始跑了才发现 Task 被别人占用”。计划闸门与 assignment version 也在这里生效：换任务会使旧计划批准失效，普通聊天消息不会。

## 模型请求失败时的恢复顺序

`call_llm()` 包着 `RecoveryState`。429 限流按指数退避重试；529 服务过载也退避，连续失败且配置了 `FALLBACK_MODEL` 时可切换；遇到 `max_tokens` 截断先增加上限，再要求 continuation，并限制恢复次数。若上下文过长，尝试一次 `reactive_compact()`。其他错误不会被包装成“成功”：循环恢复尚未确认交付的 CronJob，追加错误消息，释放完成的 assignment 后返回。

恢复逻辑还有几处容易漏掉的细节。模型返回 `stop_reason=max_tokens` 时，这可能是一条被截断的回答，不能把它当完成；先用更大的 `max_tokens` 重试，仍不足才追加 continuation 提示，并限制次数。成功模型响应之后才确认之前取出的 CronJob；若模型调用失败，则把尚未确认的定时任务恢复到队列，避免到点提醒只在本地消息里出现过一次就被丢掉。输出截断、上下文超长、限流和服务过载都不是同一错误，不能统一“重试三次”处理。

“自动重试”要按错误类型划界。模型请求本身通常可以重发，但若先前工具已经造成外部副作用，不能因下一轮模型失败就重放整个工具批次。实现代码通过消息与任务状态避免部分断裂；生产系统还需要对付款、发信、部署等不可逆动作采用幂等键与状态查询。Fallback 模型也不是质量等价的保证，必须用相同评测集验证工具参数和安全行为。

## Cron、后台和团队事件如何唤醒 Agent

后台 bash 在工具调用时先返回 `bg_id` 占位，worker 完成后以 `<task_notification>` 进入会话；Cron 到点后队列将 prompt 送入；队友则通过 Lead 收件箱发 result、idle 或协议回复。CLI 外还有 `async_event_loop()`，在持有 `agent_lock` 时检查这些事件，自动唤醒一轮 Lead。没有这条事件入口，模型即使能启动后台任务，也可能永远不再被调用来读取结果。

`agent_lock` 还保护前台用户输入与异步事件不会同时驱动同一份 `history`。异步循环拿到锁后先读 Cron 队列、Lead 收件箱和后台状态，再把团队事件格式化加入消息，确定本轮 `active_request`，调用同一个 `agent_loop`。前台 CLI 则在锁内触发 `UserPromptSubmit`、追加用户消息、运行循环。二者入口不同，核心循环相同；这正是“一个 Harness”而不是每种事件另写一个 Agent 的含义。

Cron 交付采用至少一次语义：模型调用失败时未确认的任务放回队列；模型成功接收后再确认。后台任务非零退出或 worker 异常应发 `failed`，不能只说“任务结束”。团队事件使用收件箱唯一消费与 request ID 协议，不依赖模型主动轮询。三种通知最后都成为模型下一轮的输入，但原始事件来源和可靠性约束各不相同。

## 一个贯穿练习

在可丢弃项目运行 `python s15_integrated_harness/code.py`。先只读询问哪些 Python 文件重要，观察基础工具、权限和 `tool_result`；连接 mock docs server，核对下一轮动态 MCP 工具出现。接着让 Agent 在后台运行短命令，同时读 `README.md`，检查先有占位再有完成通知。再设置几分钟后的只读提醒，保持进程运行，确认自动触发；最后创建两项有依赖的 Task，给其中一项绑定 worktree，要求队友修改前提交计划，观察计划批准前后的工具闸门、assignment `cwd` 与团队消息。

每一步留下一条最小 trace：用户请求、模型工具调用与 ID、权限结果、实际工具输出、状态文件/工作目录变化、下一轮收到的通知。若中途异常，先看哪一步已经产生副作用、哪个事件尚未确认，再决定是否能安全重试。别在原本重要的仓库中直接试团队写入、worktree 清理和部署工具。

## 面试会怎么问

如果面试官问“这些模块接到一起时，最容易出什么错”，可沿事件顺序回答：工具结果没配对就摘要会导致 API 拒绝或重复副作用；先执行后审批会越权；后台只返回启动占位却没有完成通知会假完成；队友认领不原子会重复写；Cron 在确认窗口崩溃会重复交付；恢复时切换工作目录会误写主仓库。说明每个风险由哪个宿主合同负责，再给一条可复现测试。这样的回答比把 26 个工具名背出来更能体现集成能力。

## 来源与延伸阅读

- [Learn Claude Code 新版 s15 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s15_integrated_harness)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)：Harness、超时与任务恢复追问。
