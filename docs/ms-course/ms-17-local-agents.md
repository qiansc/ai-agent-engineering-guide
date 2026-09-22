# 本地 Agent：用小模型、文件工具和本地检索完成工程任务

并非每次 Agent 任务都要把代码和文档发到云端。下面用 Foundry Local 运行 Qwen，接文件读取、代码分析、Chroma 检索和本地 MCP，做一个离线工程助手。优势是敏感资料可留在设备上、没有云端按 token 收费、断网时仍可工作；代价是硬件资源有限，小模型处理开放式长推理可能不及大模型。是否真正“数据不离机”，还要看嵌入模型、工具、遥测和混合路由有没有联网。

## 给小模型安排合适工作

可以让 SLM 负责分类、抽取、已知文档摘要和工具选择，把读文件、精确搜索、计算交给外部工具。模型不必记住整个代码库；它需要判断何时调用 `read_file`、`search_docs` 或代码分析。面对跨很多模块的开放式设计问题，它可能需要更强模型或拆分任务。工具调用能力也要实测：聊天流畅的模型未必稳定产出正确的函数名与 JSON 参数。

Qwen 是一个可选的函数调用模型族，不代表任何 Qwen 变体或量化版本都同样可靠。给选定的本地模型做小型评测：应该读文件时是否读了、是否能引用行号、遇到无权限路径是否停止、连续三步是否丢失目标。工作站可把约 8 GB RAM 当作最低经验值、16 GB 更舒适；真实需要取决于模型大小、量化方式、上下文窗口与 CPU/GPU/NPU。

## 安装 Foundry Local 与选择模型

Foundry Local 可下载并运行模型，并提供应用可连接的本地端点。示例命令包括 `foundry model run qwen2.5-7b-instruct` 和 `foundry service status`，但 CLI 命令会随版本变化。当前官方 CLI 文档的 macOS 安装为 `brew tap microsoft/foundrylocal`、`brew install foundrylocal`；Windows 可用 `winget install Microsoft.FoundryLocal`。先运行 `foundry --version`、`foundry model list --search qwen` 查看本机实际可用模型，再按当前 CLI 选择运行命令。第一次下载运行时和模型需要网络，之后能否离线使用要先实际验证。

```bash
# macOS Apple Silicon：按当前官方 CLI 文档
brew tap microsoft/foundrylocal
brew install foundrylocal
foundry --version
foundry model list --search qwen

# Windows 安装对应命令
winget install Microsoft.FoundryLocal
```

Notebook 使用 `foundry-local-sdk` 自动发现本地端点，避免硬编码端口。大致客户端关系是 `FoundryLocalManager(模型别名)` 得到 `endpoint` 与本地 API key 占位值，再传给 `OpenAI(base_url=..., api_key=...)`。这里“OpenAI 兼容”指可复用一部分调用形状，不保证云端 Responses API 的状态、工具或所有模型特性完整一致；迁移时应重跑功能测试，而不是只改一行 `base_url` 就宣布等价。

## 本地工具要设目录边界

工程助手能列文件、读文件、统计源代码或查 TODO。读文件工具绝不能把模型给的路径直接交给 `open()`。可以先将 `(PROJECT_ROOT / path).resolve()` 得到规范路径，再检查它等于项目根或位于根目录内，才读取内容。这个检查能阻止 `../../` 跨目录访问；实际实现还要考虑符号链接变化、文件尺寸、二进制文件、编码错误与用户权限。项目根应是用户明确选择的小目录，不能默认整个家目录。

本地 MCP server 可经 `stdio` 作为子进程暴露文件、Git 或数据库工具。它仍以运行它的系统用户权限执行，因此“本地”不等于安全。检查 server 来源与版本、只给需要的目录与权限，工具输出仍作为不可信数据。若代理被仓库 README 中的恶意指令诱导执行无关命令，执行层仍要拒绝。

## 本地 RAG 必须每一段都本地

可用 Chroma 保存本地文档向量：本地嵌入模型处理文件片段，Chroma 在磁盘存向量，查询也在本机嵌入并检索，相关片段送本地 Qwen 生成回答。若你把嵌入步骤改成云 API，资料就已经出机；若向量库同步云端，亦非完全离线。逐项检查文档抓取、embedding、向量存储、重排、模型推理和遥测，才能诚实说“全本地”。

索引需记录文件路径、版本/修改时间、片段位置与权限。用户修改代码后重新索引，避免本地 Agent 引用旧文件。检索结果应给出可回查路径和行号；查不到时不要让小模型依据旧训练记忆猜项目实现。

## 本地与云的混合路由

敏感或离线任务可以留本地，简单有边界任务也可本地；非敏感但需要复杂多跳推理时考虑云端。云不可用可降级到本地，但要告诉用户质量与能力可能变化，尤其不能在本地模型不支持的工具路径里继续执行高风险动作。混合系统首先给数据分级，再判断是否允许出机，最后依据任务难度与评测选择模型。

“隐私”不能只靠路由器模型自行判断。含凭据、个人数据或专有代码的请求应由应用规则与用户授权控制，不因模型说“这段不敏感”就上传。缓存、日志、第三方插件也要受同一数据边界约束。

## 实验与扩展作业

`17-local-agent-foundry-local.ipynb` 建立本地工程助手：Qwen 工具调用，项目目录内的文件列表/读取，源文件基本指标，Chroma 文档检索，以及配置了才启用的本地 MCP。扩展作业让你至少索引五个真实文件，增加 `find_todos` 返回 `TODO`/`FIXME` 的文件与行号，并对纯 RAG、指定文件阅读、TODO 搜索各提一个问题，记录三次延迟。

完成时不要只看自然语言回答：检查 Agent 是否真的调用了正确工具、返回的路径是否在项目根内、引用是否对应实际行、过期索引有没有更新。最后写下哪些资料与操作永远本地、哪些非敏感复杂任务可能走云，以及云断开时会降级到什么程度。

## 面试会怎么问

小红书端侧推理面经问端侧 RAG、工具依赖、重排和效果指标。回答本地 Agent 设计时，从模型能力与硬件约束、工具合同、本地 embedding/索引、文件沙箱和离线测试讲起；若面试官问“隐私是不是有保证”，逐段列出可能出网的嵌入、遥测、插件与路由，并说明如何验证网络边界。不要只说“模型在 localhost”。

## 来源与延伸阅读

- [Microsoft AI Agents for Beginners · Creating Local AI Agents](https://github.com/microsoft/ai-agents-for-beginners/tree/main/17-creating-local-ai-agents)（本地工程助理 Notebook、八道知识检查与文档审阅作业）
- [Foundry Local 当前官方 CLI 文档](https://learn.microsoft.com/en-us/azure/foundry-local/reference/reference-cli)、[Qwen 函数调用文档](https://qwen.readthedocs.io/en/latest/framework/function_call.html)
- [小红书端侧推理面经](https://www.nowcoder.com/feed/main/detail/7d354aa6146d467a92bf1132dd33438f)
