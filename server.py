#!/usr/bin/env python3
"""Serve the Markdown-backed Agent learning site without a build step."""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import threading
from contextlib import closing
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

try:
    import markdown
except ImportError as exc:
    raise SystemExit("缺少 Markdown 渲染依赖。请先运行：python3 -m pip install -r requirements.txt") from exc


SITE_ROOT = Path(__file__).resolve().parent
DOC_ROOT = SITE_ROOT / "docs"
INDEX_PATH = DOC_ROOT / "index.json"


def load_index() -> dict:
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def find_article(index: dict, article_id: str) -> tuple[dict, Path] | None:
    for article in index["articles"]:
        if article["id"] == article_id:
            path = (DOC_ROOT / article["path"]).resolve()
            if not path.is_relative_to(DOC_ROOT.resolve()):
                return None
            return article, path
    return None


def reading_minutes(markdown_text: str) -> int:
    # About 450 Chinese characters or 220 English words per minute.
    chinese = len(re.findall(r"[\u3400-\u9fff]", markdown_text))
    other_words = len(re.findall(r"[A-Za-z0-9_]+", markdown_text))
    return max(3, round(chinese / 450 + other_words / 220))


def searchable_text(markdown_text: str) -> str:
    text = re.sub(r"```[\s\S]*?```", " ", markdown_text)
    text = re.sub(r"!?\[([^]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[#*`>|_~\[\]]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def search_snippet(markdown_text: str, needle: str) -> str:
    # Prefer a readable paragraph to a chopped table row or code fragment.
    content = markdown_text.split("## 来源与延伸阅读", 1)[0]
    blocks = re.split(r"\n\s*\n", re.sub(r"```[\s\S]*?```", " ", content))
    for block in blocks:
        if block.lstrip().startswith("|"):
            continue
        clean = searchable_text(block)
        position = clean.casefold().find(needle)
        if position >= 0:
            start = max(0, position - 42)
            end = min(len(clean), position + 76)
            return ("…" if start else "") + clean[start:end] + ("…" if end < len(clean) else "")
    clean = searchable_text(content)
    position = clean.casefold().find(needle)
    if position < 0:
        return clean[:118] + ("…" if len(clean) > 118 else "")
    start = max(0, position - 42)
    end = min(len(clean), position + 76)
    return ("…" if start else "") + clean[start:end] + ("…" if end < len(clean) else "")


class ProgressStore:
    """One shared progress set; deploy with one Fly Machine and a persistent volume."""

    def __init__(self, path: Path, article_ids: set[str]):
        self.path = path
        self.article_ids = article_ids
        self.lock = threading.Lock()
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(path)) as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS completed (kind TEXT NOT NULL, item_id TEXT NOT NULL, "
                "PRIMARY KEY (kind, item_id))"
            )
            connection.commit()

    def valid(self, kind: str, item_id: object) -> bool:
        return (kind == "article" and isinstance(item_id, str) and item_id in self.article_ids) or (
            kind == "day" and isinstance(item_id, int) and not isinstance(item_id, bool) and 1 <= item_id <= 30
        )

    def read(self) -> dict:
        with self.lock, closing(sqlite3.connect(self.path)) as connection:
            rows = connection.execute("SELECT kind, item_id FROM completed").fetchall()
        return {
            "articles": sorted(item_id for kind, item_id in rows if kind == "article" and item_id in self.article_ids),
            "days": sorted(int(item_id) for kind, item_id in rows if kind == "day" and item_id.isdigit() and 1 <= int(item_id) <= 30),
        }

    def apply(self, payload: dict) -> dict:
        imported = payload.get("import")
        if imported is not None:
            if not isinstance(imported, dict) or not isinstance(imported.get("articles"), list) or not isinstance(imported.get("days"), list):
                raise ValueError("导入格式无效")
            articles = imported["articles"]
            days = imported["days"]
            if len(articles) > len(self.article_ids) or len(days) > 30 or any(not self.valid("article", item) for item in articles) or any(not self.valid("day", item) for item in days):
                raise ValueError("导入内容无效")
            with self.lock, closing(sqlite3.connect(self.path)) as connection:
                connection.executemany("INSERT OR IGNORE INTO completed VALUES (?, ?)", [("article", item) for item in articles] + [("day", str(item)) for item in days])
                connection.commit()
            return self.read()
        kind = payload.get("kind")
        item_id = payload.get("id")
        completed = payload.get("completed")
        if not self.valid(kind, item_id) or not isinstance(completed, bool):
            raise ValueError("进度操作无效")
        with self.lock, closing(sqlite3.connect(self.path)) as connection:
            if completed:
                connection.execute("INSERT OR IGNORE INTO completed VALUES (?, ?)", (kind, str(item_id)))
            else:
                connection.execute("DELETE FROM completed WHERE kind = ? AND item_id = ?", (kind, str(item_id)))
            connection.commit()
        return self.read()


