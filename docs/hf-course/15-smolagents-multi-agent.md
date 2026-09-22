# 多 Agent 分工实作：搜索拍摄地、计算航程并画地图

单个 Agent 可以搜索网页、算距离、整理表格和画地图，但它每一步都要带着越来越长的搜索历史。Hugging Face 的多 Agent 课先用一个 Agent 做基线，再把网页研究交给 `web_agent`，由管理 Agent 汇总结果和绘图。这样做的价值是分清职责与上下文，而不是单纯增加 Agent 数量。

原故事是为 Wayne 家寻找蝙蝠车替代品：找到 Batman 电影拍摄地和超跑工厂，估算从「Gotham」（示例坐标取纽约）运送到各地点的时间，并画世界地图。课程开头一处写了船运，实际工具和后续代码都按**货运飞机**计算；本文采用代码中的货运飞机设定。它只是估算练习，不是物流报价或飞行计划。

## 先写可检查的航程工具

课程用半正矢公式计算球面两点的大圆距离，地球半径设为 6371 km，再乘 1.1 作为非直线路线的教学假设，以 750 km/h 巡航速度换算，并额外加 1 小时表示起降。保留完整公式，方便你核对数值从哪里来：

```python
import math
from typing import Optional, Tuple
from smolagents import tool

@tool
def calculate_cargo_travel_time(
    origin_coords: Tuple[float, float],
    destination_coords: Tuple[float, float],
    cruising_speed_kmh: Optional[float] = 750.0,
) -> float:
    """Estimate cargo-plane travel time using great-circle distance.

    Args:
        origin_coords: Starting (latitude, longitude) in degrees.
        destination_coords: Destination (latitude, longitude) in degrees.
        cruising_speed_kmh: Assumed cruising speed, default 750 km/h.
    """
    lat1, lon1 = map(math.radians, origin_coords)
    lat2, lon2 = map(math.radians, destination_coords)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    central_angle = 2 * math.asin(math.sqrt(a))
    distance_km = 6371.0 * central_angle
    adjusted_distance_km = distance_km * 1.1
    return round(adjusted_distance_km / cruising_speed_kmh + 1.0, 2)

print(calculate_cargo_travel_time((41.8781, -87.6298), (-33.8688, 151.2093)))
```

坐标顺序是纬度、经度；输入若颠倒，计算仍可能给出一个数字，所以最好另加坐标范围检查。`cruising_speed_kmh` 不能为 0 或负数。1.1 和额外 1 小时是示例人为设置的近似，不包含装卸、机场、海关、等待和道路运输。面向真实决策时必须改用真实航线与物流数据。

## 单 Agent 基线：为什么开始变慢

先安装 `smolagents[litellm]`、`matplotlib`、`geopandas`、`shapely`、`kaleido` 等，再用 Together AI 的托管模型做搜索。`GoogleSearchTool` 需要对应搜索服务的 API 凭据；没有时可试 `DuckDuckGoSearchTool`，但可能受速率限制。

```python
from smolagents import CodeAgent, GoogleSearchTool, InferenceClientModel, VisitWebpageTool

model = InferenceClientModel(
    model_id="Qwen/Qwen2.5-Coder-32B-Instruct",
    provider="together",
)
task = (
    "Find Batman filming locations and supercar factories, then estimate "
    "cargo-plane travel time from Gotham (40.7128, -74.0060) to each. "
    "Return a pandas dataframe with locations and hours."
)
agent = CodeAgent(
    model=model,
    tools=[GoogleSearchTool(provider="serper"), VisitWebpageTool(), calculate_cargo_travel_time],
    additional_authorized_imports=["pandas"],
    max_steps=20,
)
result = agent.run(task)
```

这里的一次运行表格列出格拉斯哥、利物浦、伦敦、纽约、印度、香港等候选，以及约 1–20 小时的示例结果。它不是经过本网站重新核验的拍摄地目录；不同时间的网页结果和模型路线会变。这里把 `planning_interval` 设为 4，并提示 Agent 访问来源页确认数字，得到更紧凑的表格。这个对照说明规划提示可以改变路径，但也会让每次模型调用携带更多搜索文本，造成上下文、延迟与成本上升。

## 把网页研究交给子 Agent

