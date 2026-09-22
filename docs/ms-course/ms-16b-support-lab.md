# 实战：把客户支持 Agent 接成可发布的服务

Contoso 客户支持练习把工具、知识库、记忆、路由、缓存、审批、评测和追踪放进同一个服务。这里按用户请求真正流过的顺序重建练习，方便你在自己的技术栈里实现，而不是只知道八个功能名。

## 先限定业务动作

支持 Agent 要回答政策问题、查询当前用户订单并创建支持工单。政策从知识库检索，订单从业务 API 实时读取；两者不能互相替代。若用户要退款，先查订单和政策，形成金额与对象明确的草稿；超过业务阈值的退款交给人工审批，批准后才执行。多轮交互还需要记忆：用户第二句“那我的订单呢？”应延续当前会话身份，但不能因此读取其他客户订单。

工具合同至少写清：`get_order_status(order_id)` 是只读，必须检查订单属于当前用户；`create_support_ticket(...)` 会写入，需要幂等键；`issue_refund(...)` 会改变账务，只能在批准并重新验证余额后执行。客服知识库可先用内存回退跑通 Notebook，再接 Azure AI Search；回退数据若仅是演示政策，不应在生产里悄悄替代真实政策索引。

## 请求处理顺序

一次请求进入服务时，先取得经过认证的 `customer_id`、会话 ID 和任务 ID。按问题性质选择是否可缓存；只有公开、跨用户一致且有版本号的政策答案才可从共享缓存返回。订单状态、发票、退款和用户偏好必须按身份分隔，通常不直接缓存最终自然语言。缓存未命中后，分类器可选小模型处理简单 FAQ，复杂投诉或多工具任务交给更强模型；分类结果和路由依据进入 Trace。Agent 使用权限筛选后的工具及知识来源执行，最后返回结果和未完成事项。

看一个简短的 `handle_support_request(query, customer_id)`：先 `response_cache.get(normalize(query))`，再按 `is_simple(query)` 选 `gpt-5-nano` 或 `gpt-5-mini`，在 span 中运行 Agent，最后按同一个规范化问题缓存回复。这个例子能说明路由与追踪，但如果缓存键只有问题文本，“我的订单状态”可能把 A 用户回答给 B 用户。要么只缓存经过审查的公共 FAQ，要么把租户/用户、权限与知识版本纳入键，并限制缓存范围：

```python
async def handle_support_request(query, principal, session):
    task_id = new_task_id()
    route = classify_request(query)
    cache_key = None
    if route.kind == "public_policy_faq":
        cache_key = (principal.tenant_id, policy_index_version(), normalize(query))
        cached = public_policy_cache.get(cache_key)
        if cached is not None:
            return cached

    model = choose_model(route)  # 根据经评测的路由规则
    with tracer.start_as_current_span("support_request") as span:
        span.set_attribute("task.id", task_id)
        span.set_attribute("route.kind", route.kind)
        span.set_attribute("routed.model", model)
        result = await support_agent.run(
            query, model=model, session=session,
            tools=authorized_tools(principal, route),
        )

    if cache_key is not None and result.is_grounded_public_answer:
        public_policy_cache.set(cache_key, result.text)
    return result
```

这是解释请求边界的教学伪代码：`authorized_tools`、`is_grounded_public_answer`、Trace 后端和服务存储都需实现。它表达的原则是先判任务与权限，再决定缓存；不能让自然语言相同掩盖用户上下文不同。

## 退款审批的真实状态

超过阈值的退款需要人工签字；作业另要求超过 50 美元的 credit 走人工审批。金额阈值要以业务规定为准。审批之前，服务应生成 `refund_draft`，展示订单、退款金额与原因；审批者通过或拒绝时，要绑定 draft ID 与金额。批准后重新查订单状态，确认没有其他处理完成，再用同一个幂等键执行。若支付服务超时，查询是否已退款；不要让 Agent 因工具错误重新生成一份退款。

