# 从 Todo 清单走到任务图：依赖、认领与持久化

s05 的 TodoWrite 适合提醒一个 Agent 接下来做什么，但它只保存会话内的一张清单。项目拆成“建表、开发接口、写测试”时，系统还要知道哪项依赖哪项、谁正在做、程序重启后做到哪里。s10 的 Task System 把每项工作存成 `.tasks/task_<id>.json`，再用依赖关系决定何时能开始。

## 一个任务有哪些字段

`Task` 包含 `id`、`subject`、`description`、`status`、`owner` 和 `blockedBy`。`status` 仍为 `pending`、`in_progress`、`completed`，但与 TODO 不同，每项都有稳定 ID；`blockedBy` 是前置任务 ID 列表，`owner` 记录认领者。文件名中的 ID 是 `task_` 加 8 位十六进制随机字符。创建时使用排他写入，如果碰巧已存在就重试，避免静默覆盖。

| 操作 | 前提 | 状态变化 |
| --- | --- | --- |
| `create_task` | subject 非空 | 新建 `pending`，依赖为空，owner 为空 |
| `update_task` | 目标 pending 且未认领；依赖存在且不成环 | 给 `blockedBy` 增加边 |
| `claim_task` | 目标 pending；所有依赖 completed | 设置 owner，进入 `in_progress` |
| `complete_task` | 目标 in_progress；调用者是 owner | 进入 `completed`，下游可能解锁 |
| `list_tasks` / `get_task` | 可读任务文件 | 查看摘要或完整 JSON，不改状态 |

这六个任务工具通过原有 `TOOL_HANDLERS` 分发，基础文件工具与权限 Hooks 仍在同一个 Agent Loop。目录是持久存储，不依赖当前聊天窗口长度。

### 存储层如何保护路径与数据形状

`TaskStore._path()` 先用 `^task_[0-9a-f]{8}$` 验证 ID，再把它拼到解析后的 `.tasks/` 根目录，并检查最终路径仍在该目录。这样模型不能把 `../../other.json` 作为任务 ID 读取。`load()` 从 JSON 构造 `Task`，核对文件名里的 ID 与内容中的 `task.id` 一致，并限制状态在三种枚举中；损坏的文件会报错，不会被当作正常任务默默跳过。

创建 ID 使用 `secrets.token_hex(4)`，也就是四字节随机值表示为八位十六进制。代码最多尝试 100 次，用文件的 `open("x")` 排他创建防止已有同名文件被覆盖。普通 `save()` 则直接写整个 JSON 文件，没有 s13 那种临时文件加原子替换。因此这个版本适合顺序教学与重启恢复，不能据此宣称断电中间写入、并发修改都安全。

## 为什么先建节点，再加依赖

模型可能在同一次响应里提出多个 `create_task`，但那时还没有看到任何一个调用返回的随机 ID。不能在并列调用里凭空引用稍后才会生成的 ID。因此建图分两轮：先分别创建“schema”“endpoints”“tests”“docs”，读取四个结果里的 ID；再用 `update_task(task_id, addBlockedBy=[...])` 增加 `endpoints ← schema`、`tests ← endpoints`、`docs ← schema`。

`update_dependencies()` 会在保存前检查：目标和每个依赖都存在；不能依赖自身；加边后不能形成循环；目标必须仍是 pending、无人认领。重复提交已有依赖不会重复插入。这样做保证“进行到一半的任务”不会突然改变先决条件，但它并没有帮模型自动生成任务拆分；任务粒度仍需要按业务目标判断。

检测环不是只查两节点互相依赖。`_depends_on(dependency, target)` 从候选依赖沿 `blockedBy` 深度遍历；如果这条路径最终回到目标，新增边会成环，更新被拒绝。例如 A 依赖 B、B 依赖 C 后，试图让 C 依赖 A 会失败。重复 ID 先去重再处理，整个输入校验完成后才修改当前 Task 的列表并保存，因此本次调用不会先加一部分边再因后一条错误而留下半张新图。

