# 开始动手前：账户、推理接口与本地模型

这套练习的练习主要借助 Hub、Spaces 和 Notebook：账户用于访问模型、创建 Space，token 用于让代码调用推理服务。先把访问凭据放好，再决定使用托管推理还是本地模型。这样到了 Agent 代码课，就不会把连接失败误判成工具逻辑错误。

## 使用 Hugging Face 托管服务

在 [Hugging Face 注册页](https://huggingface.co/join)创建账户。需要运行这里的托管推理练习时，从 [token 页面](https://hf.co/settings/tokens)创建符合当前接口要求的 token。Space 应把它放进 Settings → Variables and secrets → New secret，名称通常为 `HF_TOKEN`；本地开发可以使用环境变量或 Notebook 的 secrets。**不要在代码、公开 Space 文件或笔记截图里写 token。**

接着可以关注 [Agents Course 组织](https://huggingface.co/agents-course)，查找配套 Space 与 Notebook。给 GitHub 仓库点星、转发海报属于自愿的社区支持行为，不影响练习是否完成。若要提问，先附最小复现：模型 ID、依赖版本、报错、是否在 Space 或本地运行，并删除 token 与私人数据。

## 额度不足时试试本地 Ollama

课程准备页给出 Ollama 路线，作为托管推理不可用时的替代。先按 [Ollama 安装说明](https://ollama.com/download)安装；以下保留模型和端口示例，运行前检查本机资源与当前可用模型：

```bash
ollama pull qwen2:7b
ollama serve
```

默认服务地址为 `http://127.0.0.1:11434`。若 `ollama serve` 提示端口已占用，先检查是否已有 Ollama 服务运行，不要直接杀掉未知进程。示例建议用 `smolagents[litellm]` 的 `LiteLLMModel` 连接：

```bash
pip install 'smolagents[litellm]'
```

```python
from smolagents import LiteLLMModel

model = LiteLLMModel(
    model_id="ollama_chat/qwen2:7b",
    api_base="http://127.0.0.1:11434",
    num_ctx=8192,
)
```

这表示把框架的模型适配层指向本地 Ollama，而不是说本地模型与托管模型在质量、上下文或工具调用格式上完全相同。当前 `smolagents` 和 LiteLLM 的参数可能随版本变化；运行时以安装版本文档为准。替换模型后先测试一次普通对话，再测试工具调用与结果回填。

## Discord 是否必须加入

不必。示例的 Discord 指南介绍了加入服务器、验证账户、选择 AI Agent 兴趣、在课程讨论和答疑频道发问，以及使用线程整理长讨论。这些界面与频道名称可能变化，也不承载 Agent 的核心知识。需要社区帮助时，从 [官方邀请链接](https://discord.gg/UrrTSsSyjb)进入，按当前界面找到课程频道；不使用 Discord 也能完成本站练习。

准备完成的标志很简单：能安全存放访问凭据，能让所选模型回答一条普通消息，知道在哪里看运行日志。下一步就可以进入 Agent 基础课。

## 来源与延伸阅读

- [Hugging Face Agents Course · 启航准备](https://huggingface.co/learn/agents-course/zh-CN/unit0/onboarding)
- [Hugging Face Agents Course · Discord 101](https://huggingface.co/learn/agents-course/zh-CN/unit0/discord101)