class Handler(SimpleHTTPRequestHandler):
    progress_store: ProgressStore

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_ROOT), **kwargs)

    def send_json(self, payload: dict | list, status: int = 200) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        request = urlsplit(self.path)
        if request.path == "/favicon.ico":
            self.send_response(302)
            self.send_header("Location", "/assets/favicon.svg")
            self.end_headers()
            return
        if not request.path.startswith("/api/"):
            return super().do_GET()

        if request.path == "/api/health":
            return self.send_json({"ok": True, "articles": len(load_index()["articles"])})

        if request.path == "/api/progress":
            return self.send_json(self.progress_store.read())

        index = load_index()
        if request.path == "/api/index":
            return self.send_json(index)

        if request.path.startswith("/api/article/"):
            article_id = unquote(request.path.removeprefix("/api/article/"))
            found = find_article(index, article_id)
            if not found:
                return self.send_json({"error": "未找到文章"}, 404)
            article, path = found
            if not path.is_file():
                return self.send_json({"error": "文章 Markdown 尚未就绪"}, 404)
            raw = path.read_text(encoding="utf-8")
            rendered = markdown.markdown(
                raw,
                extensions=["fenced_code", "tables", "toc", "sane_lists"],
                extension_configs={"toc": {"permalink": False}},
                output_format="html5",
            )
            return self.send_json({"article": article, "html": rendered, "minutes": reading_minutes(raw)})

        if request.path == "/api/search":
            query = parse_qs(request.query).get("q", [""])[0].strip()
            if not query:
                return self.send_json({"results": []})
            needle = query.casefold()
            hits = []
            for article in index["articles"]:
                path = DOC_ROOT / article["path"]
                if not path.is_file():
                    continue
                raw = path.read_text(encoding="utf-8")
                body = searchable_text(raw)
                title = article["title"].casefold()
                description = article["description"].casefold()
                tags = " ".join(article.get("tags", [])).casefold()
                position = body.casefold().find(needle)
                if needle not in title and needle not in description and needle not in tags and position < 0:
                    continue
                score = (8 if needle in title else 0) + (4 if needle in tags else 0) + (2 if needle in description else 0) + min(body.casefold().count(needle), 3)
                snippet = search_snippet(raw, needle)
                hits.append({"id": article["id"], "title": article["title"], "description": article["description"], "snippet": snippet, "score": score})
            hits.sort(key=lambda hit: (-hit["score"], hit["title"]))
            return self.send_json({"results": hits[:20]})

        self.send_json({"error": "未知 API"}, 404)

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/progress":
            return self.send_json({"error": "未知 API"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 32768:
                raise ValueError("请求体大小无效")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("请求体格式无效")
            return self.send_json(self.progress_store.apply(payload))
        except (ValueError, json.JSONDecodeError):
            return self.send_json({"error": "进度数据无效"}, 400)


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Agent 工程学习站")
    parser.add_argument("--host", default="127.0.0.1", help="默认仅本机可访问")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    database_path = Path(os.environ.get("PROGRESS_DB_PATH", str(SITE_ROOT / "data" / "progress.sqlite3")))
    Handler.progress_store = ProgressStore(database_path, {article["id"] for article in load_index()["articles"]})
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"AI Agent 学习站：http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
