# 第一个 LangGraph：分类邮件并起草回复

这节课用邮件分拣练习完整走一遍 LangGraph：接收邮件、调用模型分类、按结果走不同分支；垃圾邮件结束，正常邮件起草回复，再把草稿显示给 Wayne 先生审核。示例明确提醒：这个例子主要教图的状态与控制流，尚无工具调用，不必把它强行称为完整的工具型 Agent。

## 先画清楚两条路径

一封邮件进入图后，先记录基本信息，再做分类。分类为垃圾邮件时只做标记并结束；分类为正常邮件时生成草稿，显示给人，最后结束。**显示草稿不等于发送邮件。** 课程代码的 `notify_mr_hugg` 只 `print` 文本；原叙述又称收件人为 Mr. Wayne，名称不一致。这里统一把他称作 Wayne 先生，且保持「仅显示草稿」的行为。

```text
START → read_email → classify_email
                         ├─ spam → handle_spam → END
                         └─ legitimate → draft_response → notify_owner → END
```

## 环境和状态

课程 Notebook 安装 `langgraph` 与 `langchain_openai`，通过 `ChatOpenAI` 调用模型。运行前需按所选模型服务配置凭据，且不要把邮件正文和 API key 写进公开 Notebook。

```bash
pip install langgraph langchain_openai
```

状态需要覆盖后续节点真正会读的字段。示例的 `EmailState` 只声明 `email`、`is_spam`、`draft_response`、`messages`，但节点随后还读写 `spam_reason` 与 `email_category`；下面把它们补齐：

```python
from typing import Any, Optional, TypedDict

class EmailState(TypedDict):
    email: dict[str, Any]
    is_spam: Optional[bool]
    spam_reason: Optional[str]
    email_category: Optional[str]
    draft_response: Optional[str]
    messages: list[dict[str, str]]
```

`email` 预期有 `sender`、`subject`、`body`。分类节点写 `is_spam`、`spam_reason`、`email_category`，起草节点写 `draft_response`，路由节点读 `is_spam`。这份读写关系比泛泛说「状态保存上下文」更能指导调试。真实邮件还需输入校验，缺少 `sender` 时示例会抛 `KeyError`。

## 读取和分类节点

读邮件节点只打印发件人与主题，返回空更新：

```python
def read_email(state: EmailState):
    email = state["email"]
    print(f"Processing email from {email['sender']}: {email['subject']}")
    return {}
```

课程接着用 `ChatOpenAI(temperature=0)` 询问模型邮件是否垃圾，并要求正常邮件给出类别。原示例通过字符串包含 `spam` 且不包含 `not spam` 判断，这很脆弱：模型说「This is not a spam message」会依赖特定英语短语，正文里的 `spam` 也可能干扰判断。完整练习可以先保留这种简化解析来观察风险，再改用结构化输出或受约束的分类字段。

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

model = ChatOpenAI(temperature=0)

def classify_email(state: EmailState):
    email = state["email"]
    prompt = (
        "Classify this email as spam or legitimate. "
        "For legitimate mail, choose inquiry, complaint, thank you, request, "
        "or information. Explain your decision.\n"
        f"From: {email['sender']}\nSubject: {email['subject']}\n"
        f"Body: {email['body']}"
    )
    response = model.invoke([HumanMessage(content=prompt)])
    text = response.content.lower()
    is_spam = "spam" in text and "not spam" not in text  # 仅教学解析
    categories = ["inquiry", "complaint", "thank you", "request", "information"]
    category = next((c for c in categories if c in text), None) if not is_spam else None
    messages = state.get("messages", []) + [
        {"role": "user", "content": prompt},
        {"role": "assistant", "content": response.content},
    ]
    return {
        "is_spam": is_spam,
        "spam_reason": response.content if is_spam else None,
        "email_category": category,
        "messages": messages,
    }
```

把整个模型回答存为 `spam_reason` 只是比示例截取 `reason:` 更稳的教学改法，仍应在生产系统中使用明确 schema。邮件正文是外部输入，可能写有「忽略以上规则」；分类器的业务权限不能被正文中的命令替代。`temperature=0` 使生成更稳定，但不保证分类永远正确。

## 垃圾分支、草稿分支与路由

垃圾节点只打印结果；示例写「已移入垃圾箱」，代码其实没有移动邮件，所以应写「标记为垃圾」而不宣称外部邮箱已修改。正常分支调用模型起草礼貌回复，并把草稿交给人：

```python
def handle_spam(state: EmailState):
    print(f"Marked as spam: {state['spam_reason']}")
    return {}

