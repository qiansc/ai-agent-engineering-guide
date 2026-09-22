# 慢命令放到后台：占位结果、完成通知与清理

一次完整测试可能需要数分钟。同步执行时，Agent Loop 会停在 `bash` handler，模型无法继续读配置、分析其他文件。s11 让模型在工具参数中显式写 `run_in_background=true`，宿主启动后台线程并立即返回任务 ID；命令结束后再把通知送进后续对话。

## 后台执行必须显式选择

`should_run_background(tool_name, tool_input)` 只在工具名为 `bash` 且 `run_in_background is True` 时返回真。它不根据命令里有没有 `install`、`test` 或 `build` 猜测。相同命令不带参数仍同步运行；其他工具即便带这个字段也不会进入后台路径。明确开关使 trace 里能解释为什么这次工具调用立即返回，也避免误把本应等待的命令异步化。

`execute_tool()` 的顺序是：先触发 `PreToolUse`，若权限拒绝就返回拒绝文本；允许后再判断同步或后台；最后触发 `PostToolUse`。因此“后台”不会绕过命令审批。对模型而言，这次 `tool_use` 仍收到一个正常的 `tool_result`，内容类似 `[Background task bg_0001 started]`。这个占位表示**已经启动**，不是命令执行成功。

## BackgroundManager 保存什么

`BackgroundManager` 用锁保护 `tasks`、`results` 和 `_ready` 完成队列。`start()` 分配 `bg_id`、登记运行状态、启动 daemon 线程后立即返回。worker 调用 `_run_bash_process()`，按退出码把任务标为 `completed` 或 `failed`，保存格式化输出，并把 ID 放进 `_ready`。`collect()` 取出已经完成的结果，格式化成 `<task_notification>`。同一个完成结果不应被重复取出。

原 `tool_use_id` 已经配给了“任务已启动”的占位结果。后续通知是新事件，**不再用原 ID 冒充第二个 `tool_result`**。Agent 在下轮模型调用前收集通知，并把它作为 user 侧文本消息追加；模型才能结合先前任务与新结果决定是否继续。若命令非零退出，通知要明确失败，不能把“进程结束”当成功。

| 时间 | 宿主与模型看到什么 |
| --- | --- |
| 模型请求 `bash(..., run_in_background=true)` | 先审批，后台登记 `bg_id`，本轮工具结果为启动占位 |
| 命令正在运行 | Agent Loop 可处理其他工具和模型轮次 |
| worker 结束 | 保存退出码、输出、完成或失败状态；ID 入完成队列 |
| 下一轮入口 | 收集 `<task_notification>`，作为新消息交给模型 |

## shell 子进程的生命周期

实现代码用 `subprocess.Popen(..., start_new_session=True)` 为命令建独立进程组，并在正常结束、超时或程序经正常路径与 `SIGTERM` 退出时尝试停止该组。它还把进程登记到集合，便于清理。这个措施解决“教学程序退出后常见子进程还在跑”的问题，但不是安全沙箱：进程若另建 session，可能离开原进程组；命令仍可访问宿主有权访问的文件和网络。

后台线程是 daemon，任务状态保存在本进程内存中。进程崩溃或重启后，原 `bg_id` 不能自动恢复，完成通知可能丢失。因此本章适合说明异步通知机制，不适合作为生产级持久作业队列。要跨重启可靠运行，还需要外部 worker、持久任务状态、幂等键与取消/恢复协议。即使进程组被清理，也应确认命令已经造成的文件或远端副作用，不能看到超时就盲目重试。

## 动手观察异步往返

运行 `python s11_background_tasks/code.py`，让 Agent “后台运行 `pip list`，同时列出目录中的 Python 文件”。观察是否先得到 `bg_id`，然后能处理查文件请求。再在练习环境中让它后台运行短暂等待命令，同时读 Markdown 文件；在后续轮次检查 `<task_notification>` 是否含结束状态。还可以用 `npm install` 与 `package.json` 作例子，但安装会改变工作目录，务必在可丢弃的练习项目里操作。

再对比同一条短命令带和不带 `run_in_background` 的 trace：同步路径直接回最终输出；后台路径先回占位、后回通知。试一个非零退出命令，确认通知是 `failed`；试一个超时命令，确认输出与进程清理信息能区分“命令没完成”和“收集消息失败”。

## 面试会怎么问

面经问“工具调用太慢怎么处理，后台任务结束后 Agent 如何恢复”。回答应分清启动确认与最终完成：先权限校验，再用任务 ID 异步启动，立刻回占位；worker 保存退出码与输出，后续通过独立通知唤醒会话；最终完成条件要等真实结果。若需跨重启，再持久化任务状态和执行意图、用幂等键防重复副作用。只把同步调用改成线程，不足以回答取消、超时、进程崩溃和重复通知。

## 来源与延伸阅读

- [Learn Claude Code 新版 s11 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s11_background_tasks)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)：工具超时与恢复追问。
