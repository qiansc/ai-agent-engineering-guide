# 让多个 Agent 真正协作：任务板、收件箱与工作目录

s06 的子 Agent 是一次性的：执行一项任务，返回最终文本就结束。s13 的队友是持久运行单元，可以在 `WORK` 与 `IDLE` 间切换，持续领取任务，与 Lead 交换消息，并在需要时使用独立 Git worktree。多 Agent 的难点不是“多启动几个模型调用”，而是确保每项任务只有一名 owner、结果确实回到协调者、并行修改不会偷偷踩到彼此。

## 从用户目标到团队启动

用户可能只说“重构配置、认证和测试，保持接口并确保测试通过”。Lead 先判断哪些部分能独立处理，向用户提出少量队友和职责；**得到确认后**才调用 `spawn_teammate`。启动队友会增加调用成本和有写入能力的执行者，课程 system prompt 把“先提方案，等用户确认”写成明确约束。

Lead 先创建所有 Task 节点，读回运行时 ID，再用 `update_task(addBlockedBy=...)` 建依赖图。只有 Lead 能改图；队友可以列举、认领和完成任务，但不能随工作过程任意改前置关系。Lead 可把 ready `task_id` 传给 `spawn_teammate`，宿主会在启动线程前先认领；认领失败，不会启动一个没有合法任务的队友。也可以先启动空闲队友，等它从任务板自动领取。

可以把初始分工写成“配置加载”和“认证重构”两项独立可开始任务，“回归测试”依赖前两项；若认证需要独立目录，先给认证 Task 绑定 worktree，再派人。Lead 不应在同一次模型响应里一边创建任务、一边给队友填尚未返回的随机 task ID；要等创建结果进入下一轮，再使用真实 ID 建边和派发。这是 s10 两阶段建图在团队场景中的直接延续。

## 每个队友是一段独立循环

`TeammateRuntime` 持有自己的 system prompt、`messages`、工具集合和当前 assignment。它不是父对话的一串内联消息。队友执行任务时，Lead 仍可处理其他协调工作；队友完成后回到 IDLE 等消息或新任务，不会像 s06 一样立刻销毁。

| 机制 | s06 一次性子 Agent | s13 持久队友 |
| --- | --- | --- |
| 生命周期 | 调用结束就返回 | WORK → IDLE → 再 WORK，直到关机 |
| 消息 | 新列表，结束时只返回一次文本 | 独立列表、持续收件箱、结果事件 |
| 工作领取 | 父 Agent 在 prompt 中指定 | Lead 派发，或 IDLE 扫描 ready task |
| 文件目录 | 与父 Agent 共用 WORKDIR | 必须有任务 assignment，可绑定 worktree |

队友若没有认领任务，文件和 Shell 工具会要求先认领，不会悄悄回退到主仓库目录。认领后，工具根据 assignment 解析 `cwd`；完成任务时 assignment 不立即释放，同一模型轮次后续工具调用仍在原任务目录，回到 IDLE 才释放。这避免“刚完成任务的同一响应里还有一次读取，却突然换回主仓库”的目录漂移。

## 收件箱把通信放在消息列表之外

`MessageBus` 为 Lead 和每个队友使用 `.mailboxes/<name>.jsonl`。消息记录 `from`、`to`、`content`、`type` 和 `metadata`，写入时用锁保护文件，条件变量唤醒等待者。队友进入 IDLE，先等收件箱消息；短时等待后仍无消息，才扫描任务板。这样关机、计划审批和 Lead 的直接指令先于临时发现的新任务。

Lead 的收件箱只有一个消费者 `consume_lead_inbox()`。CLI 同时监听终端输入与团队事件：队友发来事件，运行时消费收件箱、更新协议状态，把 `[Team events]` 注入 Lead 的 `history`，启动新一轮 Lead 调用。模型不需要反复调用“检查收件箱”来轮询。队友完成一项任务会发送两条不同事件：`result` 说明产物，`idle_notification` 说明可接新任务。这两件事不等价，不能合成模糊的“好了”。

