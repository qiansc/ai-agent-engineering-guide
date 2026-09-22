# 用 smolagents 做检索型 Agent：网页搜索与本地知识库

普通 RAG 常按预先写好的流程处理问题：把用户问题送进检索器，把命中的材料放进提示，再由模型作答。检索型 Agent 让模型在可用工具中选择下一次检索：第一次搜索不够，可以改写查询、换来源或继续读取结果。这个灵活性适合开放问题，但也带来重复搜索、错误引用和成本增加的风险。

这套练习先用 DuckDuckGo 搜索，再把一组派对策划文档做成本地检索工具。两个例子分别说明「连接外部最新资料」与「检索已知私有材料」。

## 网页搜索：把结果变成回答依据

Alfred 要为 Wayne 家的豪华超级英雄派对找装饰、娱乐和餐饮灵感。这里的最小代码如下：

```python
from smolagents import CodeAgent, DuckDuckGoSearchTool, InferenceClientModel

agent = CodeAgent(
    model=InferenceClientModel(),
    tools=[DuckDuckGoSearchTool()],
)
response = agent.run(
    "Search for luxury superhero-themed party ideas, "
    "including decorations, entertainment, and catering."
)
print(response)
```

运行时看三件事：模型生成了什么搜索词、搜索工具实际返回了哪些来源、最后的建议对应哪些结果。模型可以把一个笼统问题拆成多个查询，例如分别查装饰和餐饮；但这需要在轨迹中确实看到多次工具调用，不能仅凭最终回答推断。课程写到「将检索信息存储供未来活动使用」，而上述代码没有展示持久化实现；它只在当前运行的上下文中使用结果。若需要跨会话复用，需另建存储和更新机制。

## 本地检索：给 Agent 一个文档工具

先构造五条派对知识：豪华化装舞会、DJ 与英雄音乐、主题菜品、城市投影装饰、VR 互动。每条以 `Document(page_content=..., metadata={"source": ...})` 保存，再用 `RecursiveCharacterTextSplitter` 切分，最后用 `BM25Retriever` 取最相关的五段。**BM25 是词项匹配检索，不是向量或语义检索**；原文把它称为「语义搜索」容易让人误会。真正需要向量检索时，应换相应 embedding 与向量索引。

下面保留本课主要代码路径，并修正原文 `text_splitter` 的缩进以及返回文本未带来源的问题：

```python
from langchain.docstore.document import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.retrievers import BM25Retriever
from smolagents import Tool, CodeAgent, InferenceClientModel

party_ideas = [
    {"text": "A superhero-themed masquerade ball with gold accents and velvet curtains.",
     "source": "Party Ideas 1"},
    {"text": "Hire a professional DJ for Batman and Wonder Woman themed music.",
     "source": "Entertainment Ideas"},
    {"text": "Serve superhero-themed dishes and drinks.",
     "source": "Catering Ideas"},
    {"text": "Decorate with superhero logos and Gotham city projections.",
     "source": "Decoration Ideas"},
    {"text": "Offer VR superhero simulations and themed games.",
     "source": "Entertainment Ideas"},
]

source_docs = [
    Document(page_content=item["text"], metadata={"source": item["source"]})
    for item in party_ideas
]
splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    add_start_index=True,
    strip_whitespace=True,
    separators=["\n\n", "\n", ".", " ", ""],
)
docs_processed = splitter.split_documents(source_docs)

class PartyPlanningRetrieverTool(Tool):
    name = "party_planning_retriever"
    description = "Find party planning ideas in the prepared local documents."
    inputs = {
        "query": {
            "type": "string",
            "description": "A party planning question or search phrase.",
        }
    }
    output_type = "string"

    def __init__(self, docs, **kwargs):
        super().__init__(**kwargs)
        self.retriever = BM25Retriever.from_documents(docs, k=5)

    def forward(self, query: str) -> str:
        if not isinstance(query, str) or not query.strip():
            return "Search error: query must be a non-empty string."
        matches = self.retriever.invoke(query)
        if not matches:
            return "No relevant party ideas found."
        return "\n\n".join(
            f"Source: {doc.metadata.get('source', 'unknown')}\n{doc.page_content}"
            for doc in matches
        )

retriever_tool = PartyPlanningRetrieverTool(docs_processed)
agent = CodeAgent(tools=[retriever_tool], model=InferenceClientModel())
print(agent.run("Find luxury party ideas for entertainment, catering and decoration."))
```

示例文档都很短，`chunk_size=500` 可能根本不会把它们拆开；参数用于展示较长文档时的切分方式。`chunk_overlap=50` 能在切分边界保留一些上下文，但也会带来重复片段。输出保留 `source`，让模型和读者能回看原材料。运行上述代码还依赖相应 LangChain 和社区检索包，具体 import 路径需与安装版本匹配。

## 让检索“多步”有明确理由

课程提出四种增强方式：查询重构、多步检索、多源整合、结果验证。它们不是每个问题都要跑一遍的固定仪式。用户问「有哪些餐饮创意」时，一次本地检索可能足够；若问「今年流行且符合庄园主题的餐饮方案」，可能需要先读本地约束，再搜索新趋势，并确认网页发布时间和可用性。

多步检索的终止条件要明确：已经覆盖问题的各个方面且每项有对应来源，或预算已耗尽并说明缺口。搜索结果只是证据候选，模型还要区分广告、重复内容和不相关页面。若知识库有权限或版本要求，检索工具必须在返回前过滤，不应把所有文档先交给模型再靠提示要求它不要泄露。

## 练习：给检索结果加“无法回答”路径

把问题改为「Wayne 家客人里谁对坚果过敏」。五条示例文档没有宾客过敏信息。好的 Agent 应说知识库没有这项资料，不能根据派对菜品推断。再给文档加一条带来源的宾客约束，确认答案能指出来源。最后删除 `metadata["source"]`，比较答案的可追溯性如何下降。

## 面试会怎么问

**问题：RAG 检索召回不好，是切分问题还是 Agent 决策问题？** 字节和美团面经都问到 chunk、混合检索、rerank 与召回诊断。先用标注题集计算检索阶段是否命中正确文档；未命中时检查切分边界、关键词与同义词、索引更新和权限过滤，再比较 BM25、向量和混合检索。若正确文档已返回但模型仍答错，问题可能在结果排序、上下文截断或生成提示。Agent 的多次检索只能补足可观察的缺口，不能把底层索引质量问题掩盖掉。

## 来源与延伸阅读

- [Hugging Face Agents Course · 检索型 Agent](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/retrieval_agents)
- [配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/smolagents/retrieval_agents.ipynb)
- [字节 Agent 开发一面面经](https://www.nowcoder.com/discuss/929406267141914624)
- [美团 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/1d067ce539c64d3988eabb9b646ef8a0)
