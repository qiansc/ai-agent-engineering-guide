# ToolCallingAgent：用结构化调用替代代码动作

`smolagents` 除了 `CodeAgent`，还提供 `ToolCallingAgent`。两者都可以多轮读取观察、选择下一步；区别是模型表达动作的方式。`CodeAgent` 写 Python 片段，由代码执行环境运行；`ToolCallingAgent` 使用模型服务的工具调用能力，生成工具名和参数，再由框架调用对应工具。

Alfred 要同时查「哥谭市餐饮服务」和「超级英雄派对主题」，代码动作可以写成循环：

```python
for query in [
    "Best catering services in Gotham City",
    "Party theme ideas for superheroes",
]:
    print(web_search(query=query))
```

结构化调用则是两条独立的工具请求：

```json
[
  {"name": "web_search", "arguments": {"query": "Best catering services in Gotham City"}},
  {"name": "web_search", "arguments": {"query": "Party theme ideas for superheroes"}}
]
```

示例用简化 JSON 展示这个差别；实际 API 的字段形状依模型服务而异。两种方式都需要运行时执行、记录结果并回填，模型生成的请求本身不会自动访问网络。

## 运行示例

这里把前一课的播放列表任务换成 `ToolCallingAgent`，其余主要部分保持不变：

```python
from smolagents import ToolCallingAgent, DuckDuckGoSearchTool, InferenceClientModel

agent = ToolCallingAgent(
    tools=[DuckDuckGoSearchTool()],
    model=InferenceClientModel(),
)
agent.run(
    "Search for the best music recommendations for a party "
    "at Wayne's mansion."
)
```

查看运行轨迹时，CodeAgent 常出现 `Executing parsed code`，这里则会看到类似 `Calling tool: 'web_search' with arguments: {'query': ...}`。这个对照非常实用：它能证明模型实际选了哪个工具、填了什么参数，而不是只看自然语言答案。

## 选择时考虑什么

如果任务需要在一个动作里计算、过滤、循环、保存中间变量，代码动作表达更直接；如果动作集合相对固定，每个工具有明确 schema，结构化调用易于限定边界。代码型 Agent 需要受控执行环境；结构化调用仍需校验参数、权限与工具副作用。二者都可能选错工具，也都可能在工具失败后给出未经证实的答案，因此不能只靠选择 Agent 类型解决可靠性问题。

做一个小实验：给两种 Agent 同样的搜索工具和问题，记录每次模型调用、工具调用、最终答案与失败次数。再把任务改成「先搜索十条结果，按评分排序后选前三条」，观察代码表达和多次结构化调用各自的轨迹。比较应基于任务和模型，而不是预设某一种方法永远更优。

## 面试会怎么问

**问题：Function Calling 与代码 Agent 有什么区别？** 先解释 Function Calling 是模型输出结构化工具请求，RAG 是检索与生成的任务模式，两者不是同一维度；检索工具可以由 Function Calling 发起。再比较代码动作与结构化工具调用：前者擅长组合逻辑，但执行权限风险更高；后者便于 schema 校验，但复杂逻辑可能分成多个调用。最后说清无论哪种，真正执行与结果验证都由运行时完成。

## 来源与延伸阅读

- [Hugging Face Agents Course · ToolCallingAgent](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/tool_calling_agents)
- [配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/smolagents/tool_calling_agents.ipynb)
- [字节 Agent 开发一面面经](https://www.nowcoder.com/discuss/929406267141914624)
