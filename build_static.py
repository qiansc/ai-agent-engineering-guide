#!/usr/bin/env python3
"""Render the Markdown corpus to a GitHub Pages-ready static directory."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import markdown

from server import SITE_ROOT, find_article, load_index, reading_minutes, searchable_text


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build(output: Path, repository_url: str) -> None:
    output = output.resolve()
    if not output.is_relative_to(SITE_ROOT) or output == SITE_ROOT:
        raise ValueError("静态输出目录必须是网站目录下的子目录")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    shutil.copy2(SITE_ROOT / "index.html", output / "index.html")
    shutil.copytree(SITE_ROOT / "assets", output / "assets")
    (output / "assets" / "config.js").write_text(
        f"window.AGENT_SITE_CONFIG = {json.dumps({'mode': 'static', 'githubUrl': repository_url}, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    (output / ".nojekyll").touch()
    index = load_index()
    write_json(output / "api" / "index.json", index)
    search_index = []
    for article in index["articles"]:
        found = find_article(index, article["id"])
        if not found:
            raise ValueError(f"文章索引无效：{article['id']}")
        raw = found[1].read_text(encoding="utf-8")
        rendered = markdown.markdown(
            raw,
            extensions=["fenced_code", "tables", "toc", "sane_lists"],
            extension_configs={"toc": {"permalink": False}},
            output_format="html5",
        )
        write_json(output / "api" / "article" / f"{article['id']}.json", {
            "article": article,
            "html": rendered,
            "minutes": reading_minutes(raw),
        })
        search_index.append({
            "id": article["id"], "title": article["title"],
            "description": article["description"],
            "tags": " ".join(article.get("tags", [])),
            "text": searchable_text(raw.split("## 来源与延伸阅读", 1)[0]),
        })
    write_json(output / "api" / "search-index.json", search_index)
    print(f"静态网站已生成：{output}（{len(index['articles'])} 篇文章）")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=SITE_ROOT / "_site")
    parser.add_argument("--repository-url", default="https://github.com/qiansc/ai-agent-engineering-guide")
    options = parser.parse_args()
    build(options.output, options.repository_url)
