# Gala 案例（三）：把检索与工具组装成 Agent

宾客检索、网页搜索、模拟天气和 Hub 统计已经能单独工作。现在要解决的不是“再加一个工具”，而是：收到一句自然语言请求后，如何选择工具、把结果接起来、保留必要的上下文，并在信息不足时停下来说明。

先把前两篇中的实现保存到 `retriever.py` 与 `tools.py`，确认每个工具可单独调用，再装配 Agent。这样出错时能够区分是工具本身坏了，还是 Agent 没有正确调用工具。下面的代码展示三条框架路线；选择其中一条做实验即可。

## 路线一：smolagents 的 CodeAgent

```python
from smolagents import CodeAgent, InferenceClientModel
from tools import DuckDuckGoSearchTool, WeatherInfoTool, HubStatsTool
from retriever import load_guest_dataset

model = InferenceClientModel()
guest_info_tool = load_guest_dataset()
search_tool = DuckDuckGoSearchTool()
weather_info_tool = WeatherInfoTool()
hub_stats_tool = HubStatsTool()

alfred = CodeAgent(
    tools=[guest_info_tool, search_tool, weather_info_tool, hub_stats_tool],
    model=model,
    add_base_tools=True,
    planning_interval=3,
)
```

`tools` 是智能体可用的外部能力清单，不是要求它每次把所有工具调用一遍。`add_base_tools=True` 会加入框架内置能力；`planning_interval=3` 则让运行在一定步数后重新规划。工具越多，选择错误、调用成本和暴露面也越多，因此每一个工具的描述、参数和返回值都要足够清楚。

装配完成后先试一句只需要一个工具的问题：

```python
answer = alfred.run("Tell me about Lady Ada Lovelace in our guest list")
print(answer)
```

检查运行日志：它应使用宾客检索，而非仅靠模型记忆写出 Ada 的历史简介。宾客名单里的邮箱、关系和备注属于教学数据，不应被当成真实人物资料。

## 路线二：LlamaIndex 的 AgentWorkflow

同一组工具也可注册为 LlamaIndex 的工具/函数，再交给 AgentWorkflow：

```python
from llama_index.core.agent.workflow import AgentWorkflow
from llama_index.llms.huggingface_api import HuggingFaceInferenceAPI
from tools import search_tool, weather_info_tool, hub_stats_tool
from retriever import guest_info_tool

llm = HuggingFaceInferenceAPI(model_name="Qwen/Qwen2.5-Coder-32B-Instruct")
alfred = AgentWorkflow.from_tools_or_functions(
    [guest_info_tool, search_tool, weather_info_tool, hub_stats_tool],
    llm=llm,
)

response = await alfred.run("Tell me about Lady Ada Lovelace in our guest list")
print(response)
```

这里的 `await` 需要在异步环境（如 Notebook 单元格或 `async def main()`）中运行。`guest_info_tool` 是上一节为 LlamaIndex 建好的工具实例，不能直接把 smolagents 的 `Tool` 对象原样传入。模型是否支持所需工具调用格式、API Token 是否配置好、各集成包版本是否匹配，都应在运行前逐项确认。

## 路线三：LangGraph 的“模型—工具—模型”循环

LangGraph 里要显式定义状态、节点和边。`add_messages` 把新消息追加到会话；`tools_condition` 判断最新模型回复是否请求工具，`ToolNode` 执行请求，随后回到 assistant 生成下一步。

```python
from typing import Annotated, TypedDict
from langchain_core.messages import AnyMessage, HumanMessage
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from langchain_community.tools import DuckDuckGoSearchRun
from tools import weather_info_tool, hub_stats_tool
from retriever import guest_info_tool

llm = HuggingFaceEndpoint(repo_id="Qwen/Qwen2.5-Coder-32B-Instruct")
chat = ChatHuggingFace(llm=llm)
tools = [guest_info_tool, DuckDuckGoSearchRun(), weather_info_tool, hub_stats_tool]
chat_with_tools = chat.bind_tools(tools)

class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def assistant(state: AgentState):
    return {"messages": [chat_with_tools.invoke(state["messages"])]}

builder = StateGraph(AgentState)
builder.add_node("assistant", assistant)
builder.add_node("tools", ToolNode(tools))
builder.add_edge(START, "assistant")
builder.add_conditional_edges("assistant", tools_condition)
builder.add_edge("tools", "assistant")
alfred = builder.compile()

response = alfred.invoke({
    "messages": [HumanMessage(content="Tell me about Lady Ada Lovelace in our guest list")]
})
print(response["messages"][-1].content)
```

三个版本的关键区别不是“谁更智能”，而是控制流放在哪里：smolagents 用 CodeAgent 执行生成的操作，LlamaIndex 用 AgentWorkflow 协调工具，LangGraph 则把状态和跳转边显式画出来。即使使用同一个模型、同一组工具，也不要假定三者会产生相同回答。

## 四个端到端练习

### 1. 查询宾客

