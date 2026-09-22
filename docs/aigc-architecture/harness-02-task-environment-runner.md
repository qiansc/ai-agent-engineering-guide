# 任务、环境与 Runner：怎样做可复现的 Agent 评测

评测 Agent 时，一条“请帮我退款”的 Prompt 远远不够。模型能否完成任务，取决于它看到了哪张订单、有哪些工具、是否需要审批、系统从什么状态开始，以及怎样判断最后的状态。将这些条件明确写成任务规格，才有可能公平比较两个版本。

## 一条任务要写到什么程度

可执行任务通常拆成三部分：

| 部分 | 必要内容 | 常见遗漏 |
| --- | --- | --- |
| Task Spec | `task_id`、用户输入、任务类型、难度、风险、工具权限、禁止动作、轮数/时间/成本上限、人工确认要求 | 只存一段自然语言问题 |
| Environment Spec | 数据库和文件快照、仓库 commit、浏览器状态、API mock、用户模拟器、网络与凭据范围、随机种子 | 任务之间共享被修改的环境 |
| Expected Outcome | 最终答复或 Artifact、数据库状态、文件 diff、禁止发生的动作、必要证据、允许的多条合法路径 | 只用最终答案关键词匹配 |

一个示例任务可以这样表示；字段只是说明组成，不意味着通用框架必须照此命名：

```yaml
task_id: customer_refund_001
domain: retail
risk_level: high
input:
  user_message: "我想退掉昨天买的蓝色外套"
initial_state:
  database_snapshot: snapshots/retail_001.sql
  policy_doc: policies/refund_policy.md
tools:
  allowed: [search_order, inspect_item, create_refund_request]
  denied: [direct_refund_payment]
expected:
  final_database_state:
    refund_status: pending_review
  forbidden_actions: [direct_refund_payment]
grading:
  outcome_weight: 0.5
  safety_weight: 0.3
  trajectory_weight: 0.2
```

用户话术可以变化，结果不必逐字一致，但订单、权限和最终业务状态要能判定。对于真正无法预先枚举的开放式答案，再补语义评分或人工复核。

## 环境模拟器为什么必不可少

Environment Simulator 或 Sandbox 让 Agent 真正执行动作，同时把动作限制在可重置、可审计的范围内。它至少有四个用途：从同一初始状态开始的**复现**；文件、数据库、网络、密钥的**隔离**；API 超时、权限不足、用户反悔等**异常注入**；任务结束后比较状态的**判分**。

不同场景关注的状态不同：

| 场景 | 需要固定和比较的环境 |
| --- | --- |
| 编码 | 仓库 base commit、依赖、失败测试、测试命令、容器 |
| 浏览器 | DOM/页面、登录态、表单和弹窗、网络响应、后台状态 |
| 客服 | 模拟用户、订单库、政策、业务 API |
| 数据分析 | 数据库快照、查询权限、指标口径、报表模板 |
| 多 Agent | Agent Card、消息与任务状态、handoff Artifact |

“沙箱”不等于所有东西都用假的。编码任务可以运行真实编译和测试，只是不能伤害用户仓库；客服任务可使用与生产同形的 API，但写入隔离数据库。高风险权限和凭据不应直接带入评测环境。

## Runner 怎样保证公平比较

Runner 接收一个任务和一组版本化配置，为每次运行生成 `run_id`。它应固定模型、Prompt、工具 schema、Policy、Memory、RAG 索引、温度、`top_p`、轮数与预算，同时固定环境快照和随机种子。固定条件只能降低无关波动，不能消除模型随机性，所以重要任务仍应多次运行，比较分布和方差。

每个任务要使用独立沙箱。Runner 负责超时、取消、重试和资源清理；批量并发时不能让两个任务共用被修改的数据库或文件目录。工具结果若缓存或回放，应记录缓存命中和原始版本，否则“回放”可能悄悄变成新环境。

最少保留 `run_id`、`task_id`、Agent 版本、最终状态、Trace ID、成本、延迟、评分、失败标签和 Artifact。排障时先打开某个 Run，检查它实际使用的版本组合与环境，而不是拿一个通过率数字猜原因。

## 从任务设计到报告的一次运行

退款例子开始前恢复订单快照，加载政策与允许工具；Runner 带着固定版本启动 Agent。Agent 查询订单并尝试创建退款申请，环境记录工具调用与数据库变化。完成后 Grader 检查申请状态、禁止动作、答复说明和成本。无论通过还是失败，Runner 清理沙箱并保存 Trace。第二版 Agent 运行同一任务时重建同一初始环境，才能比较策略变化。

## 面试会怎么问

**问：Task Spec、Environment Spec、Expected Outcome 分别写什么？** 先用上表区分用户目标、运行初态和最终状态，再补工具权限、风险与多条合法路径。可画一条“快照 → 运行 → 比较状态”的流程。

**问：沙箱有什么价值？** 不只说“安全”，还要说重置、隔离、故障注入与判分；用编码仓库和退款数据库分别举例。

**问：Runner 怎样可复现、可对比、可回放？** 讲固定版本和配置、每任务独立环境、`run_id` 与完整 Trace、多次重复运行。若被追问模型随机性，不承诺字节级确定性，改用同条件下的统计比较。

## 来源与延伸阅读

- [AIGC Interview Book：Agent Harness Engineering，第 5–8 题](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/08_Agent_Harness_Engineering%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
