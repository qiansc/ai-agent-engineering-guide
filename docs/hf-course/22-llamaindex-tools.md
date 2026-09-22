# LlamaIndex 的四类工具：函数、查询引擎、ToolSpec 与按需加载

LlamaIndex 的工具层把普通 Python 函数、RAG 查询引擎或外部服务封装成 Agent 可理解的接口。课程列出 `FunctionTool`、`QueryEngineTool`、ToolSpec 和 Utility Tools 四类。它们解决的问题不一样：前两类提供一项明确能力，ToolSpec 打包相关能力，Utility Tools 处理过大的外部结果。

## FunctionTool：把一个函数交给 Agent

先做固定天气工具：

```python
from llama_index.core.tools import FunctionTool

def get_weather(location: str) -> str:
    """Return sample weather for a location."""
    print(f"Getting weather for {location}")
    return f"The weather in {location} is sunny"

weather_tool = FunctionTool.from_defaults(
    get_weather,
    name="my_weather_tool",
    description="Return sample weather for a given location.",
)
print(weather_tool.call("New York"))
```

这个函数对任何地点都返回晴天，只用于展示包装与调用，不是实时天气 API。`FunctionTool` 可接同步或异步函数；名称、描述、参数类型和 docstring 会影响模型是否选它、如何传参。写工具时应确保描述没有夸大实现，也要检查失败返回及用户授权。

## QueryEngineTool：把检索问答交给 Agent

上一课的 `VectorStoreIndex` 可以转换为 `QueryEngine`；课程再把它包装成工具，供 Agent 在需要时查询资料：

```python
from llama_index.core.tools import QueryEngineTool

query_engine = index.as_query_engine(llm=llm, similarity_top_k=3)
query_engine_tool = QueryEngineTool.from_defaults(
    query_engine=query_engine,
    name="party_records",
    description="Search the authorized party plans and menu records.",
    return_direct=False,
)
```

`similarity_top_k=3` 控制送入生成阶段的候选数；它并不能确保三条都相关。课程原代码把名称和描述留成 `"name"`、`"a specific description"` 占位，真实应用必须替换成资料范围清楚的词。若有多个知识库，可分别包装并写明边界，让模型能选对；资料访问控制仍应在查询层执行。

## ToolSpec：一组有共同目的的工具

ToolSpec 适合把同一服务相关操作放在一起。课程以 `GmailToolSpec` 示范：安装 Google 集成包，创建 ToolSpec，调用 `to_tool_list()` 取得工具列表，再查看每个工具的 metadata。

```bash
pip install llama-index-tools-google
```

```python
from llama_index.tools.google import GmailToolSpec

tool_spec = GmailToolSpec()
gmail_tools = tool_spec.to_tool_list()
print([(t.metadata.name, t.metadata.description) for t in gmail_tools])
```

这段只是展示如何发现工具，不意味着 Agent 已经获准读取或发送邮件。邮件类工具会触及用户数据和外部副作用，接入时还需服务凭据、权限范围和发送确认。不要把整包工具未经审查全部注册给 Agent。

## Utility Tools：让大结果保持可用

外部 API 有时返回很长的文档或列表，直接塞进模型上下文既昂贵又可能淹没有用信息。课程介绍两种按需处理方式：

- `OnDemandToolLoader` 包装已有 reader，调用时加载数据、临时建索引并查询。适合不想预先长期索引的一次性数据读取，但每次调用的加载与索引成本要计入预算。
- `LoadAndSearchToolSpec` 包装任意已有工具，生成「加载」和「搜索」两个工具。先让原工具取得长结果并建立索引，再针对结果搜索，不必反复把完整输出交给模型。

它们改变了数据路径，不能只看最终回答。要记录原始工具返回、建立的索引、检索到的片段以及清理时机；涉及私有数据时还要控制临时索引的可见范围。这里把这些 Utility Tools 作为方向介绍，没有给出可直接运行的完整代码，因此这里也不补造参数。

## 练习：给工具写“适用边界”

为 `my_weather_tool`、`party_records` 和 Gmail 工具各写两句话：它能回答什么，不能回答什么。再给模型三个问题：「纽约当前天气」「去年 Wayne 家的晚宴菜单」「请代我发送邀请」。第一个工具是模拟天气，不应谎称实时；第二个需要命中资料；第三个应先确认发送权限和内容。工具描述越贴近实际能力，Agent 的选择就越容易验证。

## 面试会怎么问

**问题：Function Calling 和 RAG 是什么关系？** 字节面经有这类追问。Function Calling 是模型请求某项工具的接口形式；RAG 是先检索资料再依据资料生成的任务流程。`QueryEngineTool` 让 Agent 可以通过工具调用进入 RAG，但 RAG 也可以由固定工作流直接触发，不一定需要 Agent。回答时画清模型、工具、检索器、索引和最终答案的边界，并说明权限与来源在哪里检查。

## 来源与延伸阅读

- [Hugging Face Agents Course · LlamaIndex 工具](https://huggingface.co/learn/agents-course/zh-CN/unit2/llama-index/tools)
- [工具配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/llama-index/tools.ipynb)
- [字节 Agent 开发一面面经](https://www.nowcoder.com/discuss/929406267141914624)
