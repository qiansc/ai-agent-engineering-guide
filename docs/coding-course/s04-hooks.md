# 把扩展点挂在循环上：Hooks 的执行时机与返回值

上一章的 `check_permission()` 直接写进 Agent Loop。如果还要记日志、提醒大输出、在结束前检查状态，每加一件事都改循环。Hooks 用一张“事件名 → 回调列表”的注册表，把这些扩展分配到固定时机。模型调用和工具结果的基本循环仍在，具体检查由回调负责。

## 四个事件覆盖一次行动

| 事件 | 触发位置 | 本章实际回调 |
| --- | --- | --- |
| `UserPromptSubmit` | 用户输入后、模型调用前 | 输出当前工作目录日志 |
| `PreToolUse` | 每个工具调用执行前 | 权限检查、调用日志 |
| `PostToolUse` | 工具执行后 | 大输出提醒 |
| `Stop` | 模型本轮没有工具调用时 | 打印工具调用次数 |

注册与触发代码可以保持很小：

```python
HOOKS = {"UserPromptSubmit": [], "PreToolUse": [],
         "PostToolUse": [], "Stop": []}

def register_hook(event, callback):
    HOOKS[event].append(callback)

def trigger_hooks(event, *args):
    for callback in HOOKS[event]:
        result = callback(*args)
        if result is not None:
            return result
    return None
```

同一事件按注册顺序执行。某回调返回非 `None`，后面的回调便不会运行。这意味着顺序是可观察的：本章先注册权限回调，再注册日志回调；被权限回调拒绝的工具不会经过后面的日志回调。若生产审计必须记录所有拒绝请求，就要调整设计或把审计放到更早的位置，不能只依赖这个示例。

## 权限如何从循环里移出

`permission_hook(block)` 承接 s03 的主要检查：bash 硬拒绝与危险命令确认，文件工具的工作区外路径确认。它允许操作时返回 `None`，拒绝时返回解释性字符串。循环只认识 `PreToolUse` 的返回值：

```python
blocked = trigger_hooks("PreToolUse", block)
if blocked:
    results.append({
        "type": "tool_result", "tool_use_id": block.id,
        "content": str(blocked),
    })
    continue
output = TOOL_HANDLERS[block.name](**block.input)
trigger_hooks("PostToolUse", block, output)
```

即便工具被拦截，也要关闭该 `tool_use` 与 `tool_result` 的配对。`PostToolUse` 只在实际调用 handler 后触发，收到工具请求与其输出；本章的回调只是输出超过 100,000 字符时在终端提示，它不裁剪结果。工具结果如何压缩要到 s08 才处理。

## Stop hook 可以让循环继续

模型没有请求工具时，循环触发 `Stop`。本章的 `summary_hook(messages)` 统计历史中的工具结果并打印数字，然后返回 `None`，所以循环正常退出。若 Stop hook 返回一段非空文本，循环会把它作为新的 user 消息追加，再次调用模型。这是一个可扩展的完成检查位置，但本章没有实现“测试必须通过”等验收规则，也没有限制 Stop hook 强制续跑的次数。自行添加时要设预算，否则有可能无限继续。

`UserPromptSubmit` 的 `context_inject_hook` 名称容易让人误会：实现代码只打印 `WORKDIR`，返回 `None`，**没有把工作目录写进用户消息或 system prompt**。终端看到日志，不等于模型收到了新上下文。需要真正注入时，应设计回调返回值的处理方式，并验证最终传给模型的消息。

## 返回值在不同事件里意味着什么

`trigger_hooks()` 遇到第一个**非 `None`** 的返回值就停止执行后续回调；但不同调用位置处理这个值的方式不同。`PreToolUse` 用 `if blocked:` 判断是否拒绝，所以非空字符串会拦截，空字符串虽然终止了回调链却不拦截。`Stop` 也用真值判断是否追加消息并续跑。`UserPromptSubmit` 与 `PostToolUse` 当前只调用函数、忽略返回值，因此即使某回调返回字符串，也不会自动修改用户输入或工具输出。

这几个细节值得在真正设计 hook API 时先确定：究竟返回 `allow/deny` 结构，还是返回可替换内容？异常是拒绝还是继续？多个回调怎样组合？本章为了演示使用简单返回值，扩展成多人维护的平台时最好使用明确的结果类型，不要让空字符串、`False`、`None` 含义重叠。

## 按一次具体执行回放

以“读取 `README.md`”为例，CLI 先调用 `UserPromptSubmit`，打印工作目录，然后把原始用户输入追加到 `history`。模型返回 `read_file` 的 `tool_use`，循环先跑 `PreToolUse`：权限回调检查路径，允许时返回 `None`；日志回调打印工具名和参数预览，也返回 `None`。handler 读取文件，`PostToolUse` 检查输出长度，最终 `tool_result` 加入消息。模型看到内容后不再调工具，Stop hook 统计工具结果，循环退出并打印最终文本。

换成越界写文件，权限回调会要求确认。若用户拒绝，它返回说明，`trigger_hooks()` 立刻停止，日志回调和 handler 都不运行，循环追加拒绝结果。换成工具本身抛出未捕获异常，当前通用 loop 并没有完整异常隔离；不要假设 `PostToolUse` 和 `tool_result` 一定会完成。生产实现应捕获 handler 异常、转为结构化失败结果，并确保有审计事件。

## Hooks 与业务流程的界限

Hooks 适合每次工具调用都应执行的横切逻辑，如授权、日志、输出检查；不适合藏一条复杂业务流程。假如产品要求“支付完成才发邮件，邮件失败要补偿”，应把步骤与状态建成显式 workflow，而不是分别藏在两个 `PostToolUse` 回调里。回调注册顺序、提前返回和异常处理都会影响副作用，若流程隐藏在 hooks 中，恢复和测试会很困难。

本章示例中的 `large_output_hook` 只告警不裁剪；`summary_hook` 只计数不判断目标；`context_inject_hook` 只打印不注入。把这些“事件插口”与“完整功能”区别开，后面学习压缩、完成判断时就不会误以为 hooks 已经替我们做了所有事。

## 动手验证事件顺序

运行 `python s04_hooks/code.py`，依次请求读取 `README.md`、创建临时文件、执行一个应触发审批的删除命令。对照终端输出：用户输入时打印 `UserPromptSubmit`；允许的工具执行前打印调用日志；拒绝的工具产生拒绝结果；没有工具请求后触发 Stop 统计。然后加一个仅打印消息的 `PostToolUse` 回调，确认它只在工具实际执行后运行；把它放到原回调前后，观察顺序。

再用假 handler 返回超长文本，观察本章的提醒不会改变传给模型的完整结果。这样能明确 Hooks 和 Context Compact 的职责边界。

## 面试会怎么问

面经里对“工具执行前后怎么做安全、记录和恢复”的追问，可以用事件顺序回答：模型提出调用后先参数校验与 `PreToolUse` 授权，允许后才执行，结果交给 `PostToolUse` 处理并成对回填；Stop 阶段检查任务是否真的满足验收。若问“一个 hook 出错怎么办”，不要说所有 hook 天然可靠；要定义失败策略，高风险权限回调失败应拒绝执行，非关键提示回调失败可记录后继续，并保证工具结果配对和 trace 不丢。

## 来源与延伸阅读

- [Learn Claude Code 新版 s04 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s04_hooks)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)：Harness 的工具边界、恢复追问。
