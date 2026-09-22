# 什么时候需要 Agent 框架：smolagents、LlamaIndex 与 LangGraph

做一个 LLM 应用不一定要从框架开始。若程序固定执行「读取输入 → 调一次模型 → 写出结果」，几行 Python 通常更容易理解和测试。模型开始选择工具、重复行动、保存状态或与其他 Agent 协作时，你会不断实现同一批基础设施：模型适配、工具定义、动作解析、消息历史、错误记录、重试和结束条件。框架在这里提供可复用的抽象。

Hugging Face Unit 2 选择三条实践路线。`smolagents` 的入口较轻，重点展示模型如何写代码或结构化工具调用；`LlamaIndex` 侧重数据、索引、检索和基于上下文的 Agent；`LangGraph` 把状态、节点、边与路由写成显式图，适合需要明确流程和状态转移的场景。它们并非只能做各自一件事，课程这样安排是为了让你从不同角度看 Agent 系统。

| 先问自己 | 可能的起点 | 需要继续核对 |
| --- | --- | --- |
| 是否只有固定步骤？ | 普通 Python 工作流 | 模型是否真的要决定下一步 |
| 想快速试一个工具型 Agent？ | smolagents | 代码执行权限、工具描述、调用轨迹 |
| 核心难题是把私有资料用于回答？ | LlamaIndex | 数据加载、切分、索引、检索与评测 |
| 分支、状态与恢复很关键？ | LangGraph | 状态字段、条件边、停止和持久化策略 |

挑框架之前，可以先写一个不依赖框架的最小运行轨迹：用户输入是什么、模型能提出哪些动作、每个工具返回什么、失败如何处理、何时结束。若这些问题没有答案，换框架也不会自动产生可靠系统。反过来，已有清楚的运行合同后，框架能减少重复代码，并让团队集中测试具体任务。

本单元后面的实践文章会继续保留三个框架的独立代码路径。学习时无需一次安装所有依赖；先跑通一条路径，理解其状态和执行轨迹，再比较另一个框架如何表达同一行为。

## smolagents 为什么适合第一条实践线

`smolagents` 的主要 Agent 抽象是多步骤运行。`CodeAgent` 让模型生成代码片段，再由受控执行器运行；`ToolCallingAgent` 接收结构化工具调用，由框架分派到具体工具。前者适合把循环、条件和中间变量组成一个动作，后者适合一组边界清晰的工具。代码形式有表达力，但代码执行权限需要格外小心；JSON 形式较易限制到预先声明的工具。

课程还列出几种模型适配方式：`TransformersModel` 使用本地 transformers 模型，`InferenceClientModel` 连接 Hugging Face 推理服务，`LiteLLMModel` 通过 LiteLLM 接入其他模型服务，`OpenAIServerModel` 和 `AzureOpenAIServerModel` 分别面向相应 API 形状。它们说明同一个 Agent 抽象可以换模型后端，但不意味着模型之间的工具调用能力、聊天模板、价格和可用性相同。换模型后至少重跑工具选择、参数生成与终止测试。

## 面试会怎么问

**问题：为什么选 Agent 框架，而不是自己写循环？** 小红书面经问过为什么用 Agent，也追问 Planner/Executor 等结构。回答时先说明任务复杂度：若固定流程、一次模型调用能解决，普通代码更可控；若需要模型动态选择工具、多个观察后调整计划，框架可承接工具 schema、循环、状态和日志。随后说清你选的框架替你解决了什么、哪些业务校验仍自己实现。不要把「用了 LangGraph」当作架构理由。

## 来源与延伸阅读

- [Hugging Face Agents Course · 框架介绍](https://huggingface.co/learn/agents-course/zh-CN/unit2/introduction)
- [Hugging Face Agents Course · 为什么使用 smolagents](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/why_use_smolagents)
- [小红书 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/223fa82f976b4418b214894bd7d941fd)