问题：“Tell me about Lady Ada Lovelace in our guest list.” 观察是否调用宾客检索、是否区分名单里的设定与 Ada 的历史事实、是否只透露当前任务需要的字段。如果检索不到，正确回答是“名单中未找到”，不是编造关系或邮箱。可以把名单里某个名字故意写错，检查检索误命中和澄清行为。

### 2. 判断巴黎今晚能否放烟花

问题：“What's the weather like in Paris tonight? Will it be suitable for fireworks?” 这里的天气工具**随机返回模拟值**，所以它只能验证“Agent 会不会调用天气工具并解释返回值”。它无法提供真实的今晚预报，也无法替代风速、降水、能见度、许可和现场安全检查。测试时应要求最终回答写明“模拟天气，不能作为放烟花依据”；如果它直接给出可执行许可，就说明工具输出的可信度没有传到回答层。

### 3. 查 AI 组织的热门模型

问题：“Which model from Qwen has the most downloads on Hugging Face Hub?” 观察是否调用 Hub 统计工具，并给出查询时点、模型 ID 与下载数。下载数会变化，不能把某次示例输出当成固定答案；“最受欢迎”也不等同于“下载最多”，应明确采用的指标。

### 4. 组合宾客资料与外部资料

问题：“I need to speak with Dr. Nikola Tesla about wireless energy. Help me prepare.” 这会要求智能体先查宾客资料，再搜索无线能量相关材料，最后分开呈现“名单设定”“可核验的外部信息”“建议的对话问题”。练习数据里的“与 Tesla 同过大学、最近获得专利、邮箱”等明显是虚构设定，不能写成历史事实。搜索结果也可能混入不相关的无线通信、IoT 或营销信息；模型需要筛掉不能支持主题的结果，并在拿不到可靠近期资料时说明局限。

这四题覆盖单工具、时效数据、多工具组合和不可信数据边界。评价时别只看答案是否流畅；还要看调用轨迹、证据来源、遗漏字段、错误处理与越权结论。

## “她”是谁：跨轮对话怎样保留状态

第一轮问 Ada，第二轮问 “What projects is she currently working on?”，模型只有拿到上一轮上下文才能判断 `she` 的指代。三个框架都需要显式处理，不应把一次 `run()` 或 `invoke()` 调用误认为永久记忆。

smolagents 可在后续运行保留同一 Agent 的执行记忆：

```python
alfred.run("Tell me about Lady Ada Lovelace in our guest list")
alfred.run("What projects is she currently working on?", reset=False)
```

LlamaIndex 可把两次运行绑定同一个 `Context`：

```python
from llama_index.core.workflow import Context

ctx = Context(alfred)
first = await alfred.run("Tell me about Lady Ada Lovelace", ctx=ctx)
second = await alfred.run("What projects is she currently working on?", ctx=ctx)
```

LangGraph 可以显式把上一次返回的消息送回图中：

```python
first = alfred.invoke({
    "messages": [HumanMessage(content="Tell me about Lady Ada Lovelace")]
})
second = alfred.invoke({
    "messages": first["messages"] + [HumanMessage(content="What projects is she currently working on?")]
})
```

也可配置 checkpointer（例如 `MemorySaver`）和稳定的会话 ID，让图按线程保存状态。无论哪种做法，记忆都只是把过去的消息重新提供给模型，不保证数据真实；如果宾客档案没有“目前项目”，应该坦言未知，而不是根据 Ada 的历史知识捏造一个“当前项目”。多用户服务还必须隔离各会话，避免上一位用户的内容进入下一位用户的上下文。

## 动手验收

用四类问题各跑一次，记录：实际调用了哪些工具；每个工具输入/输出是什么；最终回答有没有标注模拟值、虚构设定或时间敏感信息；工具失败时是否降级。再跑一次跨轮指代，并用一个全新会话验证状态不会串线。能解释每次工具选择与答案依据，才算真正完成了端到端案例。

## 面试会怎么问

**问：把检索、搜索和业务 API 都注册给 Agent 后，如何防止它把模拟或不可信结果写成确定结论？** 答：先在工具契约里标明数据来源、时效和可信度，返回结构化状态；编排层保留调用轨迹；回答层区分事实、模拟、推断，并对安全决策设置人工或规则校验。这个案例的随机天气只能测工具调用，不能批准烟花。

**问：为什么第二轮“她现在做什么”会答错？** 答：如果没有传递历史消息或绑定同一会话上下文，指代没有依据。即使传了历史，如果检索结果没有当前项目，也应回答未知。检查的是状态管理与证据约束两个问题，而非单纯扩大上下文窗口。

## 来源与延伸阅读

- [Hugging Face Agents Course：Creating Your Gala Agent](https://huggingface.co/learn/agents-course/unit3/agentic-rag/agent)
- [宾客检索原稿](https://huggingface.co/learn/agents-course/unit3/agentic-rag/invitees)；[工具原稿](https://huggingface.co/learn/agents-course/unit3/agentic-rag/tools)