管理 Agent 不必看完每一条搜索结果。可以给网页 Agent 搜索、访问网页和航程工具，让它返回结构化地点与来源；管理 Agent 则负责检查覆盖范围、计算或复核数值并绘图。课程这样创建网页 Agent：

```python
web_agent = CodeAgent(
    model=model,
    tools=[
        GoogleSearchTool(provider="serper"),
        VisitWebpageTool(),
        calculate_cargo_travel_time,
    ],
    name="web_agent",
    description="Browses the web to find filming locations and factories",
    verbosity_level=0,
    max_steps=10,
)
```

`name` 和 `description` 很重要：管理 Agent 需要知道能委派什么。子 Agent 的 `max_steps=10` 限制单次研究任务长度；不能因为有管理 Agent 就让子 Agent 无限制搜索。委派后的结果最好包含地点、坐标、来源 URL、是否已核对以及缺失项，而不是只有一段漂亮的总结。多 Agent 的「记忆隔离」仅表示各自轨迹可分开管理，并不保证成本一定下降；子任务重复、结果过长或管理 Agent 反复重新委派，也可能更贵。

## 管理 Agent、规划与最终检查

课程给管理 Agent 另一个模型，授权 `geopandas`、`plotly`、`shapely`、`json`、`pandas`、`numpy`，设置 `planning_interval=5`、`max_steps=15`，并将 `web_agent` 放进 `managed_agents`：

```python
manager_agent = CodeAgent(
    model=InferenceClientModel(
        "deepseek-ai/DeepSeek-R1", provider="together", max_tokens=8096
    ),
    tools=[calculate_cargo_travel_time],
    managed_agents=[web_agent],
    additional_authorized_imports=[
        "geopandas", "plotly", "shapely", "json", "pandas", "numpy"
    ],
    planning_interval=5,
    final_answer_checks=[check_reasoning_and_plot],
    max_steps=15,
)
manager_agent.visualize()
```

`visualize()` 展示管理 Agent 与 `web_agent` 的层级、每个 Agent 可用的工具和授权导入。它是检查配置的好办法：如果搜索工具意外出现在管理 Agent 中，或绘图库没有授权，就能在运行前发现。这里的任务要求至少六个地点，把地点按飞行时间着色，保存为 `saved_map.png`。它给了 `plotly.express.scatter_map` 示例，运行结束后也通过 `manager_agent.python_executor.state["fig"]` 读取图对象。

`check_reasoning_and_plot` 是这里的最终答案检查函数：先确认 `saved_map.png` 存在，再把运行步骤和地图送给视觉模型，请它判断图是否大体满足任务；判断失败时抛错。这个检查有教学价值，但不能把视觉模型说的 `PASS` 当成精确数据验收。至少还应由程序检查文件能打开、地点数量达到 6、每一行有坐标和来源、飞行时间数值可重算、颜色字段确实对应时间。原检查还把「必须使用 `px.scatter_map`」当成功条件，这是示例作业要求，不是地图质量的通用标准。

## 把一次运行当作可复盘的项目

记录基线 Agent 与多 Agent 的模型调用次数、token、耗时、发现的有效地点、重复来源、错误坐标和最终图表。多 Agent 若只是让两个模型给同一搜索词各搜一次，不能证明分工有效；如果子 Agent 能压缩来源并交给管理者一个可核对的数据表，管理者无需阅读全部网页，收益才更清楚。

## 面试会怎么问

**问题：多 Agent 为什么可能比单 Agent 更好，又为什么可能更差？** 小红书和美团面经都追问多 Agent 分工、并发与状态汇总。可以用本课对照回答：网页研究与绘图职责不同，拆开可隔离长搜索上下文、各自设置工具和预算；代价是委派开销、结果传递丢失细节、重复搜索以及难以核对最终答案。设计时明确每个子 Agent 的输入输出 schema、超时、共享事实、汇总规则与最终检查，再用同一任务集比较成功率、成本和失败轨迹。

## 来源与延伸阅读

- [Hugging Face Agents Course · 多 Agent 系统](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/multi_agent_systems)
- [配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/smolagents/multiagent_notebook.ipynb)
- [小红书 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/223fa82f976b4418b214894bd7d941fd)
- [美团 Agent 开发一面面经](https://www.nowcoder.com/feed/main/detail/1d067ce539c64d3988eabb9b646ef8a0)
