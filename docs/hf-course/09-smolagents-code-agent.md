# 用 CodeAgent 筹备一场派对：搜索、工具、导入与分享

Hugging Face 用管家 Alfred 筹备 Wayne 家派对作为 CodeAgent 实战：先搜索播放列表，再调用自定义工具准备菜单，最后计算准备时间，并将组合后的 Agent 分享到 Hub。这个故事让我们看到代码型 Agent 的长处：模型可以生成一小段 Python，把工具调用、变量和条件组合在一起。程序仍需要限制执行环境，并在每一步记录运行轨迹。

## CodeAgent 内部跑了哪些步骤

在 `smolagents` 中，`CodeAgent` 属于多步骤 Agent。这里把运行过程拆成：系统提示写入 `SystemPromptStep`，用户任务写入 `TaskStep`；`write_memory_to_messages()` 把已有步骤组织成模型可读消息；模型生成代码动作；运行时解析并执行；结果记录为 `ActionStep`；然后看是否需要下一步或最终答案。`step_callback` 可在每个步骤后执行附加处理。

这说明「memory」在这里首先是运行日志与消息构造，不是模型内部永久记忆。调试时要看模型收到了哪些消息、生成了什么代码、执行器返回了什么。只看最终一句「我推荐这些歌」不够。

代码动作与 JSON 工具动作的差异，可以用两个搜索同时说明：

```python
for query in ["best party music", "villain masquerade playlist"]:
    print(web_search(query=query))
```

JSON 工具调用通常需要分别列出 `web_search` 和每次参数；代码可以在一个片段里表达循环、变量和结果处理。因此课程引用的研究认为代码动作在一些任务中有优势。不过这只是方法的适用性证据，不代表任意模型、任意任务都一定更好。代码越自由，执行器越要审查可导入模块、文件、网络和时间预算。

## 播放列表：让 Agent 真正搜索

示例先安装 `smolagents` 并登录 Hugging Face Hub，以使用托管模型：

```bash
pip install -U smolagents
```

```python
from huggingface_hub import login

login()
```

在 Notebook 或本地环境中，不要把 token 回显到输出。然后创建带搜索工具的 Agent：

```python
from smolagents import CodeAgent, DuckDuckGoSearchTool, InferenceClientModel

agent = CodeAgent(
    tools=[DuckDuckGoSearchTool()],
    model=InferenceClientModel(),
)
agent.run(
    "Search for the best music recommendations for a party "
    "at Wayne's mansion."
)
```

示例的执行 trace 中可以看到类似 `results = web_search(query="best music for a Batman party")`，随后 `print(results)`。真正值得检查的是搜索是否发生、结果来源是什么、最终播放列表是否与搜索内容相关。搜索工具返回的网页文字可能不可信，不能让网页指挥 Agent 执行别的动作。

## 菜单：创建并注册自己的工具

Alfred 还需要为正式、休闲或超级英雄主题派对挑菜单。课程用 `@tool` 包装一个带类型注解和参数说明的函数：

```python
from smolagents import CodeAgent, InferenceClientModel, tool

@tool
def suggest_menu(occasion: str) -> str:
    """Suggest a menu based on the party occasion.

    Args:
        occasion: One of casual, formal, or superhero.
    """
    if occasion == "casual":
        return "Pizza, snacks, and drinks."
    if occasion == "formal":
        return "3-course dinner with wine and dessert."
    if occasion == "superhero":
        return "Buffet with high-energy and healthy food."
    return "Custom menu for the butler."

agent = CodeAgent(tools=[suggest_menu], model=InferenceClientModel())
agent.run("Prepare a formal menu for the party.")
```

这个工具只有几种硬编码结果，因此适合教学，不是现实餐饮推荐系统。`occasion` 的说明应与函数支持的值一致；模型输入其他词时会落到默认菜单。你可以添加测试，检查 `formal` 是否返回三道菜，未知分类是否进入默认分支，并确认 Agent 运行轨迹中确实调用了工具。

## 准备时间：授权 Python 导入

为计算饮料 30 分钟、布置 60 分钟、菜单 45 分钟、音乐 45 分钟的准备时间，课程允许 Agent 导入 `datetime`：

```python
from smolagents import CodeAgent, InferenceClientModel

agent = CodeAgent(
    tools=[],
    model=InferenceClientModel(),
    additional_authorized_imports=["datetime"],
)
agent.run(
    """Alfred needs to prepare for the party:
    drinks 30 minutes; decorate 60 minutes;
    menu 45 minutes; playlist 45 minutes.
    If we start right now, at what time will everything be ready?"""
)
```