可以给状态取清楚的名称：`draft`、`awaiting_approval`、`approved`、`executing`、`completed`、`rejected`、`status_unknown`。用户看到的文案应区分“申请已提交”“人工已批准”和“款项已处理”；三者不能混成一句“退款成功”。同一动作的审批、工具调用与最终结果应在 Trace 里可关联。

## 发布前评测门

一段简化代码遍历 `test_cases`，对每条运行 Agent，以 `score_response(...) >= 0.8` 算通过，最后若通过率达到默认 `threshold=0.8` 才部署。这解释了“门”的位置，但生产评测不能只比较回答文本。测试条目应同时断言正确的工具、副作用、引用、拒绝行为和审批状态。若测试集为空，`passed / len(test_cases)` 会报错，也应明确失败而非放行。

一份最小评测集可包含：正常政策问答、政策不存在、当前用户订单查询、越权订单、重复工单、退款低于阈值、退款高于阈值待批准、审批后金额被修改、工具超时后恢复。每条有输入、身份、预期文本要点、预期工具轨迹和最终业务状态。整体通过率之外，高风险用例可以设置“一例失败即阻断”，不应让八条安全案例被其他简单 FAQ 的高分抵消。

## 部署后冒烟与线上观察

发布门只证明候选版本在受控测试中表现合格。托管部署成功也只证明控制面接收了配置，不能保证实际端点可用。可用 `tests/lesson-16-smoke-tests.json`，检查政策回答、订单查询、保持主题和多轮连续性；GitHub Actions 示例使用 Azure OIDC 登录，把请求发到 Responses 端点。部署后通过 Actions 指定 Foundry project endpoint 和 Agent 名称，联邦身份需获得项目范围的 `Azure AI User` 角色。

冒烟测试应便宜且无危险副作用：只读查询、模拟订单和隔离身份即可。失败时停止流量晋级，保留部署版本、响应状态与 Trace；成功后继续线上监控真实任务成功率、工具错误、p95 延迟、成本和人工批准等待时长。冒烟、离线评测和在线评估是三层不同证据，不相互替代。

## 作业：改成 SaaS 订阅计费助手

再把工具换成 `get_subscription_status`、`get_invoice`、`issue_credit`；超过 50 美元的 credit 要人工审批。准备三份真实格式的测试政策资料：退款政策、计费周期、取消政策。扩展到至少八个评测用例，其中至少两个必须触发审批路径，并故意加入一个应失败的版本，确认评测门能拒绝它。最后跑十个混合请求，报告多少走小模型、多少走大模型、多少从缓存返回，以及每类是否满足质量要求。把路由规则写成可解释的一句话，并用真实流量坏例验证，而非只看模型单价。

完成后让另一位同学扮演故障注入者：使 Search 索引过期、工单接口超时、退款服务返回状态未知、缓存误命中。若系统能给用户清楚状态、避免重复写入并在 Trace 中找到失败位置，才算走出了 Notebook。

## 面试会怎么问

要务科技面经问 Webhook 签名、幂等与补偿，美团面经问交易稳定性。面试中介绍这类项目时，按一条真实请求讲：身份 → 缓存/路由 → RAG 或订单工具 → 审批 → 写操作 → 状态确认 → Trace 与评测。特别指出共享缓存和重复退款的风险，再给出测试用例与修复。这样比列“接了 Redis、OTel、RAG”更能证明你懂完整链路。

## 来源与延伸阅读

- [Microsoft AI Agents for Beginners · Deploying Scalable Agents](https://github.com/microsoft/ai-agents-for-beginners/tree/main/16-deploying-scalable-agents)（本文承接 Contoso Notebook、评估门、冒烟测试、八道知识检查与 SaaS 作业）
- [要务科技 AI 应用开发面经](https://www.nowcoder.com/discuss/926539013991796736)、[美团 AI Agent 面经](https://www.nowcoder.com/feed/main/detail/50bcdc47e7754aa7be59b6318fea514b)
