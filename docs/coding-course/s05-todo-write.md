# 让长任务不跑偏：TodoWrite 的状态与提醒

“重构所有 Python 文件、跑测试、修失败”这样的任务很容易在细节里失去主线。模型修了几个文件后遇到测试失败，可能一直围着失败转，忘记还有别的文件。TodoWrite 把步骤显式放到一张持续更新的清单里。它不替 Agent 执行工作，只让下一步和剩余工作可见。

## 一张有约束的任务清单

本章新增 `todo_write` 工具，输入 `todos` 是对象数组，每项包含文字 `content` 和状态 `status`。状态只有三种：`pending`、`in_progress`、`completed`。`TodoManager.update()` 先完整验证，再替换内存中的 `items`：最多 20 条、每项内容非空、状态合法、同一时刻最多一项 `in_progress`。如果输入是字符串，会先尝试 JSON，再尝试 `ast.literal_eval`；没有使用会执行任意 Python 表达式的 `eval`。

渲染后的清单用 `[ ]`、`[>]`、`[x]` 标记状态，并附完成数。例如：

```text
[x] 定位命名不一致的文件
[>] 修改受影响函数
[ ] 运行测试并修复回归

(1/3 completed)
```

`TOOL_HANDLERS["todo_write"] = run_todo_write` 将它接入 s02 的分发机制；函数会打印并返回更新后的清单，所以人和模型看到的是同一份状态。清单在内存中，程序退出后不会自动保存，这一点与 s10 的持久任务系统不同。

### 验证通过才替换旧状态

`update()` 先把所有候选项放进临时 `validated` 列表，统计 `in_progress_count`，最后才执行 `self.items = validated`。中途任何一项非法，旧计划仍保持原样。以下输入会被拒绝：`todos` 不是列表、超过 20 项、某项不是对象、`content` 为空、状态不在三种枚举中，或同时有两项 `in_progress`。

`status` 缺省时变成 `pending`，`content` 会转成字符串并去掉首尾空白。模型发来错误输入时，`run_todo_write()` 捕获 `ValueError` 并返回错误文本，而不是让整个 CLI 退出。模型因此有机会修正清单。正式服务还应在参数进入 handler 前按 schema 校验，让不同层对同一错误给出一致解释。

### 全量更新而不是单项打勾

`todo_write` 每次接收整个 `todos` 数组，用它替换旧列表。模型要把第一项标为完成，仍需提交包含其他待办项的新完整列表。好处是当前计划容易整体查看和重排；风险是一次漏传会把某项从内存清单中抹掉。宿主若需要审计每次变化，应保留版本和变更记录，不能只保留最新数组。任务有多个负责人或依赖时，也不该强行用单个 `in_progress` 规则，后面的任务图更合适。

## Reminder 什么时候出现

循环维护 `rounds_since_todo`。一次工具调用轮次里只要用过 `todo_write`，计数归零；连续三轮工具调用都没用过，程序在第三轮的工具结果消息中追加：

```python
{"type": "text", "text": "<reminder>Update your todos.</reminder>"}
```

随后计数也归零。Reminder 是提示模型回看计划，不是替它自动改变任务状态。为什么放在工具结果后？因为此时模型即将阅读新执行结果，提醒能与实际进展一起进入下一轮。若模型仍不更新清单，宿主不能因此认定任务已完成。

## 从计划到验证的使用顺序

拿“给 `hello.py` 增加类型标注、docstring 与 main guard”做练习：先让模型列出定位文件、修改、运行或检查三个步骤；开始修改时把对应项标为 `in_progress`；完成一项后标为 `completed`。运行 `python s05_todo_write/code.py`，留意第一次工具调用是否是 `todo_write`，以及后续状态是否随文件变化。也可以尝试创建包、审查 `example/` 下 Python 文件的练习，都可用同样的方法观察。

再故意让它提交两个 `in_progress`，看 `TodoManager` 返回错误且旧清单仍保留；提交 21 项也应被拒绝。你可以检查实现代码中的 `self.items = validated` 发生在所有校验之后，这就是“失败不污染原状态”的关键。最后让模型做三轮不写 TODO 的工具调用，确认提醒出现一次而非每轮刷屏。

## 清单解决什么，没解决什么

清单适合单会话内的有序工作和进度提示；它没有任务 ID、依赖图、负责人、跨会话恢复，也无法证明实际文件或测试已经达到状态。若模型把某项标成 `completed`，宿主仍应核查产物。`todo_write` 只是模型可维护的工作记事本，不能把自述状态当作最终验收。需要长期任务和协作时，再进入后面的 Task System。

可以把任务状态与证据连起来练习：`completed` 的“运行测试”项应同时有命令、退出码和关键输出；“改完函数”应能指出文件路径及 diff。这样一来，清单仍由模型维护，但人和宿主能检查它有没有把失败说成完成。Reminder 只是促使模型更新状态，不会自动发现这种不一致。

## 面试会怎么问

面经会问 ReAct 与 Planner/Executor/Critic 的区别，或者 Agent 长任务偏离目标怎么办。可用本章举一个小而具体的实现：模型先分解任务，宿主保留结构化 TODO，执行中要求一次只标一个 `in_progress`，定期把未完成项重新展示；结束时仍用测试和用户验收验证，而不是只看 TODO 全部打勾。若追问“计划变了怎么办”，说明清单允许整体更新，但应保留原用户目标、变更原因及已完成证据；跨会话任务则要落到持久状态，而非只存消息文本。

## 来源与延伸阅读

- [Learn Claude Code 新版 s05 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s05_todo_write)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/f1ed02bfdae04730837753b62e0d58b9)：ReAct 与 Planner/Executor/Critic、Harness 设计追问。