依赖图表达“必须先完成”，不表达“完成了就一定正确”。如果 schema 任务只是把 JSON 标成 completed，API 任务便会解锁；真正的完成证据仍要看迁移文件、测试和审查结果。可以在 `description` 写验收条件，并在 `complete_task` 前让宿主核验，这比盲信任务状态可靠。

## 认领、完成和解锁怎样运作

`can_start(task_id)` 查每个 `blockedBy`。只要有一项不是 completed，或者依赖文件已经不见，任务就不能开始。`claim_task()` 先读任务和依赖，再设置 `owner` 与 `in_progress`。`complete_task()` 要求同一个 owner 完成进行中的任务；成功后比较完成前后的 ready 集合，列出**这次刚解锁**的下游标题，而不是把原本早已 ready 的任务都重新报一遍。

假设 `docs` 只依赖 `schema`，`tests` 依赖 `endpoints`，而 `endpoints` 又依赖 `schema`。刚创建时只有 `schema` ready；完成它后 `docs` 与 `endpoints` 同时 ready，但 `tests` 仍被 `endpoints` 挡住。完成 `endpoints` 后，`tests` 才解锁。这个例子有两条分支，提醒读者 DAG 不一定是一条单线队列；下游能否同时做，取决于依赖边，而非标题排列顺序。

调用 `complete_task` 的 owner 也要匹配。若 A 认领后由 B 提交完成，工具返回“owned by A”，状态仍是进行中。当前版本没有 lease 过期机制：A 消失时任务可能一直占用，需要由更大的宿主提供恢复或重新分配规则，不宜让 B 直接改 JSON 绕过所有权检查。

以上是一种状态机：`pending --claim--> in_progress --complete--> completed`。当前章节没有取消、失败、重开等状态。如果任务实际失败，不能为了让下游解锁而把它标为 completed；需要明确保留未完成状态、报告阻塞原因，或者扩展状态模型。`get_task` 返回完整 `description` 和依赖 ID，适合程序重启后恢复；只看 `list_tasks` 的一行摘要，可能漏掉具体要求。

## 自己建一张四节点图

运行 `python s10_task_system/code.py`，让 Agent 创建上述四项任务。第一轮只创建节点，抄下实际 ID；第二轮添加依赖。先尝试认领 `tests`，应看到仍被 `endpoints` 阻塞；认领并完成 `schema`，再列任务，`endpoints` 和 `docs` 应变为可开始。程序退出重启后，再用 `list_tasks`、`get_task` 检查 `.tasks/` 是否保留原状态。

接着故意尝试三类错误：给自己添加依赖、用不存在的 ID 添加依赖、在 `endpoints` 已认领后改它的依赖。确认每次都拒绝且原 JSON 未被部分改写。最后试错 owner 完成任务，看看它是否只按 ID 判断，还是同时检查认领者。本章运行在单 Agent 流程里，默认 owner 是 `agent`；下一章团队系统才会加强并发认领。

## 与 TODO 和团队的边界

TodoWrite 是单 Agent 当下的步骤提醒，任务图是跨会话的协调状态。一个 Task 可以包含若干 TODO 步骤；TODO 全部打勾不自动将 Task 标为完成，完成还应核验产物。反过来，Task 依赖是调度规则，不是模型对话里的普通备注。s10 的 `claim_task` 展示依赖与 owner 规则，但没有跨进程原子锁；多个 Agent 同时认领时需要 s13 的锁与文件原子替换。任务文件在磁盘上也不等于文件编辑自动隔离。

## 面试会怎么问

面经会问“长任务中断后怎么恢复，多个 Agent 怎么分工”。可从本章回答：把目标拆成稳定 ID 的任务，持久化描述、状态、owner 和依赖；只认领所有前置已完成的任务；完成时核查结果并解锁下游；重启时先读任务文件，而不是依赖聊天摘要。若问并发安全，明确指出教学版 s10 还不够，需要锁内重新读取与认领、原子保存以及 owner/lease 规则。若问“为什么不能只用 TODO”，解释 TODO 没有可恢复 ID、依赖图和认领契约。

## 来源与延伸阅读

- [Learn Claude Code 新版 s10 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s10_task_system)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)：任务恢复与 Harness 设计追问。
