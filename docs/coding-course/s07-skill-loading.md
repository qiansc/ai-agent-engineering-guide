# 让 Agent 按需读说明书：Skill 目录与正文加载

一个项目可能同时有代码审查、PDF 处理、API 设计等规范。把每份文档全文塞进 system prompt，当前任务无论用不用，都要反复发送这些文字。Skill Loading 换一种安排：启动时只让模型看到可用技能的名称与简介，真正用到某项时再读取它的完整 `SKILL.md`。

## 两层信息，各在合适时机进入上下文

`SkillLoader` 扫描工作目录下的 `skills/*/SKILL.md`。每份文件可以用 YAML frontmatter 写 `name` 和 `description`，正文写具体操作步骤：

```markdown
---
name: code-review
description: Review a change for correctness and regressions.
---

# Code review

先读改动及相邻调用，再检查错误路径与测试……
```

启动时 `catalog()` 只生成诸如 `- code-review: Review ...` 的目录，`build_system_prompt()` 把它放进 system prompt，并提示模型在适用时调用 `load_skill`。模型请求 `load_skill(name)`，handler 才返回完整文件，作为本轮 `tool_result` 进入消息列表。这个机制与读普通文件相似，但目录提前告诉模型“有哪些专用说明可选”。

| 阶段 | 进入模型的内容 | 成本与作用 |
| --- | --- | --- |
| 启动 | 所有 Skill 的名称和简介 | 让模型知道可用能力；目录仍有长度 |
| 调用 `load_skill` | 被选中 Skill 的完整 Markdown | 只在当前任务需要时占用上下文 |

## 扫描、解析与按名字加载

实现代码先把扫描根目录 `SKILLS_DIR = WORKDIR / "skills"` 固定下来，只读取该目录下一层的 `SKILL.md`。读文件前确认 `manifest` 是普通文件，并检查解析后的路径仍在技能根目录内，避免常见的越界链接。`parse_frontmatter()` 使用 `yaml.safe_load`，若没有合法元数据，名称退回目录名，描述退回正文首行。

扫描结果放进 `self.skills[name]`，其中保留 `name`、`description` 和完整 `content`。加载时只查这个注册表：

```python
def load(self, name: str) -> str:
    skill = self.skills.get(name)
    if skill:
        return skill["content"]
    available = ", ".join(self.skills) or "none"
    return f"Error: Unknown skill '{name}'. Available: {available}"
```

`name` 不直接拼接成文件路径，所以模型无法通过 `load_skill("../../secret")` 任意读取磁盘。也要注意扫描发生在初始化时：运行中新增或修改 Skill，不会自动更新 `self.skills` 与已经组装的 system prompt，除非显式重新扫描、重建提示或重启程序。

### 解析失败与命名冲突

frontmatter 若没有用 `---` 正确包住，或 YAML 解析失败，解析器会把内容当普通正文处理。名称可退回目录名，描述可退回正文首行。这保证目录至少能显示一个入口，但首行如果是很长的标题或不准确的说明，模型可能选错。写 Skill 时应把 `description` 当成路由提示来设计：说明何时使用、适用对象和必要条件，而非一句泛泛的“帮助完成任务”。

注册表以名称为 key。若两个目录的 frontmatter 都声明相同 `name`，后扫描的会覆盖先扫描的条目；当前教学代码没有重复名称错误提示。给团队使用时应做唯一性检查、来源标识和版本管理，否则“模型加载了 code-review”却不清楚是哪一版。扫描还有长度限制问题：即使每个目录项很短，成百上千项也会让 system prompt 膨胀，实际产品可先按项目、权限或任务阶段筛选候选集。

### 内容何时影响模型

目录在 `SYSTEM = build_system_prompt()` 时生成，完整 Skill 要等 `load_skill` 结果进入 `messages` 后才被模型看到。因此同一轮模型刚决定调用 `load_skill` 时，它尚未读到正文，不能指望它同时准确执行正文中的后续步骤。宿主先返回内容，下一轮模型再根据说明选择读文件、写文件或运行测试。如果该 Skill 后来改变了，旧对话中已经返回的内容仍保留原版本；长期任务应记录具体版本，避免恢复时混用新旧指令。

## Skill 是说明，不是权限

模型读到 `SKILL.md` 后，仍用已有工具行动；Skill 本身不会扩展文件、网络或 shell 权限。本章保留前面的权限 hook。把“不允许访问目录外文件”只写在 Skill 里，不能替代宿主的校验。外部提供的 Skill 还可能带有错误或恶意指令，实际系统需要来源管理与人工审查。本教学实现关注按需加载与路径边界，没有实现安装审核和版本治理。

## 动手观察一次按需加载

在原仓库运行 `python s07_skill_loading/code.py`。先问 “What skills are available?”，看它是否能根据目录回答；再问 “Load the code-review skill and follow its instructions”，观察 `load_skill` 的工具调用与完整内容如何进入消息；最后让它审查 `README.md` 并要求先挑合适的 Skill。若目录中没有对应文件，模型会收到可用名称列表，不应伪称已加载。

你还可以在隔离练习目录下写一个最小 `skills/format-check/SKILL.md`，重启程序后确认目录出现新项；修改文件但不重启，观察旧注册内容仍被使用。这个实验能帮助你区分“磁盘上有文件”与“当前会话的工具目录已经更新”。

## 面试会怎么问

Coding Agent 相关面经会问 Skill 误调用、上下文膨胀或“几十份规范怎么加载”。回答可按两层设计展开：先用简短目录让模型选择，再通过受控 `load_skill(name)` 读取全文；选择前可按任务、权限和版本过滤候选，加载后仍由宿主校验实际工具动作。若误调用，检查名称/简介歧义、选择时的任务信号和工具调用记录，而不是把所有全文再塞回 prompt。还要指出 Skill 是知识输入，不是授权令牌。

## 来源与延伸阅读

- [Learn Claude Code 新版 s07 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s07_skill_loading)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/f1ed02bfdae04730837753b62e0d58b9)：Harness 与上下文管理相关追问。
