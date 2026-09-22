# 不依赖框架，手工跑通一个最小 Agent

在使用框架前，值得亲手做一次最小 Agent：把模型输入格式化、让模型提出工具请求、在请求处停止生成、由程序执行工具、将真实结果写回，再让模型完成回答。以「查询伦敦天气」为例，可以看清每一层的职责。示例天气函数只返回模拟数据，不提供实时天气。

## 准备推理接口与消息模板

示例使用 Hugging Face `InferenceClient`。需要有 Hugging Face 账户和具备相应推理权限的 token；模型是否可用、额度和服务商配置会随时间变化，运行前以当前服务页面为准。不要把 token 写进会提交到仓库的代码。可以在本地环境变量或 Notebook 的 secret 中放 `HF_TOKEN`。

```python
from huggingface_hub import InferenceClient

client = InferenceClient(
    provider="hf-inference",
    model="meta-llama/Llama-3.3-70B-Instruct",
)

output = client.text_generation(
    "The capital of France is",
    max_new_tokens=100,
)
print(output)
```

这段裸文本生成可能持续重复「Paris」，直到达到结束 token 或 `max_new_tokens`。这说明指令模型通常期望特定的对话格式。接下来可以手写 Llama 的 `<|begin_of_text|>`、`<|start_header_id|>`、`<|eot_id|>`，使同一个问题得到更自然的单轮回答。教学时可以观察这些标记；实际应用优先使用接口的 `chat.completions.create(messages=...)`，或目标模型 tokenizer 的 `apply_chat_template`，不要把 Llama 模板硬套到别的模型上。

手写时的关键是把角色边界和结束标记放对，而不是仅在纯文本前写一句 “User:”。例如一个 Llama 风格的单轮输入形状是：

```text
<|begin_of_text|><|start_header_id|>user<|end_header_id|>
The capital of France is
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
```

不同模型的特殊 token 不通用，所以这段用于观察结构，不作为跨模型粘贴的模板。

```python
answer = client.chat.completions.create(
    messages=[{"role": "user", "content": "The capital of France is"}],
    max_tokens=100,
)
print(answer.choices[0].message.content)
```

## 给模型说明工具与输出格式

手写示例只有一个天气工具。系统提示告诉模型工具名、输入形状和循环格式。下面保留了这里的核心合同，并把「Observation 只能来自程序」说得更直白：

```text
回答用户问题。你可以使用以下工具：
get_weather(location: string)：查询指定地点的当前天气。

需要工具时，只生成一个完整动作：
Action:
{"action": "get_weather", "action_input": {"location": "London"}}

动作之后停止。不要自己编写 Observation。
程序会执行工具，把真实结果作为 Observation 追加。
获得足够信息后，以 Final Answer: 开头回答用户。
```

系统提示还可以用 `Thought:`、`Action:`、`Observation:` 表示可重复的多轮步骤。重点是结构化地告诉运行时「现在要调用什么」，不是要求向用户公开模型的内部思维。系统提示本身只是一份约定，仍需程序验证模型输出。

若使用示例的文本生成方式，`messages` 要经过该模型的聊天模板。以 tokenizer 为例：

```python
from transformers import AutoTokenizer

model_id = "meta-llama/Llama-3.2-3B-Instruct"
tokenizer = AutoTokenizer.from_pretrained(model_id)
messages = [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": "What's the weather in London?"},
]
prompt = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True,
)
```

注意这里的 Notebook 在不同代码块里使用了 Llama 3.3 70B 与 Llama 3.2 3B 的名称；实际运行时应确认推理模型和所用聊天模板匹配。若选用能直接接收 `messages` 的 chat API，通常不需要自己渲染模板。

## 先看一次错误：模型伪造 Observation

先让模型在没有停止条件的情况下续写。模型生成了 `get_weather("London")` 的动作，然后又写出一段「伦敦多云、最高 12°C」的观察。这些天气数据并没有来自真实工具，只是语言模型接着文本格式写下去。若运行时把这段话当事实，Agent 就会给出看似经过查询的错误答案。

因此文本生成示例使用：

```python
generated = client.text_generation(
    prompt,
    max_new_tokens=200,
    stop=["Observation:"],
)
```

