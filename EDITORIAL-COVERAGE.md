# 原始材料到学习文章的对应关系

本文件只用于编辑验收，不由网站加载。网站正文只在页尾显示外部出处。记录时间：2026-09-22。这里的“覆盖”指课程正文的知识、例子和操作环节已转为可独立阅读的中文文章，不把同仓库的多语言副本、图片、测试数据或依赖代码算成独立文章。

## 为什么 2,500 个归档文件不等于 2,500 篇文章

当前 `ref/` 下有 2,507 个文件，其中约 1,661 个 `.md`、396 个 `.mdx`，其余主要是课程代码、Notebook、图片、翻译脚本和元数据。Microsoft 课程仓库约 1,636 个文件，包含多语言翻译与翻译图片；Hugging Face 课程约 431 个文件，同一课有多语言版本和活动页面；Coding Agent 教程约 411 个文件，多数是不同语言的 README、源码和图。不能简单把文件数等同于高价值独立知识点，也不能以此为理由把正文压成几行。

## 已整理的课程与手册

| 原始材料 | 站点目录 | 对应方式与边界 |
| --- | --- | --- |
| Hugging Face Agents Course 的 Unit 0–4 与 3 个 Bonus Unit | `site/docs/hf-course/`，39 篇 | 按概念、smolagents、LangGraph、LlamaIndex、项目和 Bonus 实操逐课展开；合并纯导读、测验和重复导航。外链 Function Calling 微调 Notebook 的独特训练流程已补成第 39 篇；未运行 GPU 训练，不把代码执行当作已验证。 |
| Microsoft AI Agents for Beginners 中文课程 00–18 | `site/docs/ms-course/`，24 篇 | 逐章整理；09、14、16、18 章因主题独立拆成多篇。重点复审了工具调用、元认知、框架/托管、部署与签名收据，保留机制、案例和操作；省略视频/社群入口、重复旅游场景与旧版或不安全伪代码。已补 classic/new Foundry 代际、hosting 版本和验签约定说明。未运行 Azure/Foundry/托管部署及需要 PyNaCl、JCS 的交叉验签，不声称示例已端到端通过。 |
| learn-claude-code 的当前中文 s01–s17 | `site/docs/coding-course/`，17 篇 | 每一节独立文章；旧 `docs/zh` 12 节版是同一教程旧结构，章节编号有移动，不再另写重复页。17 个同节 `code.py` 已逐个对照且通过静态语法解析；保留入口、状态契约、失败路径与实验，不机械复制数百行渐进重复代码。未安装依赖、调用模型或执行带文件/Shell 副作用的示例。 |
| AIGC Interview Book「02 编码 Agent 与 AgentOS」 | `site/docs/aigc-engineering/coding-01..08`，8 篇 | Q001–004 → 01；005–009 → 02；010–014 → 03；015–019 → 04；020–024 → 05；025–029 → 06；030–034 → 07；035–038 → 08。 |
| AIGC Interview Book「03 设计模式与工作流」 | `site/docs/aigc-engineering/pattern-01..05`，5 篇 | Q001–004 → 01；005–009 → 02；010–014 → 03；015–019 → 04；020–024 → 05。 |
| AIGC Interview Book「04 MCP 与 A2A」 | `site/docs/aigc-engineering/protocol-01..06`，6 篇 | Q001–004 → 01；005–009 → 02；010–014 → 03；015–019 → 04；020–024 → 05；025–028 → 06。协议变动按新规范纠错。 |
| AIGC Interview Book「05 记忆与上下文」 | `site/docs/aigc-advanced/memory-01..06`，6 篇 | Q001–004 → 01；005–009 → 02；010–014 → 03；015–019 → 04；020–024 → 05；025–028 → 06。 |
| AIGC Interview Book「06 安全评测与 AgentOps」 | `site/docs/aigc-advanced/ops-01..06`，6 篇 | Q001–004 → 01；005–009 → 02；010–014 → 03；015–019 → 04；020–024 → 05；025–028 → 06。 |
| AIGC Interview Book「07 企业级平台」 | `site/docs/aigc-advanced/platform-01..06`，6 篇 | Q001–004 → 01；005–009 → 02；010–014 → 03；015–019 → 04；020–024 → 05；025–028 → 06。 |
| AIGC Interview Book「08 Harness Engineering」 | `site/docs/aigc-architecture/harness-01..06`，6 篇 | Q001–004 → 01；005–008 → 02；009–012 → 03；013–017 → 04；018–021 → 05；022–024 → 06。 |
| AIGC Interview Book「09 自进化与多平台」 | `site/docs/aigc-architecture/evolution-01..06`，6 篇 | Q001–004 → 01；005–008 → 02；009–012 → 03；013–016 → 04；017–020 → 05；021–024 → 06。 |
| AIGC Interview Book「01 基础」与选出的学习路径 | `site/docs/start/`、`site/docs/core/`、`site/docs/aigc-foundations/`、首页 30 天计划 | 01 的 Q001–Q030 逐题核对，独特的九层架构与具体框架机制新增 4 篇，其余归入已有专题（下表）。选中路线 01/08 属于主题链接与验收清单；04 的六层结构和原先缺失的限时口述标准、工具 Schema 检查，已进入 `start/learning-path.md`。 |
| 官方 Agent 实践指南 PDF | `site/docs/start/agent-map.md` 等主题文章 | 已读完 34 页，纳入任务选择、工作流与 Agent 边界、工具、护栏和评测；不另做缩写式 PDF 摘要。 |
| 2026-09 工程生态时效核对 | `site/docs/runtime/protocols.md`、`aigc-engineering/protocol-03-mcp-core.md`、`production/deployment-lifecycle.md` 等 | OpenAI Agents API/旧产品退役、MCP 2026-07-28 变动与 A2A v1 版本差异已进入相应机制正文；版本类信息需在面试或上线前再核对官方页面。 |
| Datawhale Agent Learning Hub | `site/docs/start/project-ladder.md`、`project-reading-guide.md`、30 天计划 | 它是路线、项目阶梯与精选资源目录，不是逐章教材。11 级项目已转为具备验收标准的课文；Browser/Computer Use 已进入第 20 天；代表性项目按工程问题做了选读路线。只核验相关仓库的官方入口与版本边界，不能把链接所指项目算作已精读。 |

