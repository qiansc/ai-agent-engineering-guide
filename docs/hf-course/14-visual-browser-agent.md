# 视觉浏览 Agent：在每一步接收网页截图

上一课把图片随任务一起提供。浏览网页时，Agent 看到的页面会随点击、滚动和导航不断改变，因此需要在每次动作后重新观察。这套练习把 Selenium、Helium 与 `smolagents` 连接：提供浏览工具，在 `step_callback` 截图，再把截图记录到 `ActionStep` 的图像观察中。

原文完整示例放在 [vision_web_browser.py](https://huggingface.co/agents-course/notebooks/blob/main/unit2/smolagents/vision_web_browser.py)。下面按功能解释核心代码及运行边界；具体浏览器驱动、依赖版本与页面内容会变化，运行前应先在隔离测试环境核对。

## Agent 需要哪些浏览动作

课程让 Agent 使用 `DuckDuckGoSearchTool` 找页面，并给浏览器增加三个工具：`search_item_ctrl_f` 在当前页面查找文本、`go_back` 返回、`close_popups` 通过 Escape 关闭弹窗。它们与浏览器驱动对象 `driver` 协作。

```python
@tool
def go_back() -> None:
    """Go back to the previous browser page."""
    driver.back()

@tool
def close_popups() -> str:
    """Press Escape to close a visible modal, if the page supports it."""
    webdriver.ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    return "Pressed Escape. Check the next screenshot to verify the result."
```

按 Escape 并不能保证弹窗真的关闭，所以返回文字应提醒下一步观察。`search_item_ctrl_f` 的示例实现用 XPath 把搜索文本直接插进表达式，文本包含引号时可能破坏查询；生产实现要正确转义，或改用更稳妥的 DOM 查询。它还需检查 `nth_result` 至少为 1，避免负数索引误选最后一项。网页中的文本来自外部来源，不能当成系统指令。

## 每步截图怎样进入下一轮

`smolagents` 的运行日志里，`SystemPromptStep` 记录系统提示，`TaskStep` 记录用户目标，`ActionStep` 记录动作和结果。课程在 step callback 中调用 `driver.get_screenshot_as_png()`，用 Pillow 打开图片，并赋给 `step_log.observations_images`；下一轮模型由此看到操作后的页面状态。

```python
from io import BytesIO
from PIL import Image

def save_screenshot(step_log, agent) -> None:
    current_driver = helium.get_driver()
    if current_driver is None:
        return
    png_bytes = current_driver.get_screenshot_as_png()
    image = Image.open(BytesIO(png_bytes))
    step_log.observations_images = [image.copy()]
    url_info = f"Current url: {current_driver.current_url}"
    previous = step_log.observations or ""
    step_log.observations = f"{previous}\n{url_info}".strip()
```

课程还尝试删除较早步骤的截图，以减小上下文；原代码在循环里混用了 `step_log` 与 `step_logs`，直接复制可能清理错对象。若要保留最近 N 张截图，应遍历日志并修改真正的旧步骤对象，再测试新旧截图是否都按预期可见。截图很大，压缩历史时应保留关键状态和页面 URL；只留下「点击成功」文字但丢掉操作后的画面，模型下一步可能缺少依据。

页面有动画时，课程等待约 1 秒再截图。这是示例性延迟，不保证所有网页已稳定。实际浏览器自动化应等待可观察的页面条件，例如目标元素出现、加载指示消失或 URL 改变，再截图；还需设置最大等待时间。截图之后记录当前 URL，有助于排查跳转到了意料之外的站点。

## 装配模型、工具与回调

这里的安装命令和装配方式是：

```bash
pip install 'smolagents[all]' helium selenium python-dotenv
```

```python
from smolagents import CodeAgent, OpenAIServerModel, DuckDuckGoSearchTool

model = OpenAIServerModel(model_id="gpt-4o")
agent = CodeAgent(
    tools=[DuckDuckGoSearchTool(), go_back, close_popups, search_item_ctrl_f],
    model=model,
    additional_authorized_imports=["helium"],
    step_callbacks=[save_screenshot],
    max_steps=20,
    verbosity_level=2,
)
```

课程给任务附加了 `helium_instructions`，指导模型按预期方式浏览；该变量在页面片段中没有定义，需从配套完整脚本取得。运行之前还要初始化浏览器驱动和相关全局对象。不要把这段装配代码当成独立可运行的完整程序。

故事任务是查找 Wonder Woman 的公开图像与页面资料，描述这个虚构角色的典型外观。即使模型能准确描述，也不能据此验证现实访客的身份。浏览时还应限定允许的站点与动作；搜索结果、网页正文和弹窗都可能包含诱导性文字，不得让其覆盖原任务或执行权限。

## 练习：检查“动作—截图”是否对得上

在一个无敏感数据的测试网站上，先让 Agent 搜索并打开一页，再返回上一页。保存每步工具名、参数、URL、截图和错误。检查：点击后截图是否已更新；弹窗没关闭时是否如实记录；页面跳到非预期域名时是否停止；上下文清理后是否仍知道当前 URL。视觉浏览的可靠性来自这些可回放的观察，而不是模型最终对页面的流畅描述。

## 面试会怎么问

**问题：Computer Use / 浏览器 Agent 如何知道点击成功，失败后怎么恢复？** 字节面经问过 Computer Use。回答时说明每个动作后用 URL、DOM 状态或截图进行观察，执行器记录动作 ID、目标与返回，不让模型自己写「点击成功」。页面未变化要分辨元素没找到、遮挡、加载中或权限问题；重试前先确认上次动作是否可能已经造成副作用。长流程保留关键截图与状态，预算耗尽时交接当前页面和未完成步骤。

## 来源与延伸阅读

- [Hugging Face Agents Course · 视觉 Agent 的浏览器部分](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/vision_agents)
- [课程配套浏览器脚本](https://huggingface.co/agents-course/notebooks/blob/main/unit2/smolagents/vision_web_browser.py)
- [字节 Agent 秋招一面面经](https://www.nowcoder.com/discuss/929731481189044224)