例如认证队友先发 `result`：“修改了认证模块，聚焦测试通过，工作目录为 auth-refactor”；再发 `idle_notification`：“等待新任务”。第一条应让 Lead 检查产物或汇总，第二条才让调度器知道它可再领取 ready task。若只收到 IDLE 而没收到结果，不能凭空报告认证已经通过；若只收到结果而没收到 IDLE，也不能假设队友已释放目录和 assignment。

如果没有原子消费规则，Lead 的两个循环都去读同一收件箱，消息可能被其中一个拿走而另一个以为没结果。把“谁读、何时读”固定为运行时职责，是多 Agent 消息可靠性的基础。

## 扫描候选与原子认领

`scan_unclaimed_tasks()` 找 `pending`、owner 为空、依赖全完成的任务；扫描只是一张快照，不能据此直接开工。多个队友可能同时看见同一个候选。真正的 `claim_task()` 在 `task_store_lock()` 内重新读取任务，检查状态、owner、依赖、认领者是否已有进行中任务，以及任务绑定的工作目录是否有效，然后一起写入 `owner`、`in_progress` 和 assignment。

这把“发现任务”和“获得任务所有权”分开了：谁先扫到不重要，只有锁内成功认领者才能做。s13 同时使用进程内锁和文件锁，任务保存先写临时文件再原子替换，因此另一个使用同一 `.tasks/` 的 Harness 进程不应同时认领成功。认领者一次只持有一个进行中任务；完成当前任务后，IDLE 才能取下一项。若依赖文件损坏或绑定的 worktree 丢失，认领应失败，不回退到默认目录继续写。

这里还要区分“任务完成”和“队友又有空了”。`complete_task()` 验证调用者是当前 owner，推进文件状态；直到当前模型轮次结束，assignment 的 `cwd` 仍保留。队友最后汇报结果，释放 assignment，进入 IDLE 后才去扫描下一项。若完成失败，目录仍留着，便于队友修正并重试；如果错误发生在模型调用或分发层，运行时发送 `error` 并处理未完成 assignment，避免状态被无限占着。要给实际服务增加租约或心跳时，应让 owner/lease 与任务文件更新在同一原子边界内。

## Worktree 按任务绑定，而不是按队友随意切换

`create_worktree(name, task_id)` 只提供给 Lead，要求任务 pending、未认领、尚未绑定。宿主检查名称、`.worktrees/` 路径、分支名与 Git 注册表后创建 checkout，再把 `Task.worktree` 写入任务文件。工作目录来自任务绑定；队友认领后，`bash`、`read_file`、`write_file`、`edit_file`、`glob` 都按 assignment 中的 `cwd` 工作。未绑定 worktree 的合法任务使用主 `WORKDIR`。

创建可能部分成功，例如 Git 已留下分支或 registered checkout，后续一步却报错。实现代码不把这种部分结果假装成“没发生”，而是报告 partial operation、让 Task 保持未绑定，保留残留供人工检查。`assignment_cwd()` 在进程重启后可根据任务 owner 与绑定恢复工作目录；绑定损坏时直接失败，不偷偷把操作切到主仓库。

Worktree 的名称限制为字母或数字开头，后续可含字母、数字、点、下划线和连字符，长度有上限，不能包含 `..` 造成模糊路径。创建时不仅看目录是否存在，还核对 Git 自身登记的 worktree 与目标分支。若 Git 返回错误但分支已存在，不能简单重试一遍 `git worktree add`；应先检查留下的是目录、注册记录还是分支，然后由宿主决定恢复。Task 绑定写入是最后一步，避免队友看见一条指向半创建目录的 assignment。

Worktree 的默认目录只是工具执行的起点。`safe_path(p, cwd)` 仍要检查文件工具路径没有逃出该任务目录；Shell 不能靠 `cwd` 保证安全，因为它仍可通过绝对路径访问其他位置。并行任务若需要合并修改，分支合并、冲突解决和最终测试也要明确由谁负责，Worktree 本身只减少同时改同一 working copy 的冲突，并不替项目做集成。

Worktree 隔离的是 Git working copy 和分支，不是安全沙箱。Shell 仍具有宿主进程的文件与网络权限。`remove_worktree()` 是宿主侧函数，不暴露给模型；待办、进行中任务和仍持有 assignment 的当前轮次不能移除。未明确选择破坏性丢弃时，已跟踪、未跟踪、已忽略的改动都阻止清理；即使移除目录，`wt/<name>` 分支仍保留。任务完成也不等于可以立即删 worktree，先检查差异、合并或保留，再由用户/宿主决定。

