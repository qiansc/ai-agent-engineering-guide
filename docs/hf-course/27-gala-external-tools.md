# Gala 案例（二）：搜索、模拟天气与 Hub 统计工具

宾客名单回答的是晚会内部问题。要回答外部信息，Alfred 还需要搜索工具；要演示烟花天气判断，可以接一个天气工具；要查 AI 开发者在 Hugging Face Hub 的模型下载量，可以接 Hub 统计工具。三类工具的数据时效、可信度和执行方式都不同，装配进 Agent 前先把用途说清。

## 网页搜索：拿到最新信息，再核对来源

`smolagents` 可以直接注册 `DuckDuckGoSearchTool()`：

```python
from smolagents import DuckDuckGoSearchTool

search_tool = DuckDuckGoSearchTool()
print(search_tool("Search for current news about AI agents"))
```

LlamaIndex 可从 `DuckDuckGoSearchToolSpec` 取得搜索函数并包装为 `FunctionTool`；LangGraph 可用 LangChain 的 `DuckDuckGoSearchRun()`：

```python
from llama_index.tools.duckduckgo import DuckDuckGoSearchToolSpec
from llama_index.core.tools import FunctionTool

tool_spec = DuckDuckGoSearchToolSpec()
llama_search_tool = FunctionTool.from_defaults(tool_spec.duckduckgo_full_search)
```

```python
from langchain_community.tools import DuckDuckGoSearchRun

graph_search_tool = DuckDuckGoSearchRun()
print(graph_search_tool.invoke("Search for current news about AI agents"))
```

搜索结果不是已经核实的事实。尤其对「现在的负责人、价格、天气」等会变化的问题，要看网页发布时间、权威来源和查询时点。搜索页本身可能包含广告与提示注入内容，不得让它替用户或系统下指令。不同框架只是包装方式不同，验证要求没有变。

## 天气工具：这份代码只会随机返回假数据

这里的天气工具在 `Rainy, 15°C`、`Clear, 25°C`、`Windy, 20°C` 中随机选一个，用来演示工具注册，**不能用于真正的烟花决策**。即使它回答「晴」，也没有查过任何气象服务。下面是 smolagents 的 `Tool` 类版本：

```python
import random
from smolagents import Tool

class WeatherInfoTool(Tool):
    name = "weather_info"
    description = "Return simulated weather for demonstration only."
    inputs = {
        "location": {
            "type": "string",
            "description": "Location named in the simulated result.",
        }
    }
    output_type = "string"

    def forward(self, location: str):
        conditions = [
            {"condition": "Rainy", "temp_c": 15},
            {"condition": "Clear", "temp_c": 25},
            {"condition": "Windy", "temp_c": 20},
        ]
        data = random.choice(conditions)
        return f"SIMULATED weather in {location}: {data['condition']}, {data['temp_c']}°C"

weather_info_tool = WeatherInfoTool()
```

LlamaIndex 线路保留同一函数逻辑，用 `FunctionTool.from_defaults(get_weather_info)`；LangGraph 线路用 `langchain_core.tools.Tool(name="get_weather_info", func=get_weather_info, description=...)`。天气工具要变成真实工具，还需调用可信 API、处理地点歧义、查询时间、预报时间范围、降水和风速等字段，以及 API 超时与额度。烟花活动更涉及当地法规和现场安全，不能仅根据温度和晴雨自动批准。

## Hub 统计：按作者找下载最多的模型

这个工具可以访问真实的 Hugging Face Hub 数据。`list_models(author=..., sort="downloads", direction=-1, limit=1)` 取指定作者或组织下载数最高的一条；无模型或请求出错时应返回明确状态。`downloads` 是查询当时的平台统计，会变化，不能把示例里的数字当成固定事实。

```python
from huggingface_hub import list_models
from smolagents import Tool

class HubStatsTool(Tool):
    name = "hub_stats"
    description = "Find the most-downloaded model for a Hub author or organization."
    inputs = {
        "author": {
            "type": "string",
            "description": "Exact Hub username or organization ID.",
        }
    }
    output_type = "string"

    def forward(self, author: str):
        try:
            models = list(list_models(
                author=author, sort="downloads", direction=-1, limit=1
            ))
        except Exception as exc:
            return f"Hub query failed for {author}: {exc}"
        if not models:
            return f"No models found for author {author}."
        model = models[0]
        return (
            f"The most-downloaded model by {author} is {model.id} "
            f"with {model.downloads:,} downloads at query time."
        )

hub_stats_tool = HubStatsTool()
```

LlamaIndex 可把同一 `get_hub_stats(author: str) -> str` 包成 `FunctionTool`；LangGraph 可包成 LangChain `Tool`。三种写法共享核心 API，不必维护三份相同的业务逻辑。测试时分别传一个有效组织、一个不存在的 ID，以及模拟网络异常。原示例把 `facebook/esmfold_v1` 和特定下载数写在预期输出里，那只是当时一次运行的快照。

## 让 Agent 在工具间作选择

把三种工具加进同一个列表后，可以问「Facebook 是什么，它在 Hub 下载最多的模型是哪一个？」模型可能先搜索组织背景，再调用 Hub 统计。我们应在 trace 中核对它选了哪些工具。若只问「组织的模型下载第一是谁」，通常直接调用 Hub 工具就够了；若问烟花天气，模拟天气工具最多返回一条明确标注为模拟的数据，最终回答不能宣称真实预报。

```python
from smolagents import CodeAgent, InferenceClientModel

alfred = CodeAgent(
    tools=[search_tool, weather_info_tool, hub_stats_tool],
    model=InferenceClientModel(),
)
print(alfred.run("Which Hub model by the organization facebook has the most downloads?"))
```

## 练习：为实时新闻增加一项工具

选择一个有稳定 API 或 RSS 的来源，设计 `get_recent_news(topic: str)`。返回标题、来源、发布时间和链接；没有结果时明确返回空，而不是请求模型用旧知识补写「最新新闻」。把新工具加到 `tools.py`，测试它与普通网页搜索的分工。若新闻来源有访问限制，按服务条款和用户授权处理。

## 面试会怎么问

**问题：工具返回的是实时数据还是模拟值，Agent 怎样避免混淆？** 回答时给工具结果加数据类型、来源和查询时间：本例天气是随机模拟，必须在工具名/描述/返回里标明；Hub 统计是真实查询但会变化，应附时间；网页搜索还需核对页面。最终回答只能依据对应等级的证据，对烟花这种高风险决策要增加人工确认与专业数据。

## 来源与延伸阅读

- [Hugging Face Agents Course · Gala 外部工具](https://huggingface.co/learn/agents-course/zh-CN/unit3/agentic-rag/tools)
- [Hugging Face Hub Python API](https://huggingface.co/docs/huggingface_hub/guides/search)
- [美团 AI Agent 一面面经](https://www.nowcoder.com/feed/main/detail/50bcdc47e7754aa7be59b6318fea514b)
