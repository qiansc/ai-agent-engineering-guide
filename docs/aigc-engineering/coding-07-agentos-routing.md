# AgentOS 运行时：入口、Gateway、会话与 Agent 怎样分层

当 Agent 只在一个聊天框里回答问题，许多状态都可以暂时放在进程内；一旦它接入 IDE、IM、Webhook 和定时任务，跨端连接、身份、会话归属与长任务恢复就成为工程主体。这里把 AgentOS 当作一种运行时分层思路，不把它误认为统一的产品标准。

## 八层各自负责什么

入口层接收 CLI、IDE、Web、移动端、聊天软件、语音、Webhook 和定时事件。Gateway 处理连接、认证、路由和事件转发；Session/Channel 层界定每条消息属于谁、在哪个上下文里；Agent Runtime 控制模型循环、工具调用和停止条件。Context Engine 拼装和压缩上下文；Tool/Skill/Plugin 层提供外部能力；安全治理层负责沙箱、策略、审批和审计；任务自动化层跟踪异步任务与触发器。

这些层可以部署在一个进程，也可以拆成服务。分层的目的，是让“模型换供应商”“IDE 换入口”“工具换连接器”不必同时改动会话和权限逻辑。

## Gateway 是控制面，不是模型本身

Gateway 接收不同端的消息和事件，按 channel、account、peer、workspace、agent ID 找到正确会话，再把模型 token、工具进度、审批请求和结果送回客户端。它还管理 start、resume、interrupt、reset、compact、stop、心跳与重连，以及可信设备或代理连接。具体推理循环应由 Runtime 拥有，Gateway 不应偷偷改写模型看到的任务状态。

对有副作用的调用，Gateway 或运行时应传递稳定 operation ID / idempotency key。客户端断线重发不能创建第二个工单或再次发送消息。若网关缓存了事件，事件序号与 session ID 必须一起校验，避免把一人的进度广播给另一人。

## Provider、Model、Runtime、Channel 四个维度

| 概念 | 负责的问题 | 例子 |
| --- | --- | --- |
| Provider | 从哪里获得模型服务 | 云供应商、私有模型网关 |
| Model | 具体推理能力和版本 | 某一型号及发布版本 |
| Runtime | 怎样循环、调用工具、记录状态 | 编码或浏览器 Agent 运行时 |
| Channel | 用户或事件从哪进入 | IDE、Web、IM、Cron |

同一 Channel 可接不同 Runtime，同一 Runtime 可按任务选不同 Model。真正需要事先明确的是：谁拥有唯一会话历史、谁决定工具集合、谁做压缩与恢复、Runtime 不可用时要失败、排队还是降级。若这些责任分散在多个组件，断线后就容易出现“UI 显示完成、任务库仍在运行”的矛盾。

## 多通道会话路由与多 Agent 隔离

路由键可包含 channel、平台账号、私聊对象/群、工作区、Agent 与事件类型。单用户本地环境可用主会话；多人场景至少按 peer 隔离，团队场景可能按 account + channel + peer 隔离。私聊与群聊、自动任务与人工对话默认应分离；路由冲突采用可解释的最具体规则优先。

| Session 范围 | 适用前提 | 主要风险或成本 |
| --- | --- | --- |
| 单一主会话 | 只有一个本地使用者 | 无法直接扩展到多人 |
| 按 peer | 每个私聊对象一条历史 | 仍须区分群与私聊 |
| 按 channel + peer | 一个账号的多群/多通道 | 路由键更多、管理复杂 |
| 按 account + channel + peer | 多组织、多账号平台 | 隔离清楚，但维护与迁移成本较高 |

Scope 越细不一定越好：同一用户跨设备继续任务可能需要显式绑定工作区，而不是因为设备不同拆成两份；群中的不同线程是否共享历史也要按产品需求定。关键是任何合并会话的行为都必须清楚可见，并经过相应数据权限判断。

多 Agent 隔离不止换 prompt。每个 Agent 还需要自己的 workspace、auth profile、session store、memory scope、tool policy、sandbox policy 和 channel binding。客服 Agent 不应因与工程 Agent 部署在同一网关，就拿到代码仓库凭证。跨 Agent 共享记忆要按用户与租户权限过滤，并保留来源。

## 路由错误如何变成泄露事故

假设同一账号接入两个工作群与一个私聊，路由器只按 `account_id` 找 session。群 A 的项目讨论就可能进入群 B 或私聊的上下文；即使模型从未“主动泄密”，回答也会引用不该出现的资料。正确的路由键至少包括平台、账号、peer 类型与 ID，并明确群线程或工作区是否再细分。写入记忆时还要保存权限范围，跨会话检索先过滤再排序。Reset 策略（手动、空闲或按日）也应明确，不然旧任务状态可能混入新请求。

多 Agent 切换时，目标 Agent 应接收经过授权的任务摘要，而非整个来源会话。比如客服 Agent 委托工程 Agent 排查一个公开错误码，可传错误码与脱敏日志，不应附上客户完整会话和客服凭证。Agent 名称相同也不代表部署或租户相同，Gateway 必须把身份与工作区一起纳入路由。

## 面试会怎么问

小红书 Agent 开发复盘问 Harness 并发控制，字节 Agent 复盘涉及长流程与上下文。若被问“设计多通道 Agent”，从入口事件的身份开始，画出路由键、会话边界、运行时所有权和重连路径；再举私聊/群聊串线和 Agent 凭证复用两种安全错误。对“AgentOS”应先说明你采用的是运行时分层定义，避免把某一产品实现当通用协议。

## 来源与延伸阅读

- [AIGC Interview Book：编码 Agent 与 AgentOS 工程高频考点，第七章](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/02_%E7%BC%96%E7%A0%81Agent%E4%B8%8EAgentOS%E5%B7%A5%E7%A8%8B%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [小红书 Agent 开发一面复盘](https://www.nowcoder.com/feed/main/detail/f1ed02bfdae04730837753b62e0d58b9)
