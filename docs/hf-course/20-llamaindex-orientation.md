# LlamaIndex 从哪里开始：组件、集成与 LlamaHub

LlamaIndex 擅长把你的资料接入模型应用：加载文件或服务数据，拆分并索引，查询相关内容，再把检索能力交给 Agent 或工作流。Hugging Face 的 LlamaIndex 单元先讲组件，再讲工具、Agent 和事件驱动工作流。对初学者来说，先理解这些层次，比一开始记住所有类名更有效。

| 层次 | 在示例中的职责 | 典型对象 |
| --- | --- | --- |
| 数据组件 | 从文件或服务获取内容 | `SimpleDirectoryReader`、LlamaParse、LlamaHub reader |
| 索引与查询 | 切分、嵌入、存储和检索 | `VectorStoreIndex`、`QueryEngine` |
| 工具 | 把功能暴露给模型 | `FunctionTool`、`QueryEngineTool` |
| Agent | 根据问题选工具并多步行动 | `AgentWorkflow`、`ReActAgent` |
| 工作流 | 用事件和步骤控制过程 | `Workflow`、`Event`、`@step` |

课程特别看重 `QueryEngine`：Alfred 筹办晚宴前需要查日历、饮食偏好和往年菜单，查询引擎可以把私有资料中相关的内容找出来供他使用。它本身也可以直接回答问题；包成 `QueryEngineTool` 后，Agent 才能在多种工具之间自主选择何时检索。

## 在 LlamaHub 找集成包

[LlamaHub](https://llamahub.ai/) 是组件和工具的注册入口。课程给出一个易记的安装规律：`llama-index-{component-type}-{framework-name}`。例如连接 Hugging Face 推理 API 的 LLM 组件：

```bash
pip install llama-index-llms-huggingface-api
```

```python
from llama_index.llms.huggingface_api import HuggingFaceInferenceAPI

llm = HuggingFaceInferenceAPI(
    model_name="Qwen/Qwen2.5-Coder-32B-Instruct",
    temperature=0.7,
    max_tokens=100,
)
print(llm.complete("Hello, how are you?"))
```

示例把 `token="hf_xxx"` 直接写进示例，便于说明参数；实际项目应从 Secret 或环境变量读取，不要提交真实 token。安装包名、导入路径和模型服务配置可能随版本变化，要以当前集成页面为准。后续 Chroma、Google ToolSpec、Workflow 可视化也分别需要扩展包，别以为安装 `llama-index` 就自动得到所有集成。

## 选择练习路线

如果你要回答私有资料问题，先看下一课的数据管道；若只想让 Agent 使用一项 Python 函数，可先看工具课；若已清楚工具和查询引擎，再读 AgentWorkflow；需要显式步骤和循环时看事件工作流。每一层都可以单独测试：加载是否读到正确文档、检索是否命中、工具是否返回预期、Agent 是否在适当时调用。

## 面试会怎么问

**问题：一个 Agent 项目的 RAG 问答为什么需要区分索引、查询工具和 Agent？** 回答时沿三层说明：索引负责把资料处理成可检索结构，查询工具负责把检索和生成封成可调用能力，Agent 负责判断何时需要查询或改用其他工具。固定 RAG 流程也可以直接调用 QueryEngine，不一定需要 Agent；若工具选择本身有任务价值，再引入 Agent。这样能把框架名还原成各层的具体职责。

## 来源与延伸阅读

- [Hugging Face Agents Course · LlamaIndex 简介](https://huggingface.co/learn/agents-course/zh-CN/unit2/llama-index/introduction)
- [Hugging Face Agents Course · LlamaHub](https://huggingface.co/learn/agents-course/zh-CN/unit2/llama-index/llama-hub)
- [LlamaHub](https://llamahub.ai/)
- [字节 Agent 开发一面面经](https://www.nowcoder.com/discuss/929406267141914624)
