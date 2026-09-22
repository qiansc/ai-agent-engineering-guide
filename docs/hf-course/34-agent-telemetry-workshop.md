# 实作 Agent 追踪：从第一条 Span 到数据集回归

这一练习用 smolagents 运行 Agent，用 OpenTelemetry 采集调用链，再把数据送到 Langfuse。随后加入用户反馈、自动评判与离线数据集。即使将来换观测平台，也可以沿用“埋点—关联—评价—复盘”的思路。请在测试账号和无敏感数据的环境中动手；仪表板可能记录提示词、工具输入和输出。

## 第一步：配置依赖与凭据

Notebook 环境可安装所需包：

```python
%pip install 'smolagents[telemetry]' opentelemetry-sdk \
  opentelemetry-exporter-otlp openinference-instrumentation-smolagents \
  langfuse datasets 'smolagents[gradio]'
```

从 Langfuse 控制台取得 public/secret key，并为推理服务配置 `HF_TOKEN`。不要把密钥硬编码进公开 Notebook 或 Space；在平台 Secret 或进程环境中设置，再在代码中读取。OTLP endpoint 指向你实际使用的 Langfuse 区域：

```python
import os, base64

public_key = os.environ["LANGFUSE_PUBLIC_KEY"]
secret_key = os.environ["LANGFUSE_SECRET_KEY"]
host = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")
auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = host + "/api/public/otel"
os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = f"Authorization=Basic {auth}"
```

这段认证头是发给遥测端点的，不应打印或写入日志。如果环境变量、区域和 endpoint 不对应，Agent 可以正常回答，却看不到 trace；这是首先要排查的情况。

## 第二步：为 smolagents 加埋点

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from openinference.instrumentation.smolagents import SmolagentsInstrumentor
from smolagents import CodeAgent, InferenceClientModel

provider = TracerProvider()
provider.add_span_processor(SimpleSpanProcessor(OTLPSpanExporter()))
trace.set_tracer_provider(provider)
SmolagentsInstrumentor().instrument(tracer_provider=provider)
tracer = trace.get_tracer(__name__)

agent = CodeAgent(tools=[], model=InferenceClientModel())
agent.run("1+1=")
```

打开仪表板找这次运行；确认能看到整体 trace 和模型 span，再加入搜索工具测试多步骤：

```python
from smolagents import DuckDuckGoSearchTool

search_agent = CodeAgent(
    tools=[DuckDuckGoSearchTool()],
    model=InferenceClientModel(),
)
search_agent.run("How many Rubik's cubes fit inside Notre Dame Cathedral?")
```

这道题的估算未必有精确标准答案；练习重点是查看模型与搜索分别花了多久、用了多少 token、是否重复搜索，以及最终答案有无说明假设。若只看到总耗时而没有子 span，检查 instrumentation 是否在 Agent 创建/运行前启用。

## 第三步：关联用户、会话与反馈

为一次运行创建父 span，附上非敏感的用户/会话标识和标签：

```python
with tracer.start_as_current_span("agent-request") as span:
    span.set_attribute("langfuse.user.id", "test-user-123")
    span.set_attribute("langfuse.session.id", "test-session-456")
    span.set_attribute("langfuse.tags", ["workshop", "search"])
    answer = search_agent.run("What is the capital of Germany?")
    trace_id = span.get_span_context().trace_id
```

在 UI 中收集点赞/点踩时，需要把反馈精确关联到**那一次回答**的 trace ID。Notebook 为演示把最近的 ID 放在全局变量里；多人并发时这会串线，生产实现应按消息 ID、会话 ID或数据库记录保存映射，并在反馈回调中再次校验当前用户有权操作该回答。反馈可以映射为 1/0 分数，但它是主观评价，不是事实正确性的标签。

自动评判可定义“是否有害”“是否回答了问题”等模板，由另一个 LLM 给出评分。把评判结果也关联到 trace，并抽样人工复核；对事实正确性尤其不能只凭“语气可信”得分。

## 第四步：建立离线题集并比较运行

可以从 GSM8K 取少量数学题作为演示。先只选前 10 条，避免第一次练习就上传整个数据集并产生不必要的调用成本：

```python
from datasets import load_dataset
from langfuse import Langfuse

rows = load_dataset("openai/gsm8k", "main", split="train[:10]")
langfuse = Langfuse()
dataset_name = "gsm8k-agent-workshop"
langfuse.create_dataset(name=dataset_name, description="Small math smoke test")

for i, row in enumerate(rows):
    langfuse.create_dataset_item(
        dataset_name=dataset_name,
        input={"text": row["question"]},
        expected_output={"text": row["answer"]},
        metadata={"source_index": i},
    )
```

对每个 item 运行 Agent，把 trace 关联到 dataset item，设置清晰的 `run_name` 和模型版本，然后 `langfuse.flush()` 确保数据送达。原始 GSM8K `answer` 包含解题过程与最终答案标记，不能把它与 Agent 的简短数值回答直接做字符串完全匹配；先解析出可比较的最终数值，另设过程质量评价。Notebook 中把 `<example_eval>` 写成常数 1 只是展示评分 API，**不是有效评估**。

同一题集可比较不同模型、工具与提示词。每次修改保留配置、时间、样本数和错误记录；若只做十题，任何一个题目的变化都会明显改变比率，不能据此宣称普遍改进。

## 验收清单

跑完后应能指出：哪一个模型 span 最慢；搜索工具是否真的被调用；某条用户反馈对应哪次回答；离线错误是推理错误还是答案提取错误；切换配置后质量、延迟和成本如何一起变化。若无法回答，说明只是“接上了仪表板”，还没有形成可用的观测和评估闭环。

## 面试会怎么问

**问：如何避免用户反馈关联错 trace？** 答：不要用全局“最后一次 trace ID”；把每条回答的消息 ID、用户/会话 ID 与 trace ID 持久关联，反馈时按消息取回并校验权限。

**问：仪表板有 token、耗时、评分，为什么还要保存原始失败样本？** 答：聚合指标只显示趋势，无法解释具体失败；原始样本和调用链能定位模型、检索、工具还是格式问题，并成为下轮离线回归用例。

## 来源与延伸阅读

- [Hugging Face Agents Course：Monitoring and Evaluating Agents Notebook](https://huggingface.co/learn/agents-course/bonus-unit2/monitoring-and-evaluating-agents-notebook)
- [可运行 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/bonus-unit2/monitoring-and-evaluating-agents-notebook.ipynb)
