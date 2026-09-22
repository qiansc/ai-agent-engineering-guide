# 第一个 smolagents Agent：从工具到可分享的 Space

上一课手写了模型请求、动作解析和观察回填。`smolagents` 将这些通用部分封装起来，让我们把主要精力放在模型、工具和任务上。这套练习的第一项框架练习是在 Space 模板里给 `CodeAgent` 加工具，使它能查询时区、搜索网页或生成图像，并把作品分享出去。

这项练习仍有工程边界：模板、依赖和托管推理接口可能随版本变化。下面保留示例的操作路径和关键代码，同时指出哪些地方是模板特有的设置。遇到当前版本参数不兼容时，应核对所复制 Space 的 `requirements.txt` 与 `app.py`，不要机械套用旧代码。

## 第一步：复制该模板并放好密钥

打开 [First Agent 模板 Space](https://huggingface.co/spaces/agents-course/First_agent_template)，使用页面上的 Duplicate 创建自己账户下的副本。进入副本的 Settings，在 Variables and secrets 中新增一个 Secret：名称 `HF_TOKEN`，值为你从 [Hugging Face token 页面](https://hf.co/settings/tokens)创建、具备模板所需推理权限的 token。保存后在 Files 中找到 `app.py`。

token 应放在 Space Secret，而不是写入 `app.py`、公开变量或截图。这里的模板要求主要修改 `app.py`。如果应用启动失败，先看 Space 的 Build 和 Runtime 日志，确认依赖是否安装、Secret 名称是否拼对、所选模型是否可调用。

## 第二步：理解工具函数的格式

下面给出一个空白工具和一个可工作的时区工具。空白工具仅用于提醒你填入自己的能力：

```python
from smolagents import tool
import datetime
import pytz


@tool
def my_custom_tool(arg1: str, arg2: int) -> str:
    """A placeholder tool.

    Args:
        arg1: The first argument.
        arg2: The second argument.
    """
    return "What magic will you build?"


@tool
def get_current_time_in_timezone(timezone: str) -> str:
    """Return the current local time in an IANA timezone.

    Args:
        timezone: For example, America/New_York.
    """
    try:
        tz = pytz.timezone(timezone)
        local_time = datetime.datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
        return f"The current local time in {timezone} is: {local_time}"
    except Exception as exc:
        return f"Error fetching time for timezone '{timezone}': {exc}"
```

`@tool` 读取函数名、类型注解和文档字符串，为 Agent 提供工具描述。参数必须在 docstring 的 `Args` 中有解释，返回类型也要写明。这里使用 IANA 时区名称，例如 `America/New_York`；输入 `New York` 不一定能被 `pytz.timezone()` 接受，错误会以字符串返回。空白工具若原样注册，模型虽然能看到它，却不会因此获得有用能力，所以实际发布前应实现真实功能或移除它。

## 第三步：选模型，创建 Agent

该模板使用 `InferenceClientModel` 连接托管模型，创建 `CodeAgent`。示例选用 `Qwen/Qwen2.5-Coder-32B-Instruct`、`max_tokens=2096`、`temperature=0.5`，并把 `max_steps` 设为 6。这些是模板当时的选择，不是 smolagents 的普适必填值。

```python
from smolagents import CodeAgent, DuckDuckGoSearchTool, InferenceClientModel

model = InferenceClientModel(
    model_id="Qwen/Qwen2.5-Coder-32B-Instruct",
    max_tokens=2096,
    temperature=0.5,
)

agent = CodeAgent(
    model=model,
    tools=[get_current_time_in_timezone, DuckDuckGoSearchTool()],
    max_steps=6,
)

result = agent.run("现在纽约当地几点？请写明时区。")
print(result)
```

这段是理解 `model`、`tools`、`max_steps` 三个核心参数的最小形状。Space 模板另外从 `tools.final_answer` 导入 `FinalAnswerTool`、读取 `prompts.yaml`、用 `GradioUI(agent).launch()` 启动界面。若沿用模板，请保留模板依赖和自定义 prompt 的配套文件，不要把上面的最小代码直接覆盖整个应用。示例要求「不要移除 `final_answer`」，说的是其模板配置。

如果希望直接在复制后的 Space 中修改 `app.py`，可以按下面的完整骨架接线；`Gradio_UI.py`、`tools/final_answer.py`、`prompts.yaml` 是模板自带文件，离开模板单独复制这段不会自动出现：

```python
from smolagents import CodeAgent, DuckDuckGoSearchTool, InferenceClientModel, tool
from tools.final_answer import FinalAnswerTool
from Gradio_UI import GradioUI
import datetime
import pytz
import yaml

@tool
def get_current_time_in_timezone(timezone: str) -> str:
    """Return current time in an IANA timezone.

    Args:
        timezone: A timezone such as America/New_York.
    """
    try:
        now = datetime.datetime.now(pytz.timezone(timezone))
        return now.strftime("%Y-%m-%d %H:%M:%S %Z")
    except Exception as exc:
        return f"Invalid timezone or clock error: {exc}"

with open("prompts.yaml", "r") as stream:
    prompt_templates = yaml.safe_load(stream)

model = InferenceClientModel(
    model_id="Qwen/Qwen2.5-Coder-32B-Instruct",
    max_tokens=2096,
    temperature=0.5,
)
agent = CodeAgent(
    model=model,
    tools=[FinalAnswerTool(), get_current_time_in_timezone, DuckDuckGoSearchTool()],
    max_steps=6,
    verbosity_level=1,
    prompt_templates=prompt_templates,
)
GradioUI(agent).launch()
```

这份骨架特意把时区和搜索工具注册进去；原始模板的 `tools=[final_answer]` 只提供最终回答工具，其他工具即使已导入也不会生效。模板也包含 `custom_role_conversions=None`、`grammar=None`、`planning_interval=None`、`name=None`、`description=None` 等默认/占位配置；不依赖这些功能时可省略，但若你修改模板自定义提示，应核对当前版本的参数签名。

注意示例完整示例虽然加载了 `image_generation_tool`，却仍把 `tools=[final_answer]` 传给 `CodeAgent`，因此图像工具还没有实际注册。要让 Agent 用它，必须把它加入传入的工具列表；网页搜索和自定义时区工具也一样。**导入或创建工具，不等于 Agent 已经能用它。**

## 第四步：尝试搜索与图像工具

搜索工具在示例代码中已经导入，可加入 `tools`。然后用一个确实需要外部资料的问题测试，例如「查找某个项目的官方发布日期，并列出网页来源」。检查运行轨迹中是否发生搜索、返回了什么、最终答案是否引用结果。不要用「1 + 1」测试搜索能力，因为模型不需要搜索也能回答。

还可以从 Hub 加载图像工具：

```python
from smolagents import load_tool

image_generation_tool = load_tool(
    "agents-course/text-to-image",
    trust_remote_code=True,
)
```

`trust_remote_code=True` 意味着允许执行远端仓库提供的代码。只对你已核对来源并愿意信任的工具使用它；在公司或敏感环境中，还应检查其依赖、权限和数据去向。图像生成可能需要额外额度。加载成功后把工具加入 `tools`，再问「生成一张猫的图片」；如果只得到文字描述，检查运行轨迹确认是否真的调用了图像工具。

## 第五步：分享前做一次验收

在 Space 页面分别测试三种请求：当前时区时间、需要联网的信息、可选的图像生成。对每种请求检查：模型选的工具是否适当、参数是否正确、工具是否成功、最终答案是否与观察一致。再输入无效时区和网络失败样例，确认 Agent 会说明失败，而非补造结果。可调整模型与工具，但每次只改一个因素，便于看出变化原因。

作品能在你自己的 Space 页面打开后，可以把地址分享给同事。分享前确认没有把 token、私有数据、内部 URL 或调用日志中的敏感信息暴露到公开 Space。还可以将作品发到 Discord 的 `#agents-course-showcase`，这是可选的社区交流，不影响本课的技术目标。

## 面试会怎么问

**问题：你做的 Agent 如何证明真的会选用工具，而不只是把工具注册进去？** 回答时给出可观察的运行轨迹和测试集：必须调用的任务、不能调用的任务、参数边界与失败返回。解释 `tools` 列表决定可用能力，描述决定模型如何选择，运行时校验决定最终能否执行。示例图像工具「已加载但未加入 `tools`」就是一个很好的反例：界面存在、代码有导入，都不能证明能力已生效。

## 来源与延伸阅读

- [Hugging Face Agents Course · 创建第一个 Agent](https://huggingface.co/learn/agents-course/zh-CN/unit1/tutorial)
- [First Agent 模板 Space](https://huggingface.co/spaces/agents-course/First_agent_template)
- [smolagents 仓库](https://github.com/huggingface/smolagents)
- [百度 Coding Agent 三轮面经](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)
