# Provider Router、Tool Registry、Skill Hub 与插件如何分工

生产级 Agent 往往接多种模型、企业 API、MCP 工具和复用流程。如果模型选择、工具定义、权限与技能安装散落在各入口，版本和风险难治理。把不同能力放进各自的注册与路由层，能够让 Runtime 用稳定契约调用它们，同时保留动态扩展空间。

## 模型路由与工具注册不是一回事

Provider Router 解决模型供应商接入、能力查询、Fallback、速率限制、成本统计、凭据解析，以及推理、视觉、工具调用等能力适配。路由不只看价格：需要按任务所需能力、数据驻留、延迟和失败情况选模型，并记录本次实际版本。

Tool Registry 管工具 schema、执行 handler、工具组、可用性检查、权限风险、返回长度和动态刷新。模型提出的工具调用先匹配注册信息，再经权限检查，之后才由 handler 执行。注册表存在某工具，并不代表当前用户、当前平台或当前任务有权使用。

| 工具元数据 | 用途 |
| --- | --- |
| `name`、`schema`、`handler` | 标识工具、校验参数、执行动作 |
| `toolset` | 按 Web、Terminal、Memory、Browser 等分组 |
| `check_fn`、`requires_env` | 检查依赖、配置和凭据可用性 |
| `risk_level`、`audit_policy` | 控制审批、脱敏与审计 |
| `is_async`、`max_result_size` | 管执行方式和上下文占用 |
| `owner/source`、`version` | 区分内置、插件、MCP 和企业工具 |

模块自注册能减少单个中心文件的膨胀，但 Registry 仍需稳定快照：一次 Run 不能在中途无提示地换掉工具 schema。昂贵的可用性探测可缓存；MCP 等动态工具刷新时更新 generation 并使旧缓存失效。结构化工具结果有助于 Trace、评测和失败恢复。

## Tool 和 Skill 的边界

Tool 是可执行动作，Skill 是完成某类任务的流程、模板、参考资料与可选脚本。Skill Hub 要让读者和 Runtime 知道一个 Skill 是什么、何时启用、依赖哪些工具与环境变量、谁维护、哪个版本、适用哪个用户/团队/项目，以及它要求的权限。

一个可治理的 Skill Hub 会包含描述、标签、版本、作者/来源、示例、使用统计、评分反馈，以及 `pinned`、`archived`、`deprecated` 状态。外部 Skill 引入前要扫描路径穿越、敏感文件访问、恶意脚本和注入内容。条件激活可避免把所有 Skill 文档每轮塞进上下文，也避免在依赖工具缺失时误导模型。

“Marketplace”只是分发界面；真正难的是依赖、权限、版本兼容、审计、撤回与生命周期。一个 Skill 说“运行 Shell 脚本”并不自动赋予执行权限，工具侧仍要独立批准。

## 插件如何扩展而不吞掉核心

Plugin System 可以接入新的 IM/邮件平台、业务工具、Skill、Memory Provider（例如 mem0、Supermemory 等）、Context Engine、Observability（例如 OpenTelemetry、Langfuse）或管理界面。插件声明 manifest、版本兼容、配置 schema、所需权限和依赖；生命周期应包括初始化、启用、升级、停用与卸载。Hooks 要定义可读写的对象与副作用，不应默认暴露 Runtime 的全部内部状态。

最小权限是默认设置：高风险插件显式启用，平台适配插件验证消息来源，外部服务凭据单独管理，插件触发的工具调用进入同一 Trace。否则一个“可插拔”的系统会绕开原本的权限、审计和租户边界。

## 一次任务怎样用到这几层

用户让 Agent 查找订单并生成答复。Provider Router 根据所需能力和预算选择模型；Tool Registry 向当前 Session 暴露有权限的订单查询工具；适用的客服 Skill 提供政策流程；平台插件把 IM 消息转换成统一事件。模型调用工具时，Registry 校验 schema，权限系统做最终决定，结果进入 Trace。若模型或工具失败，路由和 Registry 给出明确失败，而不是让 Skill 自行绕过安全边界。

## 面试会怎么问

**问：为何需要 Provider Router 与 Tool Registry？** 前者管模型能力、成本与回退，后者管工具契约、可用性与风险；用一次请求串起两者。

**问：工具注册表包含什么？** 除 `name/schema/handler` 外讲 `check_fn`、风险级别、来源版本、审计和动态刷新，说明注册不等于授权。

**问：Skill Hub 怎么设计？** 从能力包内容、依赖、作用域、条件激活、扫描、版本与归档讲，而不只讲 Prompt 下载。

**问：插件能扩展哪些能力？** 平台、工具、记忆、上下文、观测和 UI；追问安全时说明权限声明、消息验证、隔离与 Trace。

## 来源与延伸阅读

- [AIGC Interview Book：自进化 Agent 与多平台运行时，第 9–12 题](https://github.com/WeThinkIn/AIGC-Interview-Book/blob/main/AI%20Agent%E5%9F%BA%E7%A1%80/09_%E8%87%AA%E8%BF%9B%E5%8C%96Agent%E4%B8%8E%E5%A4%9A%E5%B9%B3%E5%8F%B0%E8%BF%90%E8%A1%8C%E6%97%B6%E9%AB%98%E9%A2%91%E8%80%83%E7%82%B9.md)
- [Agent Skills Open Standard](https://agentskills.io/)