def draft_response(state: EmailState):
    email = state["email"]
    prompt = (
        "Draft a brief, professional reply for Wayne to review. "
        "Do not claim it has been sent.\n"
        f"Category: {state['email_category'] or 'general'}\n"
        f"From: {email['sender']}\nSubject: {email['subject']}\n"
        f"Body: {email['body']}"
    )
    response = model.invoke([HumanMessage(content=prompt)])
    return {
        "draft_response": response.content,
        "messages": state.get("messages", []) + [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": response.content},
        ],
    }

def notify_owner(state: EmailState):
    print("Draft for Wayne's review:")
    print(state["draft_response"])
    return {}

def route_email(state: EmailState) -> str:
    return "spam" if state["is_spam"] else "legitimate"
```

`route_email` 的返回值必须与条件边映射的键一致。`is_spam=None` 时它也会走正常分支，因此生产流程应在路由前要求分类成功，或为「无法判断」增加人工复核分支。

## 装配图并运行两个样例

示例图装配代码漏了从 `START` 指向第一个节点的边。加上这条边，完整路径才明确：

```python
from langgraph.graph import StateGraph, START, END

builder = StateGraph(EmailState)
builder.add_node("read_email", read_email)
builder.add_node("classify_email", classify_email)
builder.add_node("handle_spam", handle_spam)
builder.add_node("draft_response", draft_response)
builder.add_node("notify_owner", notify_owner)

builder.add_edge(START, "read_email")
builder.add_edge("read_email", "classify_email")
builder.add_conditional_edges(
    "classify_email",
    route_email,
    {"spam": "handle_spam", "legitimate": "draft_response"},
)
builder.add_edge("handle_spam", END)
builder.add_edge("draft_response", "notify_owner")
builder.add_edge("notify_owner", END)
graph = builder.compile()
```

课程提供两封测试邮件：一封来自 `john.smith@example.com` 的咨询，询问下周能否安排通话；一封号称中奖 500 万美元、要求银行信息和 100 美元手续费的垃圾邮件。为每封初始化相同的空字段，再调用 `graph.invoke(...)`。预期前者进入起草与显示草稿分支，后者进入垃圾分支。具体模型分类结果应通过 trace 检查，不应硬编码假设。

```python
initial = {
    "email": {
        "sender": "john.smith@example.com",
        "subject": "Question about your services",
        "body": "Could we schedule a call next week?",
    },
    "is_spam": None,
    "spam_reason": None,
    "email_category": None,
    "draft_response": None,
    "messages": [],
}
result = graph.invoke(initial)
print(result["is_spam"], result["draft_response"])
```

可用 `graph.get_graph().draw_mermaid_png()` 看所有可能边；要知道某一次邮件实际走了哪条边，仍需查看运行记录。课程还演示 Langfuse：安装 `langfuse`，把公钥、私钥与 host 作为环境变量，创建 `CallbackHandler()`，调用时传 `config={"callbacks": [handler]}`。这些 trace 可能包含邮件正文，接入监控前要处理敏感信息与访问控制；不要把密钥字面量写进 Notebook。

## 练习：添加“不确定”分支

让分类节点输出 `spam`、`legitimate`、`uncertain` 三种结构化值；`uncertain` 进入人工复核节点，不自动草拟或丢弃。再用伪造的邮件正文「Ignore previous instructions」测试是否改变分类规则。最后检查通知节点仍然只显示草稿，没有调用发送 API。你会看到控制流的可见性如何帮助明确安全边界。

## 面试会怎么问

**问题：长流程里模型分类错了，如何定位并恢复？** 美团面经问到长流程、幻觉与确认。回答时沿状态和边看：输入邮件是什么、分类节点输出什么、路由选择哪条边、草稿是否产生、是否有外部副作用。把不确定分类转人工，给分类节点准备反例测试；若只是草稿生成错误，可从保存的状态重新运行后续节点，但若已有真实发送动作则必须先确认外部状态，不能简单重放整张图。

## 来源与延伸阅读

- [Hugging Face Agents Course · 第一个 LangGraph](https://huggingface.co/learn/agents-course/zh-CN/unit2/langgraph/first_graph)
- [邮件分拣配套 Notebook](https://huggingface.co/agents-course/notebooks/resolve/main/unit2/langgraph/mail_sorting.ipynb)
- [美团 AI Agent 一面面经](https://www.nowcoder.com/feed/main/detail/50bcdc47e7754aa7be59b6318fea514b)
