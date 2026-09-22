# 多平台 Agent：统一入口，又不混淆会话

一个长期工作的 Agent 可能从终端接到任务，在聊天软件里要求审批，通过邮件发出结果，再由定时器启动下一次巡检。如果每个入口都独立拼 Prompt、保存历史和管理权限，同一任务就难以继续，用户和团队的数据也容易串线。多平台 Gateway 的工作是把不同入口转成统一事件，再送入同一套 Agent Runtime 与任务状态管理。

## 入口如何进入同一个 Runtime

| 层 | 责任 | 典型字段或动作 |
| --- | --- | --- |
| Platform Adapter | 对接 CLI、TUI、Web、IM、Email、Webhook、API | 鉴权、接收消息/附件、发送平台结果 |
| Message Normalizer | 把平台格式转成统一事件 | `user_id`、`channel_id`、`thread_id`、文本、附件、时间 |
| Session Router | 找到正确的会话与任务 | 平台、工作区、频道、用户、Agent、Task |
| Command Registry | 统一 slash command 与控制命令 | 中断、恢复、状态、帮助 |
| Runtime Adapter | 处理模型循环、工具、流式响应和审批 | Run 状态、工具事件、待批准动作 |
| Delivery Layer | 按平台能力转换输出 | Markdown、分片消息、文件、图片、语音 |

入口层不要各自实现一套任务逻辑，也不要直接用未经校验的消息拼系统提示词。Telegram、Discord、Slack、邮件和终端的交互能力并不相同：有的平台支持按钮审批，有的只有纯文本；发送失败需要重试与去重；附件、媒体和消息长度要转换。远程审批回传时要验证发起者与目标任务，不能把“群里有人回复同意”当成所有动作的授权。

## 会话边界要明确

只以用户名作为 Session ID 会出问题：同一人可能同时在私聊、工作群和邮件里处理不同任务；不同组织甚至可能有同名用户。一个会话范围通常由 `platform`、`account/workspace`、`channel/thread`、`user`、`agent_id`、`task_id` 共同决定。

| Scope | 何时使用 | 要防止的混淆 |
| --- | --- | --- |
| Per-user | 私人助理 | 不同用户共享偏好与历史 |
| Per-channel/thread | 群聊、频道、邮件线程 | 群聊内容流入私聊或别的任务 |
| Per-workspace | 企业多租户 | 跨组织检索和工具权限泄露 |
| Per-task | 长任务、Cron | 后台任务污染当前聊天会话 |

默认采用最小共享，私聊/群聊分离、租户隔离、自动任务独立 Session；`reset`、`resume` 和 `archive` 应有明确定义。Trace 保存完整 scope，但敏感标识与内容要符合数据保留策略。跨平台“继续同一任务”需要身份绑定和明确的任务关联，不应靠模型从文本猜测。

## 长期任务为什么需要事件驱动

聊天请求可以在一次响应里结束，长任务会遇到用户打断、工具等待、审批、定时触发和后台完成通知。`interrupt` 允许用户停止错误方向或危险动作；`resume` 需要恢复计划、上下文、文件与工具状态；`cron` 触发例行任务；`background task` 让耗时工作继续运行，并在完成、失败或待审批时通知。

这些能力背后是持久化 `task_id`、状态机、事件记录与可取消的工具执行。恢复时不能只读聊天摘要，还要核实外部副作用：例如邮件是否已经发出、文件是否已写入。重新执行有副作用动作需要幂等键或人工核对，避免中断后重复发送或重复付款。

## 面试会怎么问

**问：多平台 Gateway 的价值是什么？** 讲统一入口、会话连续、权限隔离、消息格式、审批回传、通知与观测，再用一条 CLI 发起、IM 审批、邮件交付的任务说明主路径。

**问：怎么设计 Session 隔离？** 列出平台、工作区、频道/线程、用户、Agent 和 Task，解释为何只用 `user_id` 不够。

**问：为何需要 interrupt、resume、cron、background task？** 将它们对应用户控制、故障恢复、周期触发、耗时处理，落到持久任务状态和副作用去重。

## 来源与延伸阅读

- [AIGC Interview Book：自进化 Agent 与多平台运行时，第 5–8 题](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/09_%E8%87%AA%E8%BF%9B%E5%8C%96Agent%E4%B8%8E%E5%A4%9A%E5%B9%B3%E5%8F%B0%E8%BF%90%E8%A1%8C%E6%97%B6%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
