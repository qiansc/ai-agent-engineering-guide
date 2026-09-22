# 给 Agent 添工具：定义、处理函数与分发

第一章的模型只有 `bash`。读文件要拼 `cat`，修改一行要拼 shell 命令。模型真正想表达的是“读取某个文件”或“把这段内容写进去”，专用工具能把意图变成清楚的参数，也方便宿主逐类校验。本章把一个工具扩成五个，Agent Loop 的消息往返仍沿用上一章。

## 工具分两边注册

模型只看到 `TOOLS`：每项包含工具名、描述和 `input_schema`。宿主同时维护 `TOOL_HANDLERS`，将相同名称映射到 Python 函数。两边要配套；仅声明 schema 而不注册 handler，模型虽然能请求该工具，宿主却无法执行。

| 工具 | 参数 | 执行行为 |
| --- | --- | --- |
| `bash` | `command` | 在工作目录执行命令，保留 120 秒超时与输出截断 |
| `read_file` | `path`、可选 `limit` | 读取 UTF-8 文本；超出行数时给出剩余行数 |
| `write_file` | `path`、`content` | 创建父目录后写入，已有文件会被覆盖 |
| `edit_file` | `path`、`old_text`、`new_text` | 精确匹配并只替换第一次出现的位置 |
| `glob` | `pattern` | 匹配文件路径，排序去重，最多显示 200 条 |

执行阶段从硬编码的 `run_bash(...)` 变为查表：

```python
handler = TOOL_HANDLERS.get(block.name)
output = handler(**block.input) if handler else f"Unknown: {block.name}"
results.append({
    "type": "tool_result", "tool_use_id": block.id,
    "content": output,
})
```

`**block.input` 把 schema 中的字段按关键字参数传入处理函数。例如 `{"path": "README.md", "limit": 20}` 对应 `run_read(path="README.md", limit=20)`。新增工具时要同时考虑 schema 与 Python 签名，并测试参数缺失、类型错误和未知工具名。本示例对未知名称返回字符串，对 handler 内部部分错误也返回 `Error: ...`，但不是完整的统一错误协议。

## 文件路径怎样限定在工作目录

文件读写工具调用 `safe_path()`：

```python
def safe_path(p: str) -> Path:
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")
    return path
```

`resolve()` 后再比较，能挡住 `../` 和指向目录外的常见符号链接。`run_glob()` 对匹配结果也做类似检查。注意这只保护本章的文件工具：`bash` 可以执行其他 shell 操作，路径校验不能替代进程沙箱。写入工具会创建父目录，并用 `write_text()` 覆盖目标；如果你需要防止并发覆盖，应再引入版本检查或补丁工具。

## 多个工具调用的处理顺序

模型可以在一次响应里要求读取 `a.py`、读取 `b.py` 并列出目录。实现代码按 `response.content` 原顺序逐个调用 handler，**没有并行执行**。每个结果使用各自的 `tool_use_id`，全部收齐后才让模型进入下一轮。若第二个工具失败，第一个工具产生的副作用不会自动回滚；这也是设计写工具时必须考虑幂等与顺序的原因。

可以把一轮工具调用看成一份有序清单，而非一句“模型调用了工具”。第一项写文件、第二项读同一文件时，顺序执行能让读取看到刚才写入的内容；若擅自并行，两项可能竞态。另一方面，两个互不相关的只读调用顺序执行会增加等待时间。生产化时可按工具的读写属性和资源目标决定哪些能并行，不能只根据“同一响应返回了多个调用”就推断它们独立。

## 把每个 handler 的行为看清楚

`run_read()` 以 UTF-8 解码，按行拆分。若给 `limit` 且小于总行数，就只返回前面的行，并附 `... (N more lines)`。`limit=0` 在当前代码里按假值处理，等同不限制；这和很多 API 的“读 0 行”直觉不同。设计对外工具时应把这种边界写入 schema 或显式校验。

`run_write()` 会调用 `mkdir(parents=True, exist_ok=True)` 创建父目录，再 `write_text()`。返回的 `Wrote N bytes` 中 `N` 实际来自 `len(content)`，计数的是 Python 字符数；包含中文时它不一定等于 UTF-8 字节数。若需要精确报告写入字节，应按编码后的长度计算。更重要的是覆盖写：原内容不会自动备份，执行前应确认目标存在与否、是否允许覆盖。

`run_edit()` 检查 `old_text in text`，不存在就返回错误；存在时 `text.replace(old_text, new_text, 1)` 只改第一个匹配。它没有判断旧文本是否在文件中出现多次，因此“只替换一次”不等于“唯一定位”。给模型修改代码时，最好先返回匹配次数或使用带上下文的补丁，防止改到同名的错误位置。

`run_glob()` 用 `glob(..., root_dir=WORKDIR, recursive=True)`，对结果排序去重并过滤越界目标。最多展示 200 个匹配；若超过上限，最后追加提示，让模型收窄模式。返回路径列表适合发现文件，但不会读取内容；搜代码内容还需另一个工具或让模型选择受控的命令。

这些实现都说明工具 schema 只是“模型怎么表达意图”，handler 才定义真实语义。面试或代码审查时，应能说清写文件是否覆盖、编辑是否唯一匹配、错误如何返回，而不只是会列工具名称。

## 动手练习

在隔离目录中运行 `python s02_tool_use/code.py`。先让它读取 `README.md` 并概述，再创建 `test.py`、读回文件，最后要求查找所有 Python 文件。看终端打印的 `> read_file`、`> write_file` 等名称，对照工具结果与文件实际内容。再试一个不存在的路径、一个目录外路径，以及把 `old_text` 设为文件中没有的字符串；观察模型能否根据明确错误继续调整。

可以继续添加一个只读 `file_stat`：在 `TOOLS` 中写 `path` schema，在 `TOOL_HANDLERS` 中注册函数，返回文件大小与修改时间。先测试目录外路径是否被挡，再让模型用它回答问题。这个练习检验“加工具不改 loop”的扩展点是否真的成立。

## 面试会怎么问

近期面经常问工具选择、工具兜底和超时。若被问“Agent 偶尔调错工具怎么办”，先区分**选错名称、参数不合法、权限不足、工具执行失败、结果被误读**。本章的方案是把工具描述和 schema 写得互不歧义，宿主再做确定性校验；失败以与调用 ID 对应的结果回传，不能假装成功。若被问“多个工具能否并发”，要指出这个教学实现是顺序执行；并发必须额外处理依赖、同文件写冲突、结果配对与取消，不是把 `for` 改成 `gather` 就结束。

## 来源与延伸阅读

- [Learn Claude Code 新版 s02 说明与实现代码](https://github.com/shareAI-lab/learn-claude-code/tree/main/s02_tool_use)，MIT License，© 2024 shareAI Lab。
- [2026 年社区面经索引](https://www.nowcoder.com/feed/main/detail/bb8c28105f364770b57ff5eb5649cc60)：工具兜底、恢复与 trace 的相关追问。
