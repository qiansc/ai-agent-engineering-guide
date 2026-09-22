# AI Agent 工程学习站

182 篇中文学习文章，以 Markdown 维护，涵盖 Agent 机制、工程实践、生产治理、课程与面试。文章目录与 30 天学习清单在 [`docs/index.json`](docs/index.json)。每篇文章底部保留来源与延伸阅读。

## 两种发布方式

- GitHub Pages：工作流从 Markdown 生成静态 HTML 数据与全文搜索索引。学习进度只保存在访问者自己的浏览器 `localStorage`，不同设备不会自动同步。
- Fly.io：Python 服务直接读取 Markdown。文章学完状态和 30 天打卡保存在单台机器挂载卷上的 SQLite；所有访客看到并修改同一份进度。它不是个人账户进度，任何访问者都能取消其他人的标记。这个版本不显示 GitHub 链接。

## 本地运行与检查

```sh
python3 -m pip install -r requirements.txt
python3 check.py
python3 server.py
```

打开 `http://127.0.0.1:4173/`。本地服务默认也启用共享进度，数据库存放在不纳入版本控制的 `data/progress.sqlite3`。可以设置 `PROGRESS_DB_PATH` 改变路径。

静态构建：

```sh
python3 build_static.py
```

产物位于 `_site/`。GitHub Actions 在每次推送到 `main` 时检查内容并部署该目录。若仓库名改变，记得更新工作流传给 `build_static.py` 的仓库地址。

## Fly.io 持久化

`fly.toml` 使用单台 Machine 和 `progress_data` 卷。请先创建 App 和同区域卷，再执行 `fly deploy`。卷只在单台机器上保证共享状态；不要在未引入集中式数据库前扩容到多台机器。部署时数据库路径为 `/data/progress.sqlite3`。

## 内容与引用

本站文章为学习整理，正文保留原理、操作和案例；外部资料链接列于各文底部。公开可访问不代表被引用资料的版权或再分发许可发生变化。
