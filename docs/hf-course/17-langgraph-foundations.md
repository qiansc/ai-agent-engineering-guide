# LangGraph 基础：用 State、Node 和 Edge 控制执行路径

当任务有明确步骤和分支，例如「收到邮件后分类，垃圾邮件丢弃，重要邮件起草回复」，用图表达流程比让模型随意决定所有步骤更容易检查。LangGraph 允许你把状态、处理节点和转移边写出来，在需要判断文本的局部再调用模型。

## 什么时候值得用图

普通 Python 的 `if`、函数和循环也能实现同样逻辑。LangGraph 的价值在于把多步骤执行路径、共享状态、条件转移、可视化和需要人工介入的地方组织成一套约定。这里把它放在「控制」较强的一侧，与更自由地生成代码动作的 `smolagents CodeAgent` 对照。这里没有谁天然更高级：固定流程只需简单代码时，框架会增加抽象；当状态分支和恢复变复杂，显式图更方便团队读懂与测试。

课程举了文档问答例子：普通文本可直接走文本处理，表格可能要先读取成结构化数据，再由工具操作。文档类型分支可以由程序确定；即使节点里使用模型，也不意味着每条边都交给模型自由选择。需要状态持久化、人工确认或确定性规则与模型判断混合的任务，才更值得引入图。

LangChain 提供模型、检索和工具等组件的接口；LangGraph 关注带状态的执行路径。两者可配合使用，也可按需要分别使用。别把「用了 LangChain」自动理解为「有了多步运行图」。

## State：节点之间流动的信息

最小状态可以只包含一段文字：

```python
from typing_extensions import TypedDict

class State(TypedDict):
    graph_state: str
```

真实应用的状态应包含后续节点必须读取的字段，例如邮件正文、分类结果、起草文本、错误状态。状态不是任意堆积的聊天历史。每个字段要问：谁写它、谁读它、什么时候有效、失败后是否保留。若路由依赖 `category`，分类节点就必须明确写入它。

## Node：接收状态并返回更新

这里的第一张图有三个节点，第一步给字符串加 `I am`，后面按分支加 `happy!` 或 `sad!`：

```python
def node_1(state: State):
    print("---Node 1---")
    return {"graph_state": state["graph_state"] + " I am"}

def node_2(state: State):
    print("---Node 2---")
    return {"graph_state": state["graph_state"] + " happy!"}

def node_3(state: State):
    print("---Node 3---")
    return {"graph_state": state["graph_state"] + " sad!"}
```

节点可以只做确定性计算，也可以调用 LLM、工具或等待人工输入。它返回的是状态更新；后续节点读到的是合并后的状态。示例直接拼字符串，便于看见状态如何流动；生产节点应避免把「模型猜测」和「工具确认的事实」混到同一个字段。

## Edge：规定下一步走向哪里

直接边固定去下一个节点；条件边读取当前状态并返回目的节点。课程用随机数做 50/50 分支，只为演示路由 API：

```python
import random
from typing import Literal

def decide_mood(state: State) -> Literal["node_2", "node_3"]:
    if random.random() < 0.5:
        return "node_2"
    return "node_3"
```

在实际业务中，应根据状态里的真实判定来路由，而不是随机。例如 `state["spam"]` 为真去归档，否则去起草回复。路由函数返回的名称必须与图中已注册节点匹配；没有对应边的结果会使流程失败。

## StateGraph：装配、编译和运行

```python
from langgraph.graph import StateGraph, START, END

builder = StateGraph(State)
builder.add_node("node_1", node_1)
builder.add_node("node_2", node_2)
builder.add_node("node_3", node_3)
builder.add_edge(START, "node_1")
builder.add_conditional_edges("node_1", decide_mood)
builder.add_edge("node_2", END)
builder.add_edge("node_3", END)

graph = builder.compile()
result = graph.invoke({"graph_state": "Hi, this is Lance."})
print(result)
```

一次运行可能得到 `Hi, this is Lance. I am happy!`，也可能得到 `... sad!`。你可以用 `graph.get_graph().draw_mermaid_png()` 在支持的环境中查看图结构；可视化显示的是**可能路径**，不是某次运行真的走了哪条边。要解释一次结果，还得看运行时路由输入和选择。

## 练习：把随机分支改成可测试分支

在 `State` 中增加 `mood: Literal["happy", "sad"]`，让 `decide_mood` 根据字段路由。分别传入两个值，断言结果包含正确后缀；再传入未知值，决定是明确报错、要求补充，还是设置默认分支。做到这一步，你就从「图能跑」走向「路径可验证」。

## 面试会怎么问

**问题：Planner/Executor/Critic 与 LangGraph 节点是不是同一回事？** 小红书面经涉及这些角色。回答时说清它们是任务职责，LangGraph 的 node/edge/state 是实现这些职责的一种控制流方式：Planner 可写计划状态，Executor 执行工具，Critic 根据结果检查；也可以不用三个模型 Agent，而是一个模型节点加确定性的检查节点。关键在于状态字段、路由条件、失败与终止路径是否明确，而不是节点名称有多漂亮。

## 来源与延伸阅读

- [Hugging Face Agents Course · 何时使用 LangGraph](https://huggingface.co/learn/agents-course/zh-CN/unit2/langgraph/when_to_use_langgraph)
- [Hugging Face Agents Course · LangGraph 构建模块](https://huggingface.co/learn/agents-course/zh-CN/unit2/langgraph/building_blocks)
- [小红书 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/223fa82f976b4418b214894bd7d941fd)
