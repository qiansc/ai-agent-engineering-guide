# AI Agent 工程学习站

[![在线阅读](https://img.shields.io/badge/在线阅读-GitHub%20Pages-2563eb)](https://qiansc.github.io/ai-agent-engineering-guide/)
[![Pages 部署](https://github.com/qiansc/ai-agent-engineering-guide/actions/workflows/pages.yml/badge.svg)](https://github.com/qiansc/ai-agent-engineering-guide/actions/workflows/pages.yml)
[![欢迎 PR](https://img.shields.io/badge/贡献-欢迎%20PR-16a34a)](CONTRIBUTING.md)

把 AI Agent 从“会调用模型”学到“能设计、实现、评测和交付”。这里是一套以中文写成、可以直接阅读的工程学习站：目前收录 **182 篇 Markdown 文章**，覆盖基础机制、Agent 工程、生产治理、动手课程和面试准备。文章尽量讲透概念、机制、例子、实践与常见失败，并在文末列出来源与延伸阅读。

**[打开学习网站](https://qiansc.github.io/ai-agent-engineering-guide/) · [浏览 GitHub 仓库](https://github.com/qiansc/ai-agent-engineering-guide) · [查看文章目录](docs/index.json) · [参与贡献](CONTRIBUTING.md)**

## 从哪里开始

- **刚接触 Agent**：从首页的“开始学习”进入，跟着 30 天清单建立全貌，再补核心机制。
- **已经做过 Demo**：重点看工具调用、上下文、检索、工作流、评测与上线治理，逐项对照自己的项目。
- **准备 AI 岗位面试**：结合“面试准备”栏目阅读；相关主题的正文下方也有“面试会怎么问”和回答思路。
- **希望动手做**：按“逐章学习”栏目推进课程与 Coding Agent 练习。

网站按栏目 → 章节 → 文章组织，支持全文搜索、文章目录、窄屏阅读、主题切换和“我学完了”标记。内容由 `docs/` 下的 Markdown 与 [索引](docs/index.json) 驱动；读者可以直接在本站系统学习。

## 学习进度放在哪里？

| 使用方式 | 进度保存位置 | 跨设备同步 | 适合 |
| --- | --- | --- | --- |
| [GitHub Pages 公共站](https://qiansc.github.io/ai-agent-engineering-guide/) | 当前浏览器的 `localStorage` | 不会自动同步 | 无需登录的个人阅读 |
| 自己部署的 Fly.io 服务 | 浏览器本地缓存 + 服务端 SQLite 持久卷 | 同一实例共享 | 自己跨设备阅读或小团队共学 |

清除站点数据、换浏览器或换设备后，GitHub Pages 的完成记录不会跟过去。Fly.io 模式会把进度同步到服务端，但**它不是带账号隔离的多用户系统**：拿到同一部署地址的人看到并修改的是同一份进度。私人使用时请控制访问范围，不要把公开地址当作私有进度空间。Fly.io 资源也可能产生费用。

## 本地运行与部署

本地预览服务端版本（需要 Python 3.10+）：

```sh
python3 -m pip install -r requirements.txt
python3 check.py
python3 server.py
```

打开 <http://127.0.0.1:4173/>。本地服务默认也使用共享模式，进度数据库位于不纳入 Git 的 `data/progress.sqlite3`；可通过 `PROGRESS_DB_PATH` 修改。

生成与 GitHub Pages 相同的静态版本：

```sh
python3 build_static.py
```

产物在 `_site/`。[Pages 工作流](.github/workflows/pages.yml) 会在 `main` 更新后执行内容检查、构建和发布。静态版没有服务端进度接口，学习标记只存在浏览器本地。

想跨设备共用一份进度，可按仓库内的 [Fly.io 快速部署技能](.agents/skills/deploy-fly/SKILL.md#给读者的快速部署命令) 创建自己的实例：更换 `fly.toml` 的应用名、创建同区域持久卷、部署并验证。**不要把账号、令牌或密钥提交进仓库。**

## 一起完善

**欢迎 Issue 和 Pull Request。** 你可以修正技术错误、补充可复现的代码示例、改善讲解与阅读体验，或完善有出处的面试题。请先读 [贡献指南](CONTRIBUTING.md) 和 [文章写作约定](docs/README.md)；较大的结构调整建议先开 Issue 讨论。仓库提供了 [问题模板](.github/ISSUE_TEMPLATE) 与 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md)。

文章文末的外部链接用于注明资料来源与继续学习的入口。本站公开访问不改变第三方材料的版权或再分发许可；提交内容时请尊重原作者，避免直接搬运未获授权的长篇正文。
