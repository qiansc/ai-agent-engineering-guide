# LangGraph 文档 Agent：让模型在视觉提取与计算工具间选择

邮件分拣图的路径由程序明确规定。这一课让模型自己在工具中选择：Wayne 先生上传一张训练和餐食笔记图片时，Agent 可以先用视觉模型提取文字，再根据问题整理晚餐采购清单；用户只问「6790 除以 5」时，则调用除法工具。图仍负责循环和终止，模型负责提出下一项工具请求。

## 状态怎样保存消息与文件

这里使用 `AgentState`，其中 `input_file` 是可选文件路径，`messages` 使用 `add_messages` 作为合并规则。节点返回新消息时，状态会把它追加到已有消息，而不是整个覆盖：

```python
from typing import Annotated, Optional, TypedDict
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    input_file: Optional[str]
    messages: Annotated[list[AnyMessage], add_messages]
```

这与前一课手动用 `old_messages + new_messages` 更新状态不同。`input_file` 仅是路径字符串，本身不代表文件已存在、可读或已经获用户授权。文件读取工具要做这些检查。示例注释说可处理 `PDF/PNG`，但后面的代码只把字节当 `image/png` 送给视觉模型，不能直接认定它支持 PDF。

## 两个工具：视觉提取与除法

先创建 `ChatOpenAI(model="gpt-4o")` 作为视觉模型。`extract_text` 打开图片文件、做 base64 编码，用包含文字指令与 `image_url` 的多模态消息请求提取图中文字：

```python
import base64
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

vision_llm = ChatOpenAI(model="gpt-4o")

def extract_text(img_path: str) -> str:
    """Extract visible text from an authorized local PNG image."""
    with open(img_path, "rb") as image_file:
        image_bytes = image_file.read()
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    message = HumanMessage(content=[
        {"type": "text", "text": "Extract all text from this image. Return only the text."},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}},
    ])
    return vision_llm.invoke([message]).content.strip()

def divide(a: int, b: int) -> float:
    """Divide a by b."""
    if b == 0:
        raise ValueError("divisor must not be zero")
    return a / b

tools = [divide, extract_text]
```

示例的 `extract_text` 在任意异常时打印错误并返回空字符串；这样 Agent 可能把读取失败误当成「图片没有字」。上面的代码让错误显式返回给工具执行层，便于将「文件不存在」「格式不支持」「模型服务失败」区分处理。真正服务还应限制文件路径到用户授权的上传目录、检查 MIME、大小与隐私边界；`open(img_path)` 若接受模型随意指定的绝对路径会有严重风险。

## 助手节点与工具节点如何循环

模型通过 `bind_tools(tools, parallel_tool_calls=False)` 获得结构化工具调用接口。课程同时在系统消息中给出工具说明与当前 `input_file`；工具绑定和文字说明要保持一致。

```python
from langchain_core.messages import SystemMessage

llm = ChatOpenAI(model="gpt-4o")
llm_with_tools = llm.bind_tools(tools, parallel_tool_calls=False)

def assistant(state: AgentState):
    system = SystemMessage(content=(
        "You are Alfred. Use extract_text only for the authorized input image "
        "and divide for arithmetic. The current image path is: "
        f"{state['input_file']}"
    ))
    reply = llm_with_tools.invoke([system] + state["messages"])
    return {"messages": [reply]}
```

`ToolNode(tools)` 根据模型的请求运行工具；`tools_condition` 查看助手最新消息，若包含工具请求就走工具节点，否则结束；工具节点返回后再回到助手。这一次图中有真实工具调用，所以是可观察的 ReAct 循环：

```python
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

builder = StateGraph(AgentState)
builder.add_node("assistant", assistant)
builder.add_node("tools", ToolNode(tools))
builder.add_edge(START, "assistant")
builder.add_conditional_edges("assistant", tools_condition)
builder.add_edge("tools", "assistant")
react_graph = builder.compile()
```

路径可以用 `react_graph.get_graph(xray=True).draw_mermaid_png()` 查看。图显示工具分支和返回边，不保证模型每次都选对工具；这要通过下面两个样例验证。

## 两个对照任务

计算任务输入：

```python
react_graph.invoke({
    "messages": [HumanMessage(content="Divide 6790 by 5")],
    "input_file": None,
})
```

示例轨迹是模型调用 `divide(a=6790, b=5)`，工具返回 `1358.0`，模型再给出答案。你应检查是否真有 Tool Response，而非模型直接算出相同数字。两个结果虽然一样，工具使用行为不同。

图片任务输入 `input_file="Batman_training_and_meals.png"`，问题是「根据 Wayne 先生的笔记，晚餐菜单要采购什么」。示例输出有草饲西冷牛排、有机菠菜、Piquillo 辣椒、土豆和鱼油 2 克。这是教学演示轨迹，不代表本网站重新读取了那张图片。实际运行中应保留图像或提取文本，逐项核对清单；如果提取不完整，就不能补造采购物品。

## 失败处理与适用范围

本例可延伸出几个明确测试：`input_file=None` 时模型不应调用 `extract_text`；图片不存在时应返回工具错误；PDF 不应以 PNG 数据 URL 送入；`divide(1, 0)` 应报告除零；提取结果含不可信指令时不能让它重写系统任务。`add_messages` 能保留消息，但不会自动缩短长图片描述或提供持久化。长任务还需预算、权限与状态保存策略。

## 面试会怎么问

**问题：多模态 Agent 怎样把图片内容用于后续工具调用？** TikTok 面经涉及 ASR、多模态和隐私。回答可以按本课的消息路径：文件经授权上传，工具读取并调用 VLM 提取内容，结果作为工具消息追加到图状态；模型依据该观察再决定计算或总结。指出提取错误、空结果、敏感图片和提示注入各在哪一层处理，并说明最终清单要能追溯到图片中的具体内容。

## 来源与延伸阅读

- [Hugging Face Agents Course · LangGraph 文档分析 Agent](https://huggingface.co/learn/agents-course/zh-CN/unit2/langgraph/document_analysis_agent)
- [配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/langgraph/agent.ipynb)
- [TikTok AI Agent 开发秋招面经](https://www.nowcoder.com/feed/main/detail/7b1b40fda3244715a82bcb4a821ca887)
