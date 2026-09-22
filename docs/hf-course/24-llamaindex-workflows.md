# LlamaIndex Workflow：事件、循环、共享状态与多 Agent

LlamaIndex Workflow 把程序写成由事件驱动的步骤：一个步骤接收某类 Event，完成后返回另一类 Event，触发下一个步骤。它适合既要固定控制点，又要在局部调用模型或工具的任务。课程从「Hello, world」开始，逐步加入自定义事件、循环、上下文状态，最后用 `AgentWorkflow` 让两个 Agent 交接。

## 最小工作流：StartEvent 到 StopEvent

```python
from llama_index.core.workflow import StartEvent, StopEvent, Workflow, step

class MyWorkflow(Workflow):
    @step
    async def my_step(self, ev: StartEvent) -> StopEvent:
        return StopEvent(result="Hello, world!")

workflow = MyWorkflow(timeout=10, verbose=False)
result = await workflow.run()
```

`StartEvent` 表示运行入口，`StopEvent` 包含最终结果。`@step` 让框架识别方法及其事件输入/输出；类型注解不仅帮助阅读，也参与工作流连接。`timeout=10` 限定这个教学例子的等待时长，实际任务需按外部服务延迟设定。示例还给出 `pip install llama-index-utils-workflow` 用于后面的绘图工具；基础 `Workflow` 来自 `llama_index.core.workflow`。

## 自定义 Event 把结果传给下一步

```python
from llama_index.core.workflow import Event

class ProcessingEvent(Event):
    intermediate_result: str

class MultiStepWorkflow(Workflow):
    @step
    async def step_one(self, ev: StartEvent) -> ProcessingEvent:
        return ProcessingEvent(intermediate_result="Step 1 complete")

    @step
    async def step_two(self, ev: ProcessingEvent) -> StopEvent:
        return StopEvent(result=f"Finished: {ev.intermediate_result}")
```

第二步只在收到 `ProcessingEvent` 后运行；事件携带需要传递的字段。与把所有信息塞进一个全局字典相比，事件类型让依赖更清楚。若步骤需要共享但不属于某次事件的数据，可以使用后面介绍的 `Context`。

## 用事件表示分支和重试

课程让 `step_one` 接收 `StartEvent | LoopEvent`，返回 `ProcessingEvent | LoopEvent`：有时进入第二步，有时发出 `LoopEvent` 回到自己。原例用随机数模拟成功或失败：

```python
import random

class LoopEvent(Event):
    loop_output: str

class RetryWorkflow(Workflow):
    @step
    async def step_one(
        self, ev: StartEvent | LoopEvent
    ) -> ProcessingEvent | LoopEvent:
        if random.randint(0, 1) == 0:
            return LoopEvent(loop_output="Back to step one")
        return ProcessingEvent(intermediate_result="First step complete")

    @step
    async def step_two(self, ev: ProcessingEvent) -> StopEvent:
        return StopEvent(result=ev.intermediate_result)
```

这段代码存在随机循环一直不结束的可能；课程用它展示事件类型可组成循环，不是可直接上线的重试策略。真实流程要记录尝试次数、区分可重试错误与永久失败，并有超时或人工接管的终点。工作流可用 `draw_all_possible_flows(workflow, "flow.html")` 输出一张 HTML 图，显示可能的事件路径；画图不等于运行时自动保证一定终止。

## Context 保存跨步骤状态

课程在步骤参数中加入 `ctx: Context`，通过 `ctx.store.set` 和 `ctx.store.get` 读写共享状态：

```python
from llama_index.core.workflow import Context

@step
async def query(self, ctx: Context, ev: StartEvent) -> StopEvent:
    await ctx.store.set("query", "What is the capital of France?")
    query_text = await ctx.store.get("query")
    return StopEvent(result=query_text)
```

