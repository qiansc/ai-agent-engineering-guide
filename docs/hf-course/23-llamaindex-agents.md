# LlamaIndex AgentWorkflow：函数调用、ReAct、记忆与交接

有了工具后，Agent 才有东西可选。LlamaIndex 课程介绍函数调用 Agent、ReAct Agent 与可定制的高级 Agent，并用 `AgentWorkflow` 管理一个或多个 Agent。先从乘法工具开始，再把 `QueryEngine` 包成检索工具，最后让计算 Agent 与资料查询 Agent 协作。

## 从乘法工具建一个 Agent

课程用 `FunctionTool.from_defaults` 包装 `multiply`，再创建工作流：

```python
from llama_index.core.agent.workflow import AgentWorkflow
from llama_index.core.tools import FunctionTool
from llama_index.llms.huggingface_api import HuggingFaceInferenceAPI

def multiply(a: int, b: int) -> int:
    """Multiply two integers and return the product."""
    return a * b

llm = HuggingFaceInferenceAPI(model_name="Qwen/Qwen2.5-Coder-32B-Instruct")
agent = AgentWorkflow.from_tools_or_functions(
    [FunctionTool.from_defaults(multiply)],
    llm=llm,
)
response = await agent.run("What is 2 times 2?")
```

`await` 表示异步运行；在普通 Python 脚本中应放进 `async def` 并通过事件循环调用，在 Notebook 中可按其异步支持直接执行。这里的意思是当前工作流可根据模型能力选择函数调用或 ReAct 路线；这取决于实际版本与模型接口，运行时应检查 trace，而不是由模型名称猜测。ReAct 通过文本/聊天形式描述步骤，函数调用通过结构化请求描述工具；两者都需要真实执行和结果回填。

## 同一工作流怎样记住上一轮

课程明确指出，单独调用 `agent.run(...)` 不等于保留前一轮对话。要复用上下文，可创建 `Context(agent)`，两次调用都传同一个 `ctx`：

```python
from llama_index.core.workflow import Context

ctx = Context(agent)
await agent.run("My name is Bob.", ctx=ctx)
response = await agent.run("What was my name again?", ctx=ctx)
```

这只证明在同一上下文对象中可复用状态；跨进程或长期持久化需要另行设计。若处理多个用户，请给每个会话独立上下文，不能复用同一 `ctx` 导致信息串线。长期任务还要考虑状态大小和私有信息保留时间。

## 把 QueryEngine 变成 Agent 可选的资料工具

`QueryEngineTool` 的 `name` 与 `description` 告诉模型它查的是什么数据。课程用 `similarity_top_k=3` 创建引擎，并把工具交给新的 `AgentWorkflow`：

```python
from llama_index.core.tools import QueryEngineTool

query_engine = index.as_query_engine(llm=llm, similarity_top_k=3)
query_tool = QueryEngineTool.from_defaults(
    query_engine=query_engine,
    name="persona_records",
    description="Search authorized persona descriptions in the indexed records.",
    return_direct=False,
)
query_agent = AgentWorkflow.from_tools_or_functions(
    [query_tool],
    llm=llm,
    system_prompt="Use the records when a question requires persona information.",
)
```

如果资料不在索引中，模型不应凭常识补出「数据库答案」。`return_direct=False` 让结果可继续经过 Agent 处理，具体返回机制以所用版本文档为准。测试时分别问索引中有答案和没有答案的问题，观察模型是否选择工具及如何处理空结果。

## 多 Agent：计算与资料检索分工

课程给出 `calculator` 和 `info_lookup` 两个 ReAct Agent：前者有 `add`、`subtract` 工具，后者有 `query_engine_tool`。`AgentWorkflow(agents=[...], root_agent="calculator")` 规定首先由计算 Agent 接收用户消息，之后可交接给更合适的 Agent。

```python
from llama_index.core.agent.workflow import AgentWorkflow, ReActAgent

def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

def subtract(a: int, b: int) -> int:
    """Subtract b from a."""
    return a - b

calculator = ReActAgent(
    name="calculator",
    description="Perform basic arithmetic",
    system_prompt="Use arithmetic tools for math operations.",
    tools=[add, subtract],
    llm=llm,
)
info_lookup = ReActAgent(
    name="info_lookup",
    description="Look up facts in authorized records",
    system_prompt="Use the query tool for record-based questions.",
    tools=[query_tool],
    llm=llm,
)
workflow = AgentWorkflow(
    agents=[calculator, info_lookup],
    root_agent="calculator",
)
print(await workflow.run(user_msg="Can you add 5 and 3?"))
```

如果大量问题都是资料检索，`root_agent="calculator"` 可能产生不必要的交接；根 Agent 的选择应反映主要入口。名称和描述要让工作流清楚何时转给谁。多 Agent 仍要保存交接事件、工具结果和最终答案来源，不能用「子 Agent 已处理」代替验证。

## 练习：从无状态走向有状态

分别运行两次「我叫 Bob」「我叫什么」：一次不传 `Context`，一次复用 `ctx`；比较实际响应和轨迹。再让计算 Agent 处理需要查资料的问题，确认是否交接给 `info_lookup`。若没有，先检查 Agent 描述和根 Agent 选择，而不是盲目增加更多提示。

## 面试会怎么问

**问题：多 Agent 会话怎样避免上下文串线？** 小红书面经问过多 Agent 并发和上下文隔离。回答时以 `Context` 为例：每个用户/任务有独立的状态对象和标识，子 Agent 只接收完成任务所需的资料；交接结果带来源和任务 ID，管理者汇总时区分不同会话。并发执行后检查状态写入顺序、重复动作与失败回滚，不能把「每个 Agent 有自己的 prompt」当成充分隔离。

## 来源与延伸阅读

- [Hugging Face Agents Course · LlamaIndex Agents](https://huggingface.co/learn/agents-course/zh-CN/unit2/llama-index/agents)
- [Agents 配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/llama-index/agents.ipynb)
- [小红书 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/223fa82f976b4418b214894bd7d941fd)