## 关机与计划审批是协议，不是聊天暗号

普通讨论可以传文本，关机和审批需要类型化 `request_id`。Lead 发 `shutdown_request`，队友完成当前步骤后回 `shutdown_response`；运行时按 ID 与类型匹配原请求，并只让 pending 状态被正确回复推进。重复或不匹配的回复不能再次生效。

计划流程方向相反：Lead 要求计划，队友发 `plan_approval_request`，Lead 再用 `plan_approval_response` 批准或拒绝。队友处于 `required`、`pending`、`rejected` 时，可以读文件与提交计划，但 `bash`、`write_file`、`edit_file` 被工具分发层挡住。计划请求还记录当前 Task 与 work version；认领或释放任务会改变版本，使旧批准失效。这样“批准认证任务的计划”不会被误用在后来另一个任务上。后台队友也不直接抢终端的 `input()`；需要用户确认的危险操作返回权限错误，由 Lead 与用户处理。

初始派发可以设置 `require_plan=True`，先认领任务、打开计划闸门，再启动队友。对于已经运行的队友，Lead 也可调用 `request_plan`。Lead 回复批准时，运行时不仅看 `request_id`，还比较请求时的 Task ID 与 work version；若队友中途换了工作任务，旧回复不能解锁新任务的写工具。拒绝计划后队友可修改并重交，但不能因为收到了普通消息就自动清除闸门。

关机也不是给队友发一句“下线吧”。Lead 创建 pending 协议状态，发 `shutdown_request(request_id)`；队友完成当前步骤后回 `shutdown_response(request_id)`，Lead 消费收件箱时再匹配状态与类型。重复回执或错误 ID 不能改变另一条请求。由于队友本来有独立线程和未完成 Task，直接杀线程可能留下半写文件或悬空 owner；平滑握手让宿主能报告它停止在什么位置。

## 跟着做一次团队实验

在可丢弃的 Git 练习仓库运行 `python s13_agent_teams/code.py`，请求把配置、认证和测试拆到共享任务板，认证使用 worktree。先观察 Lead 是否提出分工并等待“开始吧”，不要在确认前创建队友。确认后检查 `.tasks/` 中的 ID、依赖、owner，`.mailboxes/` 中的结果与空闲通知，`.worktrees/` 中是否只出现绑定的目录。让两名队友同时发现同一个 ready task，核对最终只有一人成功认领；再给 IDLE 队友同时发消息和新增 ready task，观察它先处理消息。

针对计划审批，要求认证队友先提交计划，尝试在批准前写文件，应被拦截。批准后再检查它的文件工具是否使用认证 worktree。任务完成后，不要自动删除目录；先看 diff、测试与分支。整个练习会创建真实文件和分支，务必在专用仓库操作。

还可以做三个失败实验。第一，给 Lead 发一条伪造的、使用不存在 `request_id` 的计划回复，确认不改变队友闸门；第二，在队友认领新 Task 后才批准旧计划，确认工作版本使它失效；第三，破坏一个已绑定 worktree 的 Git 注册信息，尝试认领任务，确认系统报错而不落回主仓库。这些实验会触碰任务文件与 Git 元数据，适合在新建临时仓库中进行，不要在已有项目上手工破坏注册表。

## 面试会怎么问

面经问“多 Agent 怎么避免重复认领、并发改同一文件或结果丢失”，可以按三个合同回答：共享任务板只在锁内认领并写 owner；每个 Task 可绑定独立 worktree，认领后所有工作区工具固定同一 `cwd`；结果和 IDLE 分别送到 Lead 收件箱，由运行时唯一消费者投递，不靠模型轮询。再补计划审批与关机用类型、request ID、工作版本关联，旧批准不能跨任务复用。最后诚实指出 worktree 不是沙箱，文件外访问仍要靠权限和进程隔离。

## 来源与延伸阅读

- [Learn Claude Code 新版 s13 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s13_agent_teams)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/bb8c28105f364770b57ff5eb5649cc60)：多 Agent、任务恢复与 trace 追问。
