# 设计企业级 Agent Harness 平台

当多个团队都在做 Agent，只靠每个项目自己的评测脚本，很难公平比较模型、工具与策略变更，也难以复现线上事故。平台化的目的，是把任务、隔离环境、运行配置、Trace、判分和发布决策统一成可复用契约；业务团队仍负责自己的任务目标、政策和验收规则。

## 八层架构，各层交付什么

| 层 | 主要能力 | 关键输出 |
| --- | --- | --- |
| Dataset | 任务集、风险标签、版本、脱敏历史失败 | 可追踪的任务版本 |
| Environment | Docker/VM、浏览器、数据库、API mock、用户模拟器、多 Agent 网络 | 可重建的初始状态 |
| Runner | 批量/并发、版本固定、超时、取消、重试、清理 | 独立 Run 和 Artifact |
| Trace | 模型、工具、状态、审批、成本事件 | 可回放的调用链 |
| Grading | 规则、测试、状态、模型裁判、人审及组合评分 | 逐维度分数和失败标签 |
| Report | 通过率、版本差异、风险、成本、延迟趋势 | 可钻取的发布报告 |
| Gate | CI、Prompt/Tool 发布、模型切换、策略与灰度门禁 | 放行、阻断、回滚依据 |
| Feedback | 线上失败、人工反馈、事故样本入库 | 新任务及修复验证 |

平台的数据关系可由 Task Version、Environment Version、Agent Configuration、Run、Trace、Grade、Release Decision 串联。报告中的任何结论都应能定位到这些版本，避免任务悄悄变化后仍把前后结果直接比较。

## 从脚本走向模型原生评测

传统脚本 Harness 由外部脚本调用模型 API，手动 mock 工具并记录日志；适合轻量问答和定制评测。更深地集成 Agent SDK/Runtime 后，可以直接捕获工具调用、文件/命令执行、沙箱、审批和长任务状态。它更容易把运行时 Trace 与评测 Grader 连接，也更适合多轮、多工具和有副作用任务。

两者不是互斥替代。若业务只需评估分类或摘要，外部脚本可能足够；若要判断“Agent 是否在仓库里安全修复缺陷”，需要真实工具、状态与权限的运行时级评测。选择依据是任务的可观察行为，而不是技术名词新旧。

截至原材料整理时，常被讨论的方向包括：沙箱优先、完整轨迹评分、最终状态判分、模拟用户、多 Agent 交接、每次变更持续评测，以及把轨迹转成训练/评测样本。这些方向可以作为平台能力路线，不能因为用了某个 SDK 就默认全部已经具备。

## 平台必须守住的边界

任务和环境版本化；确定性结果优先用规则/测试/状态比较；每个 Run 保存 Trace 与 Artifact；安全任务集独立维护；重要任务多次运行；Harness 自身不持有生产高危写权限，只在沙箱或 dry-run 执行。发布门禁还要看按风险切分的退化，不能让总分掩盖关键故障。

举例说，一次客服 Agent 评测失败，平台应能告诉团队：任务使用哪版政策与订单快照、Agent 哪次工具调用被拒绝、最终数据库是什么状态、Grader 哪条规则失败。如果只能得到“得分 0.6”，平台还不足以支持工程改进。

## 建设顺序

先选择一个高价值且可判分的场景，定义任务规格和可重置环境；建立 `run_id`、版本组合、Trace 与确定性评分；接入 CI 阻断明显回归；再添加故障注入、模型裁判、人审、Shadow/Canary 和跨团队共享能力。平台化应复用稳定契约，不必在第一天建完所有仪表盘。

## 面试会怎么问

**问：2026 年 Harness Engineering 的方向是什么？** 可以从 Sandbox、Trace、State Grading、Synthetic User、Continuous Eval 和线上失败回流讲，并说明这些是能力方向，需按业务场景验证价值。

**问：Model-native Harness 与脚本 Harness 有何差别？** 对比工具/沙箱/Trace 是否为 Runtime 原生能力，不夸称传统脚本无用。用编码 Agent 与纯摘要评测两个场景判断选择。

**问：请设计企业级 Agent Harness 平台。** 先定一类任务与安全边界，画八层主路径，再回答任务/环境版本化、并发隔离、判分组合、报告钻取、门禁阈值和失败回流。追问成本时可说明分层任务集与按风险运行频率。

## 来源与延伸阅读

- [AIGC Interview Book：Agent Harness Engineering，第 22–24 题](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/08_Agent_Harness_Engineering%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [OpenAI Agent evals](https://platform.openai.com/docs/guides/agent-evals)
