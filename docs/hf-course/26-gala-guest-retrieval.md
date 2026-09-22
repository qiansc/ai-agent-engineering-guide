# Gala 案例（一）：把宾客资料做成可查询工具

Alfred 主持晚会时，需要知道谁是受邀宾客、与主办方的关系以及适合交流的话题。通用模型不知道这场虚构晚会的名单，也不应凭外貌或常识猜私人资料。课程因此提供 `agents-course/unit3-invitees` 数据集，让我们从数据加载、检索工具到 Agent 调用走完一条小型 RAG 路径。

这里的示例项目分成 `retriever.py`（宾客检索）、`tools.py`（其他工具）和 `app.py`（装配 Agent），并提供 [Unit 3 Space](https://huggingface.co/spaces/agents-course/Unit_3_Agentic_RAG) 供体验。数据集字段有 `name`、`relation`、`description`、`email`。它是课程中的虚构示例；真实宾客名单属于个人信息，必须按用途授权和限制访问，尤其不能因为模型想回答就把所有邮箱放进公开索引。

## 第一步：加载并保留来源

无论用哪个 Agent 框架，先把每条记录变成 Document。这里的 smolagents 与 LangGraph 线路用 LangChain `Document(page_content=..., metadata=...)`；LlamaIndex 线路用 `Document(text=..., metadata=...)`。

```python
import datasets
from langchain_core.documents import Document

guest_dataset = datasets.load_dataset("agents-course/unit3-invitees", split="train")
docs = [
    Document(
        page_content="\n".join([
            f"Name: {guest['name']}",
            f"Relation: {guest['relation']}",
            f"Description: {guest['description']}",
            f"Email: {guest['email']}",
        ]),
        metadata={"name": guest["name"]},
    )
    for guest in guest_dataset
]
```

LlamaIndex 版本只需换 Document 类型和正文参数：

```python
from llama_index.core.schema import Document as LlamaDocument

llama_docs = [
    LlamaDocument(
        text="\n".join([
            f"Name: {guest['name']}",
            f"Relation: {guest['relation']}",
            f"Description: {guest['description']}",
            f"Email: {guest['email']}",
        ]),
        metadata={"name": guest["name"]},
    )
    for guest in guest_dataset
]
```

这里把邮箱写进检索正文，是课程演示的形状；若用户只需要「如何与宾客聊天」，就不应该默认返回邮箱。生产系统可把联系方式保留在权限更严格的字段，先按身份过滤，再把必要信息交给模型。`metadata["name"]` 让我们能追溯命中的记录，但还应考虑数据版本和来源 ID。

## 第二步：用 BM25 建检索工具

课程选 BM25，因为小型名单里姓名、关系等关键词匹配很有用，也不需要调用嵌入模型。**BM25 是词项检索，不是语义向量检索。** 下面是 smolagents 版本，保留 `Tool` 的接口定义，并用 `invoke` 读取相关文档：

```python
from langchain_community.retrievers import BM25Retriever
from smolagents import Tool

class GuestInfoRetrieverTool(Tool):
    name = "guest_info_retriever"
    description = "Find a named guest or relation in the authorized gala list."
    inputs = {
        "query": {
            "type": "string",
            "description": "Guest name or relation to look up.",
        }
    }
    output_type = "string"

    def __init__(self, docs, **kwargs):
        super().__init__(**kwargs)
        self.retriever = BM25Retriever.from_documents(docs)

    def forward(self, query: str):
        results = self.retriever.invoke(query)
        if not results:
            return "No matching guest information found."
        return "\n\n".join(doc.page_content for doc in results[:3])

guest_info_tool = GuestInfoRetrieverTool(docs)
```

示例用 `get_relevant_documents`；LangChain 版本变化时 `invoke` 是同类调用路径。尤其要注意 BM25 常会给每个查询返回若干排名结果，即便它们并不真正匹配；「有 results」不等于名单里确实有这个人。姓名查询可先做精确匹配或设置可解释的阈值与人工核对。若查询是模糊兴趣描述，可再比较 embedding 检索。

LlamaIndex 线路把 BM25 检索包装成 `FunctionTool`：

```python
from llama_index.core.tools import FunctionTool
from llama_index.retrievers.bm25 import BM25Retriever as LlamaBM25

bm25 = LlamaBM25.from_defaults(nodes=llama_docs)

def get_guest_info(query: str) -> str:
    """Search the authorized gala guest list by name or relation."""
    hits = bm25.retrieve(query)
    return "\n\n".join(hit.text for hit in hits[:3]) if hits else "No match"

llama_guest_tool = FunctionTool.from_defaults(get_guest_info)
```

示例代码将 `Document` 直接传给 `nodes=`；不同版本可能要求先转换为 Node，运行时应核对对应 BM25 包的输入类型。LangGraph 线路用同一 LangChain BM25 检索器，再用 `langchain_core.tools.Tool(name=..., func=..., description=...)` 包装函数，交给图中的 `ToolNode`。三条实现的共同合同是：输入一个查询，返回可追溯的宾客片段或明确的未找到信息。

## 第三步：让 Agent 使用工具

smolagents 用 `CodeAgent(tools=[guest_info_tool], model=InferenceClientModel())`；LlamaIndex 用 `AgentWorkflow.from_tools_or_functions([llama_guest_tool], llm=...)`；LangGraph 则让聊天模型 `bind_tools([guest_info_tool])`，用 `assistant → ToolNode → assistant` 的图循环。三者都是「模型选择工具 → 程序执行 → 结果回填」，差异在于框架表达运行时的方式。

```python
from smolagents import CodeAgent, InferenceClientModel

alfred = CodeAgent(tools=[guest_info_tool], model=InferenceClientModel())
print(alfred.run("Tell me about our guest named 'Lady Ada Lovelace'."))
```

示例返回 Ada 是数学家、与主办方的关系以及一个示例邮箱。要确认回答真的来自数据集，应检查工具轨迹与具体命中的 Document；Ada 的历史常识不能替代这场晚会名单里的关系字段。示例还以 Nikola Tesla 的虚构宾客记录作为对话示例，里面的「大学老友」和当代专利只是教学剧情，不能当历史事实。

## 本课的练习

在 `retriever.py` 中完成检索工具，分别查询一位明确存在的宾客、一个不存在的姓名、一个模糊关系。对每次返回记录宾客姓名、来源与是否命中。随后只给 Agent 问「那位正在和大使说话的先生是谁」：当前文本名单没有视觉定位能力，Agent 应先承认无法从这句话辨认现场的人，而不是随机选一位资料中的宾客。

## 面试会怎么问

**问题：名单检索返回了相似记录，怎样避免误泄露其他人的邮箱？** 美团与字节的 RAG 面经都深入到检索和权限。回答时把授权放在检索前：按当前用户和活动范围过滤可访问记录，联系方式采用更严格字段权限；查询结果带记录 ID 与版本，生成阶段只使用获准字段。对姓名歧义或无匹配，要求用户补充信息或转人工，不能用 BM25 排名第一就当已确认身份。

## 来源与延伸阅读

- [Hugging Face Agents Course · 宾客信息检索](https://huggingface.co/learn/agents-course/zh-CN/unit3/agentic-rag/invitees)
- [课程宾客数据集](https://huggingface.co/datasets/agents-course/unit3-invitees/)
- [Unit 3 示例 Space](https://huggingface.co/spaces/agents-course/Unit_3_Agentic_RAG)
- [美团 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/1d067ce539c64d3988eabb9b646ef8a0)
