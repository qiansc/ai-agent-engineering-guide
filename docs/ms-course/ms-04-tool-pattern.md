# 工具调用的完整一轮：从模型建议到程序执行

工具让 Agent 可以拿到实时信息，也可以改变外部系统。模型本身不执行 Python 函数：它看到工具的名称、描述与参数 Schema 后，返回“请调用这个工具，并传这些参数”。应用验证请求、运行函数、把结果送回模型，模型才有材料继续回答。理解这个往返，是读懂任何 Agent 框架的第一步。

## 哪些任务需要工具

工具调用常见于五类任务：查询动态信息（天气、股票、数据库），运行代码做计算或生成报告，串联日程/邮件/数据流水线等工作流，连接 CRM 与工单等客服系统，以及借助语法检查、摘要、安全评估等服务处理内容。它们的共同点是模型单靠训练时记忆不能可靠完成。一个实时价格必须去数据源查询；一个订单取消必须得到订单服务的执行结果。

先判断工具是只读还是有副作用。查天气、查库存通常只读；发送邮件、付款、删除记录会改变状态。模型选择的依据是工具描述和上下文，但宿主程序必须再做权限、参数和风险检查。若用户只问“退款政策是什么”，不应因为系统有 `submit_refund` 就去提交退款。

## 一次函数调用包含六个部件

1. **模型能力**：所选模型支持工具/函数调用。
2. **工具定义**：名称、用途、参数类型、必填字段和返回约定。
3. **执行器**：真正调用 API、查询数据库或运行代码的应用逻辑。
4. **消息处理**：把模型给出的调用与对应工具结果放回同一轮上下文。
5. **验证与错误处理**：拒绝非法参数、越权动作，并返回模型可理解的错误。
6. **状态**：记录已经尝试什么、哪些调用完成、下一步是否可以继续。

以查询旧金山时间为例，模型先看到 `get_current_time(location)`。用户问“旧金山现在几点”，模型可能返回 `{"location":"San Francisco"}`；此时它尚未得到时间。程序在本地用城市—时区映射与 `datetime.now(ZoneInfo(...))` 算出时间，再把 JSON 结果附到对应 `call_id`，最后向模型请求自然语言回复。`call_id` 很重要：一次模型回复可提出多个工具调用，结果必须对应原请求。

直接调用 Azure OpenAI 的初始化是另一条代码路径，不要把它和 `FoundryChatClient` 混用。若所用 Notebook 采用 API key，可在加载 `.env` 之后按它的版本初始化：

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url=f"{os.environ['AZURE_OPENAI_ENDPOINT'].rstrip('/')}/openai/v1/",
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
)
deployment_name = os.environ["AZURE_OPENAI_DEPLOYMENT"]
```

也可以走 Entra ID / `az login` 无密钥认证路径；若选这条路径，认证初始化需按对应 Notebook 或当前 SDK 文档配置，不能在上例里简单删掉 `api_key` 就期待自动登录。部署名称是项目中真实的部署名，不一定等于模型族名。

下面用 Responses API 展示一次完整往返，保留完整往返。它用时区库计算，不会把模型猜测当成当前时间：

```python
import json
from datetime import datetime
from zoneinfo import ZoneInfo

tools = [{
    "type": "function",
    "name": "get_current_time",
    "description": "Return the current local time for a supported city",
    "parameters": {
        "type": "object",
        "properties": {"location": {"type": "string"}},
        "required": ["location"],
        "additionalProperties": False,
    },
}]

def get_current_time(location: str) -> str:
    zones = {"san francisco": "America/Los_Angeles"}
    zone = zones.get(location.casefold())
    if zone is None:
        return json.dumps({"error": "UNSUPPORTED_CITY", "location": location})
    return json.dumps({
        "location": location,
        "current_time": datetime.now(ZoneInfo(zone)).isoformat(),
    })

