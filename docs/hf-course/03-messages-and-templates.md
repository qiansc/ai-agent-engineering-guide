# 一段对话怎样进入模型：消息、角色与聊天模板

聊天界面让人觉得模型在「记住」之前说过的话。实际发起新一次推理时，应用通常需要把相关历史消息重新提交。模型看到的是经过聊天模板整理的一段输入序列，其中包含角色、内容和边界标记。理解这一步，可以避免迁移模型后突然无法正确调用工具，也能知道为什么工具结果必须作为独立消息送回。

## 从消息列表到模型输入

应用层常把对话存成这样的列表：

```python
messages = [
    {"role": "system", "content": "You are a professional customer service agent."},
    {"role": "user", "content": "I need help with my order"},
    {"role": "assistant", "content": "Could you provide your order number?"},
    {"role": "user", "content": "It's ORDER-123"},
]
```

`system` 提供行为和任务规则，`user` 是用户输入，`assistant` 是模型先前的回复。实际工具调用系统还会有工具请求和工具返回等消息类型。角色的作用是告诉模型哪一段是谁说的；权限控制不能只依赖角色文字，因为用户输入或外部网页也可能包含伪装成系统指令的内容。

聊天模板把列表格式化成目标模型训练时熟悉的序列。以示例中的 SmolLM2 形式为例，角色与边界大致这样出现：

```text
<|im_start|>user
I need help with my order<|im_end|>
<|im_start|>assistant
Could you provide your order number?<|im_end|>
<|im_start|>user
It's ORDER-123<|im_end|>
<|im_start|>assistant
```

最后一个未完成的 `assistant` 前缀表示接下来要让模型续写助手内容。Llama 3 使用不同的边界标记，例如 `<|start_header_id|>` 和 `<|eot_id|>`。同一份 `messages` 不应靠人工拼接成所有模型通用的字符串。

## 系统消息、历史消息与工具说明

系统消息可以指定回答风格、任务边界和工具使用规则。让 Alfred 分别扮演「礼貌客服」和「叛逆客服」，就能观察系统消息怎样影响输出。真实应用还要把系统消息与业务授权分开：提示写了「允许发送邮件」并不等于当前用户真的拥有发送权限。

历史消息为多轮对话提供上下文。订单例子中，用户第二轮只说 `ORDER-123`，如果不提供第一轮「我需要订单帮助」和助手追问，模型难以判断这个编号的用途。另一方面，历史会越来越长；应用需要选择保留、摘要或检索哪些信息，而不是假设模型永久保存了过去的会话。

工具说明也可能进入模型可见的输入。系统要让模型知道工具名称、用途、参数和调用格式，但工具返回应作为执行后的观察，而不是让模型自行补写。无论模板怎样序列化，这两个阶段都不能混淆。

## 基础模型和指令模型的区别

基础模型主要按预训练目标学习续写；指令模型进一步学习对话与任务响应。可对比 `SmolLM2-135M` 与 `SmolLM2-135M-Instruct`。**给基础模型套上聊天模板，并不会把它训练成指令模型**；模板只把消息整理成某种输入形状。使用指令模型时，应该采用与该模型训练和配置相匹配的模板。

Hugging Face `transformers` 通常在 tokenizer 配置中保存聊天模板，模板本身可用 Jinja2 编写。这里的简化版本遍历消息，为每条消息插入角色和结束标记；真实模板还可能处理工具调用、特殊轮次结束和多模态内容。读懂「输入列表 → 模板 → token 序列」这条链，比记住模板语法的每一个细节更重要。

## 用 `apply_chat_template` 生成正确输入

下面给出一个可复现的用法：

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained(
    "HuggingFaceTB/SmolLM2-1.7B-Instruct"
)
messages = [
    {"role": "system", "content": "You are an AI assistant with access to tools."},
    {"role": "user", "content": "Hi!"},
]
rendered_prompt = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True,
)
print(rendered_prompt)
```

`tokenize=False` 返回格式化的文本，便于检查模板结果；真正送入本地模型时可按所用接口继续分词。`add_generation_prompt=True` 通常补上等待助手生成的开头。模型或服务接口若已经接收 `messages` 并自动套模板，就不应再手动套一次，否则可能出现重复角色标记。

可以用这里的 [聊天模板查看器](https://jofthomas-chat-template-viewer.hf.space) 比较相同消息在不同模型中的格式。试着观察最后一轮助手前缀、系统消息的位置、轮次结束标记是否相同，再回到模型 tokenizer 的实际配置核对。

## 一个迁移模型时的检查单

把应用从模型 A 切到模型 B 时，先确认 B 是基础模型还是指令模型、tokenizer 的聊天模板是否可用、API 是否自动格式化消息、工具调用如何表示，以及结束标记是否由服务处理。然后做三条小测试：普通多轮对话、一次工具请求、一次工具结果回填。只测试「你好」能够回答，发现不了动作边界的问题。

## 面试会怎么问

**问题：为什么 Agent 调用了工具，模型却像没看到结果？** 百度 Coding Agent 面经讨论过上下文隔离和工具调用。回答时沿消息链排查：运行时是否真的执行工具；返回值是否作为工具消息进入下一次模型调用；是否用了该模型的正确聊天模板；压缩历史时是否删掉了工具结果；有没有把模型自己生成的 `Observation` 当成真实返回。给出一条模型输入与执行 trace，通常比泛泛调整 prompt 更快定位问题。

## 来源与延伸阅读

- [Hugging Face Agents Course · 消息和特殊 Token](https://huggingface.co/learn/agents-course/zh-CN/unit1/messages-and-special-tokens)
- [Transformers · Chat templates](https://huggingface.co/docs/transformers/main/en/chat_templating)
- [百度 Coding Agent 三轮面经](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)
