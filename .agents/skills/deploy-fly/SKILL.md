---
name: deploy-fly
description: 为本仓库的 Markdown 学习站创建、更新或验证 Fly.io 自部署实例，用 SQLite 持久卷跨设备共享学习进度。仅在用户明确请求 Fly.io 部署或排障时使用。
---

# 部署本学习站到 Fly.io

本仓库的 `fly.toml`、`Dockerfile` 与 `server.py` 已提供单机部署形态。公开 GitHub Pages 版的进度只保存在每位访问者的 `localStorage`；Fly.io 版在浏览器缓存之外同步到 `/data/progress.sqlite3`。**同一 Fly 实例的所有访问者共享一份进度，没有账号隔离。**

## 执行前核对

- 在仓库根目录操作。先确认 `fly.toml`、`Dockerfile`、`server.py` 与 `docs/index.json` 存在，运行 `python3 check.py`。
- 使用部署者自己的 Fly.io 账户，通过 `fly auth login` 交互登录；不在命令、文件、日志、PR 或聊天中写入令牌、密码或账单资料。
- 新建应用、卷或公网 IP 可能产生费用。执行这些外部写操作前确认使用者授权的账户、目标应用名和区域；不要复用本仓库默认的公共应用名。
- 如目标应用已存在，先核对归属、现有卷和数据库，再更新；不要重新创建同名卷、覆盖进度或删除旧应用。删除和迁移必须另行核对数据与授权。

## 给读者的快速部署命令

先 Fork 或 clone 本仓库，将 `fly.toml` 第一行的 `app` 改为自己选的全局唯一名称。若改变 `primary_region`，下列创建卷命令也要使用相同区域。以下命令中的 `YOUR_UNIQUE_APP_NAME` **必须替换为自己的名称**：

```sh
fly auth login
python3 check.py
fly apps create YOUR_UNIQUE_APP_NAME
fly volumes create progress_data --app YOUR_UNIQUE_APP_NAME --region nrt --size 1 --yes
fly deploy --app YOUR_UNIQUE_APP_NAME --remote-only --ha=false
fly status --app YOUR_UNIQUE_APP_NAME
fly volumes list --app YOUR_UNIQUE_APP_NAME
fly ips list --app YOUR_UNIQUE_APP_NAME
```

若 `fly ips list` 没有公网地址，再执行 `fly ips allocate-v4 --shared --app YOUR_UNIQUE_APP_NAME --yes`。随后访问 `https://YOUR_UNIQUE_APP_NAME.fly.dev/`，并检查 `https://YOUR_UNIQUE_APP_NAME.fly.dev/api/health` 返回 `ok: true`。再从两个设备测试学习标记是否同步。

## 更新与数据保护

已有实例通常只需从新代码执行 `fly deploy --app YOUR_UNIQUE_APP_NAME --remote-only --ha=false`，不要重建卷。保持单台 Machine 与 `progress_data` 卷挂载；当前 SQLite 方案不能直接扩为多机共享。确认 `PROGRESS_DB_PATH=/data/progress.sqlite3`、卷位于预期区域并已挂载。升级前按 Fly.io 官方方法备份或检查卷快照；不要把快照或数据库提交到 Git。

如果应用名改变，Fly.io 通常需要新建应用并迁移数据：先从旧站 `GET /api/progress` 导出状态，在新站经 `POST /api/progress` 的 `import` 字段导入，核对一致且新站可用后，才考虑删除旧应用。删除 Fly App 会连卷与快照一并删除，无法靠重新部署恢复。

更多命令与计费信息以 [Fly.io 官方文档](https://fly.io/docs/) 为准。