示例任务列表在最后两项都写了编号 3，不影响四项时长，但代码读者应按四项处理。答案取决于这些任务能否并行：如果串行，总时长是 180 分钟；如果不同人同时做，可能只取最长路径。示例没有明确依赖关系，所以好的 Agent 应说明假设，不能悄悄把四项相加。`additional_authorized_imports` 只是框架的一项控制；并不保证运行任意模型生成的代码完全安全。处理不可信任务时应采用适合环境的隔离执行和权限限制。

## 把多种能力组合起来

课程最后把搜索、网页访问、菜单建议、餐饮服务选择和派对主题放进同一个 Agent。餐饮服务工具使用一份固定评分字典，返回最高分者；主题工具用 `Tool` 子类声明名称、描述、输入 schema 和输出类型，再用 `forward()` 把 `villain masquerade` 映射为「Gotham Rogues' Ball」。这是第二种定义工具的方法，适合需要更明确接口元数据或类内部状态的工具。

```python
from smolagents import Tool

class SuperheroPartyThemeTool(Tool):
    name = "superhero_party_theme_generator"
    description = "Suggest a superhero party theme from a category."
    inputs = {
        "category": {
            "type": "string",
            "description": "classic heroes, villain masquerade, or futuristic Gotham",
        }
    }
    output_type = "string"

    def forward(self, category: str):
        themes = {
            "classic heroes": "Justice League Gala",
            "villain masquerade": "Gotham Rogues' Ball",
            "futuristic gotham": "Neo-Gotham Night",
        }
        return themes.get(category.lower(), "Theme not found")
```

示例还使用 `VisitWebpageTool()` 和 `max_steps=10`，让 Agent 可以从搜索结果继续访问页面。增加工具后，测试应覆盖「何时搜索」「何时访问」「何时调用固定字典」；例如餐饮评分本来是模拟数据，不应被描述成实时搜索结果。

## 分享到 Hub 与加载回来

这里使用 `agent.push_to_hub("用户名/仓库名")` 上传，再通过 `from_hub(...)` 下载运行，并展示相应的 Space。分享前应确认所有工具代码、prompt、依赖和模型访问方式都适合公开，绝不能把 token 写进项目文件。加载其他人发布的 Agent 时，也要检查其代码和所请求权限；示例后面的示例使用 `trust_remote_code=True`，这意味着执行远程仓库代码，应只用于经过审查的来源。

```python
agent.push_to_hub("your-name/AlfredAgent")

# 仅在了解远端实现及其权限后加载。
loaded_agent = CodeAgent.from_hub(
    "your-name/AlfredAgent",
    trust_remote_code=True,
)
```

具体 `from_hub` 调用形状随版本可能变化，请以所用版本文档和课程 Notebook 为准。上线或分享之前，最重要的验收是：相同任务能复现主要轨迹，工具输出可追溯，错误不会被编造成成功，外部代码和密钥边界明确。

## 练习：给 Alfred 加一个失败场景

让 `suggest_menu` 对不支持的 `occasion` 返回明确错误，而不是笼统默认菜单。再让 Agent 面对「无麸质正式晚餐」这样的需求，检查它是否意识到课程工具没有饮食限制参数。如果它仍直接给出确定菜单，就记录这个失败；改进可以是扩充工具输入 schema，或先向用户询问限制。这个练习能帮你区分「工具确实调用了」与「工具足以完成任务」。

## 面试会怎么问

**问题：CodeAgent 与函数调用 Agent 的工程取舍是什么？** 百度和小红书面经涉及 Coding Agent 与 Harness。回答时先说明代码动作能表达循环、中间变量和多工具组合，适合开放式数据处理；结构化工具调用易于限定工具与参数，适合动作集合明确的业务系统。接着讲代码执行隔离、授权导入、工具副作用、运行 trace、步数和失败恢复。最好给出自己项目里一条需要代码组合的任务，以及一条只需 JSON 工具调用的任务，而不是笼统说某一种「更先进」。

## 来源与延伸阅读

- [Hugging Face Agents Course · 构建代码 Agent](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/code_agents)
- [Code Agents 配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/smolagents/code_agents.ipynb)
- [smolagents · 安全执行说明](https://huggingface.co/docs/smolagents/tutorials/secure_code_execution)
- [百度 Coding Agent 三轮面经](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)
- [小红书 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/223fa82f976b4418b214894bd7d941fd)
