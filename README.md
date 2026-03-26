# singbox-manager · 懒人规则

> **Not a subscription converter.** This project keeps your existing subscription nodes, then adds ready-to-use traffic rules on top.
>
> **这不是“订阅转换器”。** 这个项目保留你现有订阅节点，只是在上面叠加一套可直接使用的分流规则（懒人规则）。

## Why this project / 为什么做这个项目

- **EN:** Import one profile and use it. Auto-select fast nodes, and route OpenAI / media / gaming traffic to better groups.
- **中文：** 一个链接导入就能用。自动选快节点，并把 OpenAI / 流媒体 / 游戏流量分到更合适的组。

- **EN:** Keep using your provider subscription. No need to manually maintain long rule files on every device.
- **中文：** 继续用你自己的机场订阅，不用在每台设备手动维护一堆规则文件。

## What it does / 功能说明

- **EN:** Pull nodes from your existing subscription.
- **中文：** 从你现有订阅拉取节点。

- **EN:** Add prebuilt lazy traffic rules (懒人规则) based on BlackMatrix7 rule sources.
- **中文：** 基于 BlackMatrix7 规则源，自动加好一套懒人分流规则。

- **EN:** Generate one default profile URL for daily use.
- **中文：** 生成一个日常使用的默认配置链接。

- **EN:** Support iOS-compatible profile output (including older sing-box core 1.11.x behavior).
- **中文：** 支持 iOS 兼容配置（包含旧版 sing-box 1.11.x 的兼容行为）。

## Quick Start / 快速开始

1) **Deploy Worker / 部署 Worker**

```bash
npm install
npx wrangler login
npx wrangler secret put SUBSCRIPTION_URL
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

2) **Import this URL / 导入这个链接**

```text
https://YOUR-WORKER.workers.dev/config/default.json?access_token=YOUR_TOKEN
```

## Screenshots / 截图

![iOS overview](docs/ios-overview.png)

![iOS groups](docs/ios-groups.png)

## Notes / 说明

- **EN:** This project focuses on “rule enhancement for existing subscriptions”, not generic link converting.
- **中文：** 本项目重点是“给现有订阅加规则”，不是通用的订阅转换站。

- **EN:** If provider blocks Worker direct fetch, use the included GitHub Actions refresh workflow.
- **中文：** 如果上游屏蔽 Worker 直连拉取，可使用仓库内 GitHub Actions 自动刷新流程。

Workflow file / 工作流文件:
- `.github/workflows/refresh-subscription.yml`

## Security / 安全

- **EN:** Never commit real subscription URLs, access tokens, or admin tokens.
- **中文：** 不要提交真实订阅链接、访问令牌或管理令牌。

- **EN:** Treat any config mirror URL as sensitive.
- **中文：** 任何配置镜像链接都应视为敏感信息。
