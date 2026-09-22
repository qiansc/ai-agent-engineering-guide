# Unit 2 框架自测：smolagents、LlamaIndex 与 LangGraph

Hugging Face Unit 2 在每条框架实践线里都安排了不计分小测。这里把示例的 **smolagents 10 题、LlamaIndex 8 题、LangGraph 5 题**按框架放在一起，保留每题的知识点和答案依据。先读题并自己作答，再看每组下方的解析；需要动手确认的题，尽量回到前面的示例运行一次。

## smolagents：10 题

1. `smolagents` 的主要设计优势是什么：复杂配置、代码优先且抽象较少、只支持 JSON，还是只支持一种模型？
2. 什么任务适合先用它：快速原型、必须有几十个微服务的企业平台，还是只允许云模型的系统？
3. 它怎样连接不同模型？请说出至少三个模型适配类。
4. `CodeAgent` 与 `ToolCallingAgent` 对动作分别采用什么表示？
5. 与 Hugging Face Hub 的集成给工具和 Agent 带来什么便利？
6. `@tool` 与继承 `Tool` 各适合什么复杂度？
7. `CodeAgent` 怎样通过 ReAct 完成多步骤任务？
8. 把工具上传 Hub 后，另一个 Agent 是否自动获得这项能力？
9. `ToolCallingAgent` 能否多次调用工具，还是只允许一步？
10. 默认工具箱中的搜索、Python 执行和最终答案工具能帮你快速开始；它们是否自动提供完整的向量 RAG？

**解析。** 1–2：课程强调轻量、代码优先，适合快速试验和相对简单的应用；这不表示不能扩展，只是不要把框架当成整套企业基础设施。3：例如 `TransformersModel`、`InferenceClientModel`、`LiteLLMModel`，另有 OpenAI 兼容服务适配。4：前者生成并执行受控 Python，后者生成结构化工具请求。5：可发布、发现和复用仓库中的工具或 Agent。6：简单函数用 `@tool`，需要显式 schema 或较复杂状态可继承 `Tool`。7：模型产生动作、执行器运行代码并记录结果，再把观察送入下一轮，直到结束。8：不会；必须加载、审查并注册到当前 Agent。9：可以多步。10：默认工具提供常用能力，但检索管道和知识库仍需自行构建。

## LlamaIndex：8 题

1. `QueryEngine` 在 RAG 中负责什么？是否只是存放向量？
2. `FunctionTool` 的用途是什么？
3. ToolSpec 是一项工具，还是一组相关工具的打包方式？
4. 将函数传给 `FunctionTool.from_defaults` 时，名称和描述能从哪里取得？
5. `AgentWorkflow` 主要做什么？
6. 哪个对象跟踪同一工作流运行的状态？
7. 要让两次 `agent.run` 共享历史，应如何传入上下文？
8. Agentic RAG 相比固定检索—回答流程，最重要的额外选择是什么？

**解析。** 1：QueryEngine 检索相关内容，并可结合 LLM 生成回答，不只是向量容器。2：把 Python 函数变成 Agent 可用的工具。3：ToolSpec 是相关工具的集合，例如 Gmail 操作工具集。4：可从函数名和 docstring 推导；实际描述仍要核对是否清楚。5：组织一个或多个有工具的 Agent，处理运行与交接。6：`Context`。7：先创建 `ctx = Context(agent)`，连续调用时都传 `ctx=ctx`。8：Agent 可以判断是否需要检索、调用哪一个 RAG 工具，或转向其他工具；不保证每次选择都正确。

## LangGraph：5 题

1. LangGraph 主要解决模型接口、向量存储，还是带 LLM 的流程控制？
2. 在控制与自由度之间，它为什么适合固定审批、分支和人工复核？
3. `State` 仅仅是最新一次模型回答吗？
4. 条件边根据什么决定下一个节点？
5. LangGraph 能否彻底消除幻觉？若不能，它能怎样帮助控制影响？

**解析。** 1：LangGraph 侧重流程控制，模型调用组件可来自 LangChain 或其他实现。2：开发者明确规定节点与可能路径，只把合适的局部判断交给模型。3：State 是用户定义、在节点间传递的信息，可含输入、工具结果、错误和决策字段。4：路由函数读取当前状态并返回符合映射的目的节点。5：不能消除幻觉；可以加入独立校验节点、错误处理和人工分支，让未经核对的生成内容不直接变成业务结果。

## 把测验变成实作检查

选一道你答错的题，在现成示例里制造对应场景。例如不确定 `Context` 的作用，就连续运行两次「我叫 Bob / 我叫什么」；不确定条件边，就把邮件分类的 `is_spam` 改为两种值观察路径；不确定工具注册，就加载工具但故意不加入 `tools`，查看运行轨迹。这样自测结果会变成一条可复现的理解，而非只记住选择题选项。

这里的 [smolagents 代码测验](https://huggingface.co/spaces/agents-course/unit2_smolagents_quiz) 还会要求你补全代码片段、查看运行反馈。示例明确说明它不计分，也不提供证书；更适合作为实作检查。

## 面试会怎么问

**问题：框架选择题能否用项目例子解释？** 小红书面经常追问「为什么用 Agent / 为什么选框架」。回答可从这 23 题挑出与项目相关的三点：任务是否需要动态选工具、状态与条件分支是否要显式可见、知识检索是否是核心瓶颈。用自己的运行轨迹说明框架替你实现了什么，业务权限、评测和失败恢复又由谁负责；不要只背「A 框架轻、B 框架强」。

## 来源与延伸阅读

- [smolagents 第一组自测](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/quiz1)
- [smolagents 第二组自测](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/quiz2)
- [smolagents 期末测验说明](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/final_quiz)
- [LlamaIndex 第一组自测](https://huggingface.co/learn/agents-course/zh-CN/unit2/llama-index/quiz1)
- [LlamaIndex 第二组自测](https://huggingface.co/learn/agents-course/zh-CN/unit2/llama-index/quiz2)
- [LangGraph 自测](https://huggingface.co/learn/agents-course/zh-CN/unit2/langgraph/quiz1)
- [小红书 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/223fa82f976b4418b214894bd7d941fd)
