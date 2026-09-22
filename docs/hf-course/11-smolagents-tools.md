# smolagents 工具实作：函数、Tool 类与外部工具

在 `smolagents` 中，工具是 Agent 可调用的一项能力。模型要能选对工具，必须读到名称、用途、每个输入的类型和说明，以及输出类型；程序还需要可执行的函数。课程用 Alfred 筹办派对，依次演示函数装饰器、`Tool` 子类、内置工具、Hub 工具、Space 工具和 LangChain 工具的导入。

## 简单工具：`@tool` 装饰器

当工具只需一个函数，`@tool` 是最直接的入口。课程给出餐饮评分示例：

```python
from smolagents import CodeAgent, InferenceClientModel, tool

@tool
def catering_service_tool(query: str) -> str:
    """Return the highest-rated sample catering service in Gotham City.

    Args:
        query: A search term for catering services.
    """
    services = {
        "Gotham Catering Co.": 4.9,
        "Wayne Manor Catering": 4.8,
        "Gotham City Events": 4.7,
    }
    return max(services, key=services.get)

agent = CodeAgent(
    tools=[catering_service_tool],
    model=InferenceClientModel(),
)
print(agent.run("Who is the highest-rated catering service in Gotham City?"))
```

这份字典是虚构的教学数据，代码没有访问真实餐饮平台；并且 `query` 参数没有参与筛选。所以结果只是在固定样例里选最高分，不能对用户声称完成了实时搜索。练习时可以先删掉不使用的 `query`，或真正根据关键词过滤数据，再让函数描述与实现一致。良好的工具声明应让模型既知道「什么时候用」，也知道「不能期待它做什么」。

## 复杂工具：继承 `Tool`

当工具需要自定义元数据、内部资源或较多逻辑，可以继承 `Tool`。这里的超级英雄主题工具声明 `name`、`description`、`inputs`、`output_type`，并在 `forward()` 中执行：

```python
from smolagents import Tool

class SuperheroPartyThemeTool(Tool):
    name = "superhero_party_theme_generator"
    description = "Suggest a superhero party idea for a category."
    inputs = {
        "category": {
            "type": "string",
            "description": (
                "Use classic heroes, villain masquerade, or futuristic Gotham."
            ),
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

注册时传 `SuperheroPartyThemeTool()`，而不是类对象。与函数版相比，类版的 schema 明确写在 `inputs` 中。注意示例字典里 `futuristic Gotham` 有大写 `G`，同时查找时对输入调用了 `.lower()`，导致该分支匹配不到；上面的教学代码把键改成小写，使三种主题都可触发。这是一个适合自己写单元测试的小错误。

## 内置工具能提供什么

课程列出 `DuckDuckGoSearchTool`、`GoogleSearchTool`、`VisitWebpageTool`、`PythonInterpreterTool`、`UserInputTool`、`FinalAnswerTool` 等。它们分别用于搜索、访问页面、执行受控 Python、询问用户和结束回答。某个工具是否随当前安装版本默认提供、是否需要额外凭据或包，以版本文档为准。

不要把所有工具一次放进去。Alfred 找派对灵感可以先搜索；从搜索结果读取页面需要访问工具；处理座位计算可能用 Python；要向用户确认预算，应提供用户输入路径。每增加一种能力，也增加了模型选错、外部内容污染或执行副作用的可能性。`FinalAnswerTool` 在课程某些模板中作为结束方式，具体使用取决于该模板和版本。

## 分享与导入 Hub 工具

自定义工具可通过 `push_to_hub("用户名/工具名")` 发布，其他项目可使用 `load_tool(...)`。示例展示了直接传 token 的写法；真实项目应使用安全的凭据管理，不要把 token 字符串留在脚本或文档中。

```python
party_theme_tool = SuperheroPartyThemeTool()
party_theme_tool.push_to_hub("your-name/party_theme_tool")

from smolagents import load_tool

image_generation_tool = load_tool(
    "m-ric/text-to-image",
    trust_remote_code=True,
)
```

`trust_remote_code=True` 的含义很直接：可能执行远端作者的代码。导入前看仓库来源、代码、依赖和权限，尤其不要让陌生工具接触私人 token 或工作目录。工具成功加载之后，还要把对象加入 Agent 的 `tools` 列表，模型才能调用。

## 将 Space 或 LangChain 工具接进来

课程还演示了 `Tool.from_space(...)`：把一个提供后端 API 的 Hugging Face Space 包装成工具。原例使用 `black-forest-labs/FLUX.1-schnell` 生成派对图片，并通过 `additional_args` 传入用户的图片描述；连接依赖 `gradio_client`。这类工具的返回可能是图片文件或 URL，调用方需确认输出类型与页面显示方式，而不是假定是普通字符串。

```python
from smolagents import Tool

image_generation_tool = Tool.from_space(
    "black-forest-labs/FLUX.1-schnell",
    name="image_generator",
    description="Generate an image from a prompt",
)
```

已有 LangChain 工具时，可以通过 `Tool.from_langchain(...)` 复用。课程以 `load_tools(["serpapi"])[0]` 作为搜索例子；这通常还需要服务凭据。跨框架导入并不会自动检查业务权限、费用和输出长度，接入前应像审查自定义工具一样审查其描述与行为。

## 工具验收练习

给本课三个工具各做一条测试：餐饮工具传不同 `query`，确认是否真的过滤；主题工具测试所有三个合法分类及一个非法分类；图片工具确认返回的是可用图片而不是文本报错。最后用 Agent 运行轨迹核对「模型想调用」和「工具确实执行」两件事。这组测试会揭示很多只看最终回答看不出来的问题。

## 面试会怎么问

**问题：一个 Skill 或工具明明注册了，为什么 Agent 用错或不用？** 可以从注册、描述、选择、校验、执行、回填六步排查：工具对象是否在 `tools` 列表；名称和描述是否让模型能分辨用途；参数 schema 与实现是否一致；执行错误是否可见；结果是否进入下一轮。用课程中「加载了图像工具但忘记加入 `tools`」和「`query` 参数没被使用」两个例子说明，API 能跑不等于能力正确。

## 来源与延伸阅读

- [Hugging Face Agents Course · smolagents 工具](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/tools)
- [工具配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/smolagents/tools.ipynb)
- [smolagents 工具文档](https://huggingface.co/docs/smolagents/tutorials/tools)
- [百度 Coding Agent 三轮面经](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)
