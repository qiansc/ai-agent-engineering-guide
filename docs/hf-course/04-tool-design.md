# 给 Agent 配工具：描述、参数、执行与返回

工具把模型的决定连接到外部能力。用户问「今天巴黎下不下雨」时，模型仅靠预训练知识无法知道实时天气；应用可以提供天气查询工具，让模型提出查询地点，程序执行查询，再把结果交回模型。计算器、搜索、数据库检索、图片生成和外部 API 都可以用同样的方式接入。

## 一个工具至少要交代四件事

对模型而言，工具需要名称、用途、参数和结果类型；对程序而言，还需要一个真正可调用的实现。以两整数相乘为例：

```python
def calculator(a: int, b: int) -> int:
    """Multiply two integers."""
    return a * b
```

模型可见的说明可以整理为：

```text
工具名称：calculator
用途：将两个整数相乘
参数：a: int，b: int
输出：int
```

名称应让模型知道何时选择它；描述要说明边界，不能把「整数乘法」写成「任意数学计算」。参数要有类型和含义，尤其是容易混淆的单位、时区、ID 与自然语言名称。输出说明让后续推理知道结果是什么。生产工具还应有错误类型、超时、权限和副作用约定，虽然示例中的最小计算器暂时用不到这些。

## 模型提出调用，程序实际执行

为模型提供工具，不是把 Python 函数「装进」模型参数。应用会在输入或 API 的工具字段中描述工具；模型生成工具名称和参数；运行时校验后调用函数；函数的真实返回值作为下一条观察消息交给模型。用户界面可以只显示最终回答，但后台必须留下这几个可区分的阶段。

```text
用户问：巴黎现在的天气？
  ↓
模型提出：get_weather(location="Paris")
  ↓
程序校验参数并调用天气服务
  ↓
工具返回：巴黎，15°C，多云；或返回错误
  ↓
程序把真实结果交给模型，模型再回答
```

若程序没有执行第三步，模型不应该自己填出天气。对于发送邮件、修改记录一类工具，还要在执行前核对身份、资源范围与确认要求；失败或超时时也不能把模型的意图写成完成事实。

## 用类型注解与文档字符串生成说明

手工维护几十份工具描述容易出现代码参数和说明不一致。下面展示 Python 自省的办法：用函数名作为工具名、文档字符串作为用途、函数签名中的类型注解作为参数和输出类型，再由装饰器自动生成描述。一个简化实现如下；它是理解原理的教学代码，不代替框架的验证、安全或序列化功能。

```python
import inspect
from collections.abc import Callable


class Tool:
    def __init__(
        self,
        name: str,
        description: str,
        func: Callable,
        arguments: list[tuple[str, str]],
        outputs: str,
    ):
        self.name = name
        self.description = description
        self.func = func
        self.arguments = arguments
        self.outputs = outputs

    def to_string(self) -> str:
        args = ", ".join(f"{name}: {kind}" for name, kind in self.arguments)
        return (
            f"Tool Name: {self.name}, Description: {self.description}, "
            f"Arguments: {args}, Outputs: {self.outputs}"
        )

    def __call__(self, *args, **kwargs):
        return self.func(*args, **kwargs)


def tool(func: Callable) -> Tool:
    signature = inspect.signature(func)
    arguments = []
    for parameter in signature.parameters.values():
        annotation = parameter.annotation
        kind = getattr(annotation, "__name__", str(annotation))
        arguments.append((parameter.name, kind))
    output_annotation = signature.return_annotation
    outputs = getattr(output_annotation, "__name__", str(output_annotation))
    return Tool(
        name=func.__name__,
        description=func.__doc__ or "No description provided.",
        func=func,
        arguments=arguments,
        outputs=outputs,
    )


@tool
def calculator(a: int, b: int) -> int:
    """Multiply two integers."""
    return a * b


print(calculator.to_string())
print(calculator(6, 7))  # 42
```

这里 `__call__` 负责执行，`to_string()` 负责生成供模型阅读的说明，二者必须分开。装饰器让声明更省力，却不保证描述写得好。比如 `def process(data: str)` 即使有类型，也没有告诉模型 `data` 是城市、网址还是订单号。`inspect` 也只读取声明，不会自动验证输入值符合业务规则。

在 `smolagents` 等框架中，`@tool` 可以承担类似的工具声明工作；不要把上面的教学装饰器和框架中的同名装饰器混用。读框架文档时重点检查它如何生成 schema、如何校验参数、如何返回错误，以及是否在工具执行前做授权。

## 工具数量和粒度怎么定

一个工具最好有清楚的职责。`search_web(query)` 与 `read_page(url)` 分开后，模型能够先找候选，再精读页面；但如果把几十个几乎同名的搜索工具同时提供给模型，它可能选错。工具设计不只是 Python API 设计，还是给模型构建一个可理解的动作空间。

可以用三个问题审查工具：模型读完描述，能否分辨何时调用；程序能否校验参数与权限；结果能否清楚表达成功、失败和来源。对于检索工具，还要考虑返回内容长度；对于有副作用的工具，要明确幂等性和需要人工确认的时点。

进一步看 MCP（模型上下文协议）：它规定应用与外部工具服务交换能力和调用结果的接口，使实现协议的客户端能够复用工具集成。MCP 解决连接格式问题，不会自动替应用决定是否应该调用某工具，也不会替业务系统授予权限。选择 MCP 服务时仍要核对服务来源、可访问数据和执行风险。

## 练习：从计算器扩展到订单查询

先运行上面的 `calculator`，确认生成的名称、描述、参数、输出与函数一致。再设计一个 `get_order_status(order_id: str) -> str`：写明 `order_id` 来自哪里、找不到订单时如何返回、用户是否能查询该订单。最后用一份错误的工具描述做对照，例如把 `order_id` 误写成用户名，观察模型可能生成什么错误调用。工具质量的差异通常就在这些细节中。

## 面试会怎么问

**问题：Agent 为什么会调错工具，如何排查？** 回答时把错误分成四层：模型是否看到了正确的工具描述、多个工具的适用边界是否重叠、生成参数是否通过 schema 与业务校验、执行结果是否被正确回填。用一条具体轨迹说明模型选择了什么、运行时拒绝或执行了什么、下一轮看到什么；修复时可调整工具描述或粒度、增加参数校验和错误反馈，并用同一测试集比较误调用率。工具超时且有副作用时，先确认外部执行状态，不能盲目再调用。

## 来源与延伸阅读

- [Hugging Face Agents Course · 什么是工具](https://huggingface.co/learn/agents-course/zh-CN/unit1/tools)
- [Model Context Protocol](https://modelcontextprotocol.io/introduction)
- [百度 Coding Agent 三轮面经](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)
- [影石创新 AI Agent 一面面经](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)