### 基础手册 01 的逐题落位

| 原题 | 站点文章 ID 与具体内容 |
| --- | --- |
| Q001–002 | `agent-map`：Agent 定义、可交付系统，Chatbot/Workflow/Copilot 边界 |
| Q003–004 | 新增 `architecture-layers`：九层技术栈、一次请求的组件路径、从 Demo 到系统 |
| Q005 | `agent-loop`：动作循环、停止、重规划 |
| Q006 | `pattern-02-react`、`pattern-03-plan-reflection`、`pattern-04-search`：ReAct、规划反思与多路径搜索 |
| Q007–009 | `protocol-02-function-calling`、`tool-use`：结构化请求、Schema、权限、错误和选择评测 |
| Q010 | `security`、`platform-04-product`：风险边界与人审 |
| Q011–014 | `protocol-01-landscape`、`protocol-03-mcp-core`、`protocol-05-a2a-core`：MCP/A2A 架构、传输与分层 |
| Q015 | `memory-06-skills-project`：Skill 与工具区别、按需加载 |
| Q016–019 | 新增 `framework-ecosystem`、`openai-agents-sdk`、`langgraph-stateful-workflow`：框架原语与选型；Q016 的通用定义也由三篇共同覆盖 |
| Q020 | `coding-01-architecture`、`coding-05-client-remote`、`coding-agent`：编码 Agent 架构、入口与实作 |
| Q021–025 | `memory-01-context`、`memory-02-types-rag`、`memory-04-context-window`、`context-pipeline`、`context-memory`、`coding-03-repository-context`：上下文、记忆、RAG 和压缩恢复 |
| Q026–029 | `security`、`ops-01-risk`、`ops-02-guardrails`、`ops-03-evaluation`、`ops-04-tracing`、`eval-observability`：风险、Guardrail、Trace、评测。Q029 原文的 HumanEval/MBPP 属代码生成而非多步 Agent 环境基准，未混入 Agent 指标。 |
| Q030 | `platform-01-control-plane`、`platform-02-core-modules`、`platform-03-multitenancy`、`platform-06-selection`：企业平台系统设计 |

## 面经：一场记录对应一篇独立复盘

`site/docs/interview/case-*.md` 每篇对应一条候选人记录，保留原帖的题目组合与先后顺序。文章中的详细回答是教学推演，不冒充候选人的现场作答。候选人自述的公司、岗位、日期和结果不等于企业官方题库。中文一手记录优先；匿名编辑稿只在有独特场景题时补充。

16 场已做第二轮交叉验收：逐篇复核原题顺序、缺题标记、候选人自述与教学推演、页尾来源。针对原帖未披露题面的地方只写“未公开”，不补造；这一轮补回百度三轮记录中的少数追问，并校正字节 08-12 的缺题提示、Harvey 电话面的题面限制、美团 08-23 的反问标记。