示例这段是片段，其中 `result` 未定义；上面让它返回 `query_text`，使示例闭合。事件适合传递当前步骤产物，Context 适合共享运行中的状态。两者都要考虑并发与会话隔离：同名状态键在不同用户任务之间不能串用，任务恢复时也要明确哪些状态持久化。

## AgentWorkflow 让专业 Agent 交接

`AgentWorkflow` 建立在工作流机制之上，但不用自己写每一个事件步骤。课程定义 `multiply_agent` 和 `add_agent`，分别只拥有乘法与加法工具，再指定一个根 Agent。根 Agent 先接收用户消息，之后可把任务交给另一个 Agent：

```python
from llama_index.core.agent.workflow import AgentWorkflow, ReActAgent

def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

def multiply(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b

multiply_agent = ReActAgent(
    name="multiply_agent",
    description="Multiply two integers",
    tools=[multiply],
    llm=llm,
)
addition_agent = ReActAgent(
    name="add_agent",
    description="Add two integers",
    tools=[add],
    llm=llm,
)
workflow = AgentWorkflow(
    agents=[multiply_agent, addition_agent],
    root_agent="multiply_agent",
)
response = await workflow.run(user_msg="Can you add 5 and 3?")
```

这是故意把加法任务先交给乘法 Agent，以观察能否正确转交。若 Agent 描述模糊、没有交接能力或模型选错，就可能无法完成。真实系统应测试任务归属、交接次数和失败后谁负责告知用户。

## 工具修改共享状态

课程进一步让异步工具接收 `ctx: Context`，从 `ctx.store.get("state")` 取得字典，每次调用把 `num_fn_calls` 加 1，再写回。`AgentWorkflow` 用 `initial_state={"num_fn_calls": 0}` 初始化，`state_prompt` 将状态放进 Agent 可见消息；运行完后再读取该计数。

```python
async def counted_add(ctx: Context, a: int, b: int) -> int:
    """Add two numbers and count this tool call."""
    current = await ctx.store.get("state")
    current["num_fn_calls"] += 1
    await ctx.store.set("state", current)
    return a + b

workflow = AgentWorkflow(
    agents=[multiply_agent, addition_agent],
    root_agent="multiply_agent",
    initial_state={"num_fn_calls": 0},
    state_prompt="Current state: {state}. User message: {msg}",
)
ctx = Context(workflow)
await workflow.run(user_msg="Can you add 5 and 3?", ctx=ctx)
print((await ctx.store.get("state"))["num_fn_calls"])
```

这段展示状态接口；要让计数真的增加，必须把 `counted_add` 注册给相应 Agent，而不是原来的 `add`。示例省略了重新创建 Agent 的几行，并在 `root_agent` 后漏了逗号；照抄会得到语法或行为错误。并发多工具调用时，简单的读—改—写可能出现计数丢失，还需按框架与存储实现处理原子性。

## 练习：让随机循环可终止

给 `LoopEvent` 增加 `attempt`，最多重试三次。三次都失败时返回带错误信息的 `StopEvent`；成功则进入 `ProcessingEvent`。写测试分别覆盖第一次成功、第二次成功和三次失败。这个练习能把「事件能形成环」变成「环有可解释的停止条件」。

## 面试会怎么问

**问题：Agent 长流程的状态与重试如何设计？** 可以用本课回答：Event 传递一步的结果，Context 保存任务共享状态；每次动作有状态和尝试次数；可重试错误沿明确边返回，永久错误走终止或人工分支。对有副作用的工具，恢复前先核对外部是否已完成，不能简单从 `StartEvent` 重新跑全流程。

## 来源与延伸阅读

- [Hugging Face Agents Course · LlamaIndex Workflows](https://huggingface.co/learn/agents-course/zh-CN/unit2/llama-index/workflows)
- [Workflows 配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/llama-index/workflows.ipynb)
- [美团 AI Agent 一面面经](https://www.nowcoder.com/feed/main/detail/50bcdc47e7754aa7be59b6318fea514b)
- [影石创新 AI Agent 一面面经](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)
