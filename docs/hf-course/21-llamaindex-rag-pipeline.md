# LlamaIndex RAG 管道：加载、切分、索引、查询与评估

当模型没有你们的菜单、日历或业务文档时，RAG 的办法是先从资料里找相关片段，再把片段交给模型回答。Hugging Face 的 LlamaIndex 这里把过程拆成加载、索引、存储、查询、评估五个阶段。每一阶段都能独立出错，所以要沿数据路径逐步检查。

## 第一步：加载 Document

`SimpleDirectoryReader` 可以读取本地目录并产出 `Document`；复杂 PDF 可考虑 LlamaParse，其他数据源可在 LlamaHub 找 reader。下面的目录必须是你允许程序读取的资料目录：

```python
from llama_index.core import SimpleDirectoryReader

reader = SimpleDirectoryReader(input_dir="path/to/directory")
documents = reader.load_data()
print(len(documents))
```

加载成功只说明文件被读到，不保证文字提取正确。扫描件、表格和图像可能需要专门解析；资料有访问权限时，应在加载与检索阶段保留来源和授权元数据。课程用 Alfred 的晚宴任务说明：日历、饮食偏好和旧菜单来自不同资料，若混到无来源的纯文本中，后续难以解释为什么推荐某道菜。

## 第二步：切分 Node 并做嵌入

这里把 `Document` 转成较小的 `Node`：`SentenceSplitter` 按句子边界切分，`HuggingFaceInferenceAPIEmbedding` 将片段编码成向量。Node 要保留原文档的关联，供后续引用。示例使用 `BAAI/bge-small-en-v1.5` 作为嵌入模型，示例异步运行 `pipeline.arun(...)`：

```python
from llama_index.core import Document
from llama_index.core.ingestion import IngestionPipeline
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.huggingface_api import HuggingFaceInferenceAPIEmbedding

pipeline = IngestionPipeline(transformations=[
    SentenceSplitter(chunk_overlap=0),
    HuggingFaceInferenceAPIEmbedding(model_name="BAAI/bge-small-en-v1.5"),
])
nodes = await pipeline.arun(documents=[Document.example()])
```

切分太小可能丢上下文，太大可能引入无关内容并占满模型窗口；重叠可缓解跨块信息断裂，但增加索引量。示例后面又用 `chunk_size=25` 演示 Chroma，这个数值是教学示意，不能直接用作生产配置。对中文或混合文档，嵌入模型也要考虑其语言适用性；不要只因示例用了英文模型就直接照搬。

## 第三步：把节点写入 Chroma

这里使用持久化 Chroma 客户端，目录 `./alfred_chroma_db`，collection 名为 `alfred`。给摄取管道传入 `vector_store` 后，执行管道时会写入向量存储；**只构造 pipeline，不运行它，不会自动填入文档**。

```bash
pip install llama-index-vector-stores-chroma
```

```python
import chromadb
from llama_index.vector_stores.chroma import ChromaVectorStore

db = chromadb.PersistentClient(path="./alfred_chroma_db")
collection = db.get_or_create_collection("alfred")
vector_store = ChromaVectorStore(chroma_collection=collection)

pipeline = IngestionPipeline(
    transformations=[
        SentenceSplitter(chunk_size=25, chunk_overlap=0),
        HuggingFaceInferenceAPIEmbedding(model_name="BAAI/bge-small-en-v1.5"),
    ],
    vector_store=vector_store,
)
await pipeline.arun(documents=documents)
```

同一 collection 重复写入、文档更新和删除时怎么办，是生产实现必须明确的事项。示例展示的是初次构建，不提供增量同步方案。检查索引时至少记录文档数、Node 数、嵌入模型和来源版本，避免检索到旧菜单而误以为是模型幻觉。

## 第四步：用同一嵌入模型检索与回答

查询与摄取阶段要使用一致的向量空间。课程从存储重建 `VectorStoreIndex`，再提供三种接口：`as_retriever()` 返回带分数的节点，`as_query_engine()` 直接生成问答，`as_chat_engine()` 接受聊天上下文。排障时先看 retriever 命中了什么，再看生成答案，比直接改 prompt 更有用。

```python
from llama_index.core import VectorStoreIndex
from llama_index.llms.huggingface_api import HuggingFaceInferenceAPI

embed_model = HuggingFaceInferenceAPIEmbedding(model_name="BAAI/bge-small-en-v1.5")
index = VectorStoreIndex.from_vector_store(vector_store, embed_model=embed_model)
llm = HuggingFaceInferenceAPI(model_name="Qwen/Qwen2.5-Coder-32B-Instruct")
query_engine = index.as_query_engine(llm=llm, response_mode="tree_summarize")
response = query_engine.query("What is the meaning of life?")
```

示例注释「The meaning of life is 42」仅展示调用返回的形状，不证明索引中真的有这条资料。如果知识库没有答案，系统应说未找到依据，而不是让通用模型补出一个常识答案。这里介绍的响应合成策略有 `refine`（逐块迭代，调用可能较多）、`compact`（先拼接，减少调用）与 `tree_summarize`（树形汇总）。它们影响成本和答案组织，不能替代检索质量。

## 第五步：评估答案与观察链路

示例用 `FaithfulnessEvaluator` 检查答案是否受到检索上下文支持，也列出 `AnswerRelevancyEvaluator` 与 `CorrectnessEvaluator`。评测模型的 `passing` 是一项信号，不是绝对真值：最好有人工标注问题、正确来源和不应回答的样例，再分别统计召回与生成阶段的错误。

```python
from llama_index.core.evaluation import FaithfulnessEvaluator

evaluator = FaithfulnessEvaluator(llm=llm)
response = query_engine.query("What battles took place in New York City in the American Revolution?")
eval_result = evaluator.evaluate_response(response=response)
print(eval_result.passing)
```

示例还展示 Arize Phoenix / LlamaTrace 回调，让你查看加载、检索和生成轨迹。此类追踪可能包含私人文档片段和提问，接入前要处理权限、脱敏与存储位置。API key 应通过 Secret 配置，不要按示例占位代码把真实值写进文件。

## 练习：定位一条错误答案

准备 5–10 条包含明确答案和来源的文档，再造一条文档里没有答案的问题。对每题先打印 retriever 返回的 Node 和分数，再看 QueryEngine 回答与来源。若正确 Node 没返回，调整加载、切分、嵌入或 top-k；若返回了但回答仍错，检查合成策略与提示。这个顺序能把「检索问题」和「生成问题」分开。

## 面试会怎么问

**问题：知识库更新后，Agent 为什么仍回答旧信息？** 美团面经问到知识库保鲜。回答从数据链路入手：源文档是否更新，摄取是否重跑，旧 Node 是否删除或标记版本，查询是否命中旧 collection，最终答案是否带来源与版本。再提出增量索引和回归题集的方案。只说「换更强的模型」无法修复过期索引。

## 来源与延伸阅读

- [Hugging Face Agents Course · LlamaIndex 组件](https://huggingface.co/learn/agents-course/zh-CN/unit2/llama-index/components)
- [组件配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/llama-index/components.ipynb)
- [美团 AI Agent 一面面经](https://www.nowcoder.com/feed/main/detail/50bcdc47e7754aa7be59b6318fea514b)
