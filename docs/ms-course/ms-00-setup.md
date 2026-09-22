# 把 Microsoft AI Agents 课程跑起来

动手练习主要使用 Jupyter Notebook：先让一个最小 Agent 回答问题，再逐步接入工具、检索、规划和多 Agent。真正动手前，先把 Python、模型部署和认证连通。下面给出几种环境选择；只读概念文章不要求你先购买云资源。

## 先拿到课程文件

如果要保存自己的笔记和改动，在 GitHub 上 Fork [课程仓库](https://github.com/microsoft/ai-agents-for-beginners)，然后克隆自己的 Fork。仓库含多语言资料，完整历史可能很大。只想做练习时，浅克隆就够了：

```bash
git clone --depth 1 https://github.com/<your-username>/ai-agents-for-beginners.git
cd ai-agents-for-beginners
```

若只做前两课，可使用 Git 2.25 以上版本的稀疏检出；`--filter=blob:none` 还会避免预先下载不需要的文件内容：

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/<your-username>/ai-agents-for-beginners.git
cd ai-agents-for-beginners
git sparse-checkout set 00-course-setup 01-intro-to-ai-agents
```

以后练工具调用，再把 `04-tool-use` 加入稀疏目录即可。GitHub Codespaces 适合不想在本机安装完整依赖的人。保留 `.git` 才能继续提交、拉取和更新材料；删除 `.git` 的做法会丢掉这些功能，通常不必做。

## 准备本地运行环境

Python 示例要求 Python 3.12 或以上，.NET 示例要求 .NET 10 SDK 或以上。先检查本机版本，并在仓库根目录创建虚拟环境。macOS/Linux：

```bash
python3.12 --version
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Windows PowerShell 对应的激活命令是 `.venv\Scripts\Activate.ps1`。如要运行 .NET 例子，用 `dotnet --list-sdks` 核对 SDK。Notebook 在 VS Code 中执行时，还要检查右上角选择的 Python kernel 是否指向刚创建的 `.venv`；终端已经激活虚拟环境，不代表 Notebook 自动切换了内核。

Notebook 文件名通常是 `*-python-agent-framework.ipynb`。读代码时先看该 Notebook 使用的是 `FoundryChatClient`、直接 Azure OpenAI Responses API，还是本地 OpenAI 兼容客户端：三种方式所需的环境变量不同。仓库会继续更新，运行前以下载版本的 `requirements.txt` 和 Notebook 实际导入为准。

## 连接 Microsoft Foundry

多数 Python Notebook 使用 Microsoft Agent Framework 的 `FoundryChatClient`，通过 Microsoft Foundry 项目端点连接已部署模型，并用 Azure CLI 登录态认证。你需要 Azure 订阅、Foundry 项目、已部署的模型以及 Azure CLI。创建与配置顺序如下：

1. 登录 [Microsoft Foundry](https://ai.azure.com)，创建或选用现有 hub，并在其中创建 project。
2. 在项目的 **Models + Endpoints** 部署示例支持的模型，记下 **Deployment name**。这里以 `gpt-5-mini` 为示例，实际能部署的模型取决于账户和区域。
3. 从项目 **Overview** 复制 project endpoint。
4. 运行 `az login`。无浏览器的远程终端可运行 `az login --use-device-code`。若账户有多个订阅，选包含该项目的订阅，再用 `az account show` 检查当前账户和订阅。
5. 复制环境变量模板并填写项目端点与部署名称。

```bash
cp .env.example .env
```

```env
AZURE_AI_PROJECT_ENDPOINT=https://<your-project>.services.ai.azure.com/api/projects/<your-project-id>
AZURE_AI_MODEL_DEPLOYMENT_NAME=gpt-5-mini
```

PowerShell 复制文件可用 `Copy-Item .env.example .env`。这些值不是可以照抄的公共地址：endpoint 来自你自己的项目，部署名称要与 **Models + Endpoints** 中完全一致。`AzureCliCredential` 使用 `az login` 的身份，因此这一路径通常不必把 API key 存在 `.env`。`.env` 仍可能有其他敏感配置，不能提交到公开仓库。

先运行第 1 课的 Notebook，确认模型能够回复，再继续工具或多 Agent 练习。失败时按顺序检查 kernel、变量是否加载、当前 Azure 订阅、端点所属项目、部署名称和账号权限。把认证问题与模型生成质量问题分开排查，会节省许多时间。

## 后续练习还需要什么

第 5 课的 Agentic RAG 示例使用 Azure AI Search。运行它时，另在 `.env` 中加入 `AZURE_SEARCH_SERVICE_ENDPOINT`（Search 资源 Overview 的 URL）和 `AZURE_SEARCH_API_KEY`（资源的密钥页）。这是访问检索服务所需的配置；仅阅读 RAG 原理不需要创建 Search 资源。

第 6、8 课有部分 Notebook 直接调用 Azure OpenAI Responses API，而不是通过 Foundry 项目端点。对应配置是 `AZURE_OPENAI_ENDPOINT`、`AZURE_OPENAI_DEPLOYMENT`，若使用密钥认证还需 `AZURE_OPENAI_API_KEY`。无密钥方式可用 `az login` / Entra ID。不要把 Foundry project endpoint、Azure OpenAI resource endpoint 和 Search endpoint 混填。示例所用的 Azure OpenAI `/openai/v1/` 路径与其示例版本对应；云服务接口可能变化，运行时以当前 Notebook 和官方文档核对。

第 8 课另有 Bing Grounding 条件工作流：它需要 `BING_CONNECTION_ID`，可从 Foundry 项目 **管理 → 已连接资源** 中找到对应 Bing 连接。没有这个连接，先学习其他工作流，不要把搜索结果自行伪装成该工具输出。

## 云端之外的选择

除 Foundry 外，也可以给 `OpenAIChatClient` 连接 OpenAI 兼容服务。MiniMax 使用 `MINIMAX_API_KEY`、`MINIMAX_BASE_URL`、`MINIMAX_MODEL_ID`；示例 base URL 是 `https://api.minimax.io/v1`。部分 Notebook 会自动读取这些变量。Novita AI 则使用 `NOVITA_API_KEY`、`NOVITA_BASE_URL`、`NOVITA_MODEL_ID`，示例 base URL 是 `https://api.novita.ai/openai/v1`；现有示例不会自动读取 `NOVITA_*`，要在创建客户端时显式传入。两者的模型 ID 都要以自己账户实际可用的模型为准。OpenAI 兼容不等于所有 Foundry Notebook 都能无改动运行：客户端类型、工具调用与状态能力仍需逐项确认。

Foundry Local 可以把模型留在本机运行，适合离线实验。安装与启动命令示例如下：

```bash
# Windows
winget install Microsoft.FoundryLocal
# macOS
brew tap microsoft/foundrylocal
brew install foundrylocal
foundry model list
foundry model run phi-4-mini
python -m pip install foundry-local-sdk
```

运行后，`FoundryLocalManager("phi-4-mini")` 可发现本地端点，再交给 `agent_framework.openai.OpenAIChatClient`。注意：Foundry Local 提供的 OpenAI 兼容聊天端点用于本地练习，不保证具备云端 Responses API 的状态管理和完整工具编排能力。选环境时先问自己练的是「Agent 机制」还是「特定云服务功能」。前者可以尝试本地模型；后者应使用对应的云服务。

## 常见失败与处理

macOS 上若出现 `ssl.SSLCertVerificationError: CERTIFICATE_VERIFY_FAILED`，可先尝试对应 Python 安装目录中的 `Install Certificates.command`，或者安装 `truststore` 并在网络调用之前执行 `truststore.inject_into_ssl()`。有些旧示例还提及 `connection_verify=False`，这会跳过 TLS 证书验证，仅可视为开发环境的临时排查手段，不能带进生产代码。若报错来自企业代理或自签名证书，应按组织的证书安装规范处理。

练习前还可以做一个小检查：能否打印当前 Python 路径、`az account show` 是否是正确订阅、`.env` 是否存在且未提交、模型部署名是否与控制台相同。四项都对，再看具体的 SDK 错误信息。

## 面试会怎么问

近期面经虽少问某家云平台的按钮位置，但会沿着「怎样让 Agent 项目从笔记本进入可运行环境」追问。回答时先讲运行依赖与认证边界：模型端点、部署名、身份、工具服务和配置分开管理；说明本地/测试/生产环境如何避免密钥写入代码；最后讲启动检查和失败定位。不要把「我在控制台点过部署」当作生产经验。百度与影石样本还问到 Harness 的恢复和长任务运行，可用环境检查作为整个运行链的第一环。具体工程设计仍需结合后面的运行时课程。

## 来源与延伸阅读

- [Microsoft AI Agents for Beginners · Course Setup](https://github.com/microsoft/ai-agents-for-beginners/tree/main/00-course-setup)（原文及 zh-CN 翻译；命令和服务名称以所用版本核对）
- [百度 Coding Agent 三轮面经](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)、[影石创新 AI Agent 面经](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)