`stop` 使生成在观察字段前结束；运行时接下来应解析动作并执行工具。停止字符串要与实际模板、服务返回行为配合测试。原生工具调用 API 通常会把工具请求与普通文字分成结构化字段，免去对自由文本做脆弱的截取，但执行职责仍然在程序。

## 执行模拟工具，再回填真实结果

示例的天气函数故意简单：

```python
def get_weather(location: str) -> str:
    return f"the weather in {location} is sunny with low temperatures.\n"

observation = get_weather("London")
```

在教学例子中，它返回「伦敦晴朗、气温较低」，无论实际天气是什么。模型随后根据这个**模拟工具结果**写出最终回答。为了看到机制，可以把请求、观察与答案按顺序排列：

```text
User: What's the weather in London?
Assistant tool request: get_weather(location="London")
Tool Observation: the weather in London is sunny with low temperatures.
Assistant Final Answer: London is sunny with low temperatures.
```

简单实现会直接把 `prompt + generated + get_weather('London')` 拼起来继续生成，这足以示意反馈回路，却没有从生成文本中解析地点，也没有验证模型是否选择了允许的工具。稍完整一点的教学运行时至少应做到：

```python
import json

ALLOWED_TOOLS = {"get_weather": get_weather}

def execute_action(raw_json: str) -> str:
    action = json.loads(raw_json)
    name = action["action"]
    arguments = action["action_input"]
    if name not in ALLOWED_TOOLS:
        raise ValueError(f"Unknown tool: {name}")
    if not isinstance(arguments.get("location"), str):
        raise ValueError("location must be a string")
    return ALLOWED_TOOLS[name](arguments["location"])
```

上面的函数假设调用方已经从模型响应中取出了纯 JSON；提取代码块、处理生成格式错误、限制步数和异常恢复还需要额外实现。它显示了为什么真正的 Agent 库有价值：库可以帮你管理模型调用、工具 schema、循环和消息回填，但不能替业务应用决定外部数据的可信度与权限。

把前后两次生成连起来时，关键是只把**程序执行得到**的值写到 `Observation:` 后面，再交给模型续写；不要把第一次生成中可能自带的假观察也拼进去：

```python
first = client.text_generation(prompt, max_new_tokens=200, stop=["Observation:"])
# 教学版：从 first 提取 Action JSON，校验后执行。
action_json = extract_action_json(first)  # 需要按所选输出格式实现
real_observation = execute_action(action_json)
next_prompt = prompt + first + "\nObservation: " + real_observation + "\n"
final = client.text_generation(next_prompt, max_new_tokens=200)
```

`extract_action_json` 在这里故意作为待实现接口，而不是假装这段可以直接运行。动手时先打印 `first`，确认模型实际输出的是 JSON、代码式调用还是带 Markdown 围栏的块，再编写对应解析器并加入错误路径。若想直接做可运行产品，优先选结构化函数调用或下一篇的框架实现。

## 自己动手跑三次

第一次让天气函数返回固定晴天，确认答案只引用这个结果。第二次把函数改为返回 `ERROR: unknown city`，观察模型是否会要求补充城市，而不是继续编天气。第三次去掉停止条件，亲眼比较模型伪造的 `Observation` 与程序真正执行后的结果。做完后，你会对「生成文本」和「环境事实」的区别有非常具体的感受。

## 面试会怎么问

**问题：模型输出了工具调用和工具结果，为什么不能直接信？** 回答可用本课例子：模型只能生成调用意图；若不在动作后停止，连 `Observation` 都可能是它续写的。运行时必须解析和校验调用、真正执行工具、记录成功或失败，并将外部结果作为下一轮输入。然后补充生产系统还需步数预算、权限、超时处理和副作用去重。用一次「伪造伦敦天气」的对照实验说明，会比只说“防幻觉”具体得多。

## 来源与延伸阅读

- [Hugging Face Agents Course · 简单智能体库](https://huggingface.co/learn/agents-course/zh-CN/unit1/dummy-agent-library)
- [课程配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit1/dummy_agent_library.ipynb)
- [百度 Coding Agent 三轮面经](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)
- [影石创新 AI Agent 一面面经](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)