messages = [{"role": "user", "content": "What's the current time in San Francisco?"}]
response = client.responses.create(
    model=deployment_name, input=messages, tools=tools,
    tool_choice="auto", store=False,
)
messages += response.output
for item in response.output:
    if item.type != "function_call":
        continue
    if item.name != "get_current_time":
        raise ValueError(f"Unexpected tool: {item.name}")
    args = json.loads(item.arguments)
    result = get_current_time(args["location"])
    messages.append({
        "type": "function_call_output",
        "call_id": item.call_id,
        "output": result,
    })
final = client.responses.create(
    model=deployment_name, input=messages, tools=tools, store=False,
)
print(final.output_text)
```

这里的 `client` 与 `deployment_name` 需按第 0 课选择的 Azure OpenAI 环境初始化；这条路径使用 `AZURE_OPENAI_ENDPOINT` 和 `AZURE_OPENAI_DEPLOYMENT`。示例只支持一个城市，别把它当通用时区服务。生产实现还需限制调用次数、处理模型不调用工具、返回多个调用、参数非 JSON、时区无映射，以及第二次模型调用仍请求工具的情况。循环的停止条件和总预算由应用决定。

第一轮调用中的 `tool_choice="auto"` 表示模型可自行决定是否请求工具；因此返回值可能直接是文本，也可能含 `function_call`。`messages += response.output` 保留了这次模型生成的调用项；随后应用追加 `function_call_output`，用相同 `call_id` 对应原请求。第二轮模型才看到真正时间。若只把工具结果塞成普通用户消息，模型可能误认它来自用户；若忘记带调用项，服务也可能无法关联结果。调试时要留意这个差异，调试时应打印每轮的结构化输出，而不只打印最终 `output_text`。

Schema 中的类型只能约束形状。`location` 是字符串，并不代表所有城市都被支持；`get_current_time` 必须处理未知城市。函数描述也影响选择：若描述写“获取时间”，但函数只覆盖一个固定城市，模型可能在东京请求时照样调用。将支持范围写入描述，或把时区查找换成可靠数据源，才能减少误调用。

## 框架如何简化往返

Microsoft Agent Framework 允许用带类型的 Python 函数定义工具，例如用 `@tool(approval_mode="never_require")` 标记只读 `get_current_time(location: str) -> str`，然后把工具交给 `FoundryChatClient(...).as_agent(...)`。框架负责生成 Schema、把模型工具调用映射回函数，并把返回值送入会话。这样省去手写消息列表，但没有省去工具语义设计：描述不清、权限过大或函数返回虚假结果，框架同样会忠实执行错误设计。

Microsoft Foundry Agent Service 还提供文件搜索、Bing Grounding、Azure AI Search 等知识工具，以及函数调用、代码解释器、OpenAPI 工具、Azure Functions 等动作工具。以 Contoso 销售助手为例：用户问销售数据，系统可能先执行只读 SQLite 查询，再用代码解释器画图或统计。创建工具集时，需要确认具体版本支持哪些工具资源与调用方式。有个代码片段把 `CodeInterpreterTool()toolset.add(...)` 错误拼在同一行，不能照抄；更重要的是，函数工具的业务执行和托管工具的实际托管位置要分别核实。

这里有一个版本陷阱：课程归档中的 `AIProjectClient.from_connection_string(...)`、`ToolSet`、`FunctionTool` 与 `create_agent(toolset=...)` 属于较早的 Foundry Agent Service 教学写法；当前官方文档把 classic agents 与新版 Foundry Agents Service 分开，新项目不能只修复那处语法错误就把旧片段当作现行 SDK 配方。学习这个例子时保留“自定义只读函数 + 托管代码解释器”这种能力组合；真正接服务时，先选定 classic 或新版的项目、包版本、端点和工具注册方式，再按同一版本的官方 quickstart 跑通最小例子。代码解释器会在服务侧沙箱运行，但仍要核对数据访问、区域/模型支持、会话费用以及生成文件的访问权限。

销售助手的两个工具各有职责。`fetch_sales_data_using_sqlite_query` 面向已有销售表取数，返回字段、过滤条件与时间范围应可核对；`CodeInterpreterTool` 对已取出的数据计算或作图。把它们一起加入工具集，模型便可以按任务选择。若用户问“上季度销售额是多少”，可能只需查询；若问“比较四个季度并画图”，还需计算与生成产物。应用必须确认图使用的就是查询返回的同一份数据，不要让模型先编一组数字再画。

把知识类工具与操作类工具分开，这一点值得保留。文件搜索、Bing Grounding、Azure AI Search 主要提供外部证据；函数调用、代码解释器、OpenAPI 工具和 Azure Functions 可能计算或产生副作用。但“知识工具”也有数据泄露风险，“操作工具”也可能只读，最终风险要看具体接口和身份。可以给工具注册表增加一列：读取范围、写入范围、调用者身份、用户可见结果、失败与重试策略。面对几十个工具时，先由应用按任务和权限筛出可用集合，再让模型从其中选择。

## 可信工具的边界

注意：让模型生成 SQL 再直接连生产数据库有风险。只读账户、最小权限、受限视图与查询时间/行数限制应在数据库和执行层实现；仅靠“请不要删除”提示词无法阻止错误或攻击。代码解释器同样需要文件、网络、CPU 和内存隔离。输出也要检查：查询返回空不是“没有这个产品”，可能是权限、过滤条件或数据延迟。

工具失败时应返回明确状态，帮助模型决定询问、修正、重试还是停止。例如城市不在时区映射中返回 `UNSUPPORTED_CITY`，不能伪造一个时间；数据库超时要判断查询是否只读，写动作超时则不能盲目再执行。对预订、付款等写操作，应让用户在看到动作对象、金额和条件后确认，并把确认绑定到具体参数。SQL 只读账户是重要起点，但不能替代完整的租户权限和数据脱敏。

## 练习：先测选择，再测执行

为旅行助手设计 `search_flights`（只读）与 `reserve_flight`（创建预订）两个工具。分别构造“查一下”“帮我列出可选项”“买第一班”三种请求，记录模型提出什么调用；随后在执行器里检查身份、预算、库存、确认状态。再模拟搜索结果缺失货币单位、预订超时、用户在确认后改变日期。测试不只看最终回复，还要核对系统里有没有产生错误预订。

部署后的 smoke test 也值得保留：Agent 上线后跑一条简单请求，确认它仍能调用工具并基于结果回答。模型、工具定义或权限升级都可能让原本可用的路径失效。

## 面试会怎么问

百度 Coding Agent 三轮问 Skill 误调用与密钥保护，影石创新面经问工具超时和恢复，字节 9 月面经问 Function Calling 与 RAG 区别。回答时先画清“模型建议调用—宿主校验—真实执行—结果回传”的边界。误调用靠更明确的描述、较小的候选工具集和执行门；超时按只读/写操作区分重试；密钥留在执行器，不给模型或代码沙箱；RAG 是取证与生成策略，函数调用是连接外部能力的接口，两者可以组合。给出一条实际失败日志或测试，比泛泛说“加校验”更有说服力。

## 来源与延伸阅读

- [Microsoft AI Agents for Beginners · Tool Use Design Pattern](https://github.com/microsoft/ai-agents-for-beginners/tree/main/04-tool-use)（函数调用往返、框架实现、销售数据案例与 SQL 风险）
- [Microsoft Learn · Foundry Code Interpreter（新版）](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/code-interpreter)、[Code Interpreter（classic）](https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools-classic/code-interpreter?view=foundry-classic)、[Agent Framework 工具审批](https://learn.microsoft.com/en-us/agent-framework/agents/tools/tool-approval)（核对服务代际、托管工具与 `@tool` 审批语义）
- [百度 Coding Agent 三轮](https://www.nowcoder.com/feed/main/detail/b9521e2b51e04afeac0a3a32e13f4da9)、[影石创新 AI Agent 一面](https://www.nowcoder.com/feed/main/detail/b406c87436a54864bfc0cf4a20299f62)、[字节 Agent 开发一面](https://www.nowcoder.com/discuss/929406267141914624)
