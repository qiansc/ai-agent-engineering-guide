#!/usr/bin/env python3
"""Check the Markdown corpus and its navigation index before publishing."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"
INDEX = DOCS / "index.json"


def chinese_chars(text: str) -> int:
    return len(re.findall(r"[\u3400-\u9fff]", text))


def check() -> list[str]:
    errors: list[str] = []
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    groups = {group["id"] for group in index["groups"]}
    articles = index["articles"]
    ids = [article["id"] for article in articles]
    paths = [article["path"] for article in articles]

    if len(groups) != len(index["groups"]):
        errors.append("目录分组 ID 重复")
    if len(ids) != len(set(ids)):
        errors.append("文章 ID 重复")
    if len(paths) != len(set(paths)):
        errors.append("Markdown 路径重复")
    for group in index["groups"]:
        chapters = group.get("chapters", [])
        chapter_ids = [chapter["id"] for chapter in chapters]
        if not chapters or len(chapter_ids) != len(set(chapter_ids)):
            errors.append(f"{group['id']} 缺少章节或章节 ID 重复")
        listed = [
            article_id
            for chapter in chapters
            for article_id in (
                chapter.get("articles", [])
                + [article_id for section in chapter.get("sections", []) for article_id in section["articles"]]
            )
        ]
        expected = [article["id"] for article in articles if article["group"] == group["id"]]
        if len(listed) != len(set(listed)) or set(listed) != set(expected):
            errors.append(f"{group['id']} 的章节文章与索引不一致，或存在遗漏/重复")
    unindexed = sorted(str(path.relative_to(DOCS)) for path in DOCS.glob("*/*.md") if str(path.relative_to(DOCS)) not in paths)
    if unindexed:
        errors.append(f"存在未入目录的文章：{', '.join(unindexed)}")
    if sorted(item["day"] for item in index["plan"]) != list(range(1, 31)):
        errors.append("30 天清单必须恰好覆盖第 1～30 天")

    for day in index["plan"]:
        if day["article"] not in ids:
            errors.append(f"第 {day['day']} 天引用不存在的文章：{day['article']}")

    for article in articles:
        label = article["id"]
        if article["group"] not in groups:
            errors.append(f"{label} 引用了不存在的分组")
        # The teaching sequence is topical, while Markdown files may retain a
        # course-specific directory for editorial maintenance.
        path = (DOCS / article["path"]).resolve()
        if not path.is_relative_to(DOCS.resolve()) or not path.is_file():
            errors.append(f"{label} Markdown 文件不存在或路径越界：{article['path']}")
            continue
        raw = path.read_text(encoding="utf-8")
        prose = re.sub(r"^```[^\n]*\n.*?^```[ \t]*$", "", raw, flags=re.MULTILINE | re.DOTALL)
        headings = re.findall(r"^#{1,6} .+$", prose, re.MULTILINE)
        h1 = [heading for heading in headings if heading.startswith("# ")]
        h2 = [heading for heading in headings if heading.startswith("## ")]
        if len(h1) != 1 or not raw.startswith("# "):
            errors.append(f"{label} 需要以唯一的一级标题开篇")
        if len(h2) < 3:
            errors.append(f"{label} 正文少于三个二级章节")
        if not h2 or h2[-1] != "## 来源与延伸阅读":
            errors.append(f"{label} 最后一节应为「来源与延伸阅读」")
        if not re.search(r"https?://", raw.rsplit("## 来源与延伸阅读", 1)[-1]):
            errors.append(f"{label} 文末缺少可核验的外部来源")
        if raw.count("```") % 2:
            errors.append(f"{label} 代码围栏未闭合")
        print(f"{label:24} {chinese_chars(raw):5} 汉字  {len(h2) - 1:2} 正文章节")

    return errors


if __name__ == "__main__":
    problems = check()
    if problems:
        print("\n待修正：", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        raise SystemExit(1)
    print("\n索引与文章检查通过。")