| 原帖 | 独立复盘文章 | 特别边界 |
| --- | --- | --- |
| [影石 08-09](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62) | `case-insta360-agent-2026-08-09` | 题目 Q1–Q21 |
| [小红书 08-09](https://www.nowcoder.com/feed/main/detail/223fa82f976b4418b214894bd7d941fd) | `case-xiaohongshu-agent-2026-08-09` | 题目 Q1–Q18 与反问 |
| [TikTok 08-09](https://www.nowcoder.com/feed/main/detail/7b1b40fda3244715a82bcb4a821ca887) | `case-tiktok-2026-08-09` | 项目涉及会议转写与多模态 |
| [小红书 08-12](https://www.nowcoder.com/feed/main/detail/f1ed02bfdae04730837753b62e0d58b9) | `case-xiaohongshu-agent-2026-08-12` | 原帖只概述 Q3–Q12，未披露 Q23–24；没有补造 |
| [字节 08-12](https://www.nowcoder.com/discuss/921444774287003648) | `case-bytedance-2026-08-12` | Agent 与后端混合题 |
| [百度 MEG 08-18](https://www.nowcoder.com/discuss/921590204903723008) | `case-baidu-meg-2026-08-18` | “三层压缩”不是据此确认的官方固定算法 |
| [美团 08-23](https://www.nowcoder.com/feed/main/detail/1d067ce539c64d3988eabb9b646ef8a0) | `case-meituan-agent-2026-08-23` | 题目 Q1–Q17 与反问 |
| [百度 Coding Agent 三轮](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9) | `case-baidu-coding-agent-three-rounds` | 8 月 18/21/24 日三轮保留在同一篇，未与别的候选人合并 |
| [要务科技 09-07](https://www.nowcoder.com/discuss/926539013991796736) | `case-yaowu-ai-app-2026-09-07` | 题目 Q1–Q22 |
| [百度 Agent 实习 09-07](https://www.nowcoder.com/feed/main/detail/bb8c28105f364770b57ff5eb5649cc60) | `case-baidu-agent-2026-09-07` | 原帖未公开项目参数和树题 I/O |
| [小红书端侧 09-14](https://www.nowcoder.com/feed/main/detail/7d354aa6146d467a92bf1132dd33438f) | `case-xiaohongshu-ondevice-2026-09-14` | 原帖未公开实验指标与部分缩写定义 |
| [字节 09-15](https://www.nowcoder.com/discuss/929406267141914624) | `case-bytedance-agent-2026-09-15` | 原帖未公开 DFS 题面 |
| [字节 09-16](https://www.nowcoder.com/discuss/929731481189044224) | `case-bytedance-agent-2026-09-16` | 原帖未公开现场回答与算法输入约束 |
| [美团 09-16](https://www.nowcoder.com/feed/main/detail/50bcdc47e7754aa7be59b6318fea514b) | `case-meituan-agent-2026-09-16` | 30 题，原帖未公开项目架构与实测指标 |
| [Harvey 匿名编辑稿](https://prachub.com/interview-experiences/harvey-ai-agent-interview-experience-three-rounds-and-a-frustrating-empty-office) | `case-harvey-document-agent-2026-08` | 保留文档评级、多 Agent 冲突、现场 RAG 等独特题型 |
| [Scale AI 匿名编辑稿](https://prachub.com/interview-experiences/scale-ai-backend-engineer-interview-experience-full-onsite-loop-with-a-claude-assisted-coding-round) | `case-scale-2026-07` | 面试在 7 月，8 月只是发帖；AI 辅助编码政策仅属该场情境 |

## 没有另立文章的材料

- 同课程的多语言翻译、旧版 README、目录页、社群活动页和纯测验，与所选课程主线重复或不承载独立知识点。
- Datawhale Agent Learning Hub 后半部的大量仓库、论文和博客链接是策展目录，不等于其全文已被本站阅读或转载。项目阶梯、Browser 练习和代表性项目选读已承接；其余数十条链接不逐条伪装为已精读文章。
- Raytheon 署名复盘只公开了七个宽泛讨论方向，未提供具体题目、实现或追问链；这些方向已由系统设计、FDE、RAG、评测和治理文章覆盖。是否另立页按独特内容审计决定。
- 社区批量“标准答案”题单只能做查漏，不当作公司真题证明；单条真实面经不会与其他候选人的经历合并。

## 尚待验收

1. Microsoft 关键代码接口已按官方文档复审，但 Azure/Foundry/托管部署和签名 Notebook 的真实运行仍需对应账户、依赖与云资源；Hugging Face 微调 Notebook 已逐格整理但尚未执行 GPU 训练。
2. 核对每个项目选读链接的版本与可达性；尚未归档的外部仓库只作选读，不算已完成课程。
3. 源文样例中的真实云服务与 GPU 作业不在本机强行运行；要作为生产教程使用时仍应在有账户、依赖与隔离环境的条件下按页尾官方版本重新执行。
