# 让 Agent 看图：在任务开始时提供图像

网页截图、图表和文档扫描件不能只靠纯文本模型理解。Hugging Face 的视觉 Agent 课先让 `CodeAgent` 在任务开始时接收两张图像，再请视觉语言模型（VLM）描述角色服装与妆容。这个例子展示的是「图像怎样进入 Agent 任务」，不是可靠的人类身份认证系统。

## 准备图像

课程从 Wikimedia 下载两张小丑角色图片，用 Pillow 转成 RGB。下面保留主要步骤，并补上 HTTP 状态检查与超时，让下载失败时不会把错误页面当图片：

```python
from io import BytesIO
from PIL import Image
import requests

image_urls = [
    "https://upload.wikimedia.org/wikipedia/commons/e/e8/The_Joker_at_Wax_Museum_Plus.jpg",
    "https://upload.wikimedia.org/wikipedia/en/9/98/Joker_%28DC_Comics_character%29.jpg",
]
images = []
for url in image_urls:
    response = requests.get(url, timeout=20, headers={"User-Agent": "AgentsCourseDemo/1.0"})
    response.raise_for_status()
    images.append(Image.open(BytesIO(response.content)).convert("RGB"))
```

示例使用浏览器式 `User-Agent`，这是为教学图片下载做的兼容处理；运行前应遵守图片网站的访问条款。图片链接可能失效，可以换成自己有权使用的测试图片。若是用户上传的真实照片，还需处理隐私、保存期限与授权问题。

## 把图像交给 Agent

示例用支持视觉输入的 `OpenAIServerModel(model_id="gpt-4o")`，并在 `agent.run(..., images=images)` 中传入图像：

```python
from smolagents import CodeAgent, OpenAIServerModel

model = OpenAIServerModel(model_id="gpt-4o")
agent = CodeAgent(
    tools=[],
    model=model,
    max_steps=20,
    verbosity_level=2,
)
response = agent.run(
    "Describe the costume and makeup in these pictures. "
    "Which fictional comic character do they resemble?",
    images=images,
)
print(response)
```

这里的示例输出提到紫色外套、白色面部妆容、绿色头发等线索，再判断图片像小丑形象。模型和 API 的实际输出可能不同，不能把示例输出当成每次调用的标准答案。这里没有外部工具，所以重点是任务输入中包含图像；后续浏览器课会让 Agent 在执行中动态获取新截图。

## 视觉描述与身份核验必须分开

原故事把 Alfred 的视觉判断用于决定访客能否进入派对。这只能当作虚构角色练习：图像相似度、服装或妆容不足以验证现实人的身份，模型也可能误识别。若真实业务需要身份核验，应使用经过授权和验证的身份凭据、人工流程及适用的隐私规则；VLM 描述可作为辅助信息，不应单独作准入决定。

学完本节可做两个对照：同一任务不传图像，检查模型是否仍编造视觉细节；换一张明显不同的测试图片，检查回答是否随图像而变。然后让模型明确说出它只能描述可见特征，无法从照片独立确认身份。

## 面试会怎么问

**问题：视觉 Agent 怎样评测，如何避免模型把图片猜测当事实？** TikTok Agent 面经涉及多模态项目的评测与隐私。回答可分三层：输入侧记录图片来源、授权与质量；模型侧用标注样本测可见特征提取和错误类型；业务侧把「描述图片」与「验证真实身份」分开，后者必须有额外可靠信号与人工兜底。还要测试无图、模糊图、冲突图，以及模型是否在不确定时拒绝作确定断言。

## 来源与延伸阅读

- [Hugging Face Agents Course · 视觉 Agent](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/vision_agents)
- [视觉 Agent 配套 Notebook](https://huggingface.co/agents-course/notebooks/blob/main/unit2/smolagents/vision_agents.ipynb)
- [TikTok AI Agent 开发秋招面经](https://www.nowcoder.com/feed/main/detail/7b1b40fda3244715a82bcb4a821ca887)
