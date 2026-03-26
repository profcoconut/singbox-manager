# singbox-manager · 懒人规则 🚀

[English version](./README.en.md)

> 这不是“订阅转换器” 🔎
>
> 这个项目会保留你现有的订阅节点，并在上面叠加一套开箱即用的分流规则。

## 为什么做这个项目 ✨

- 一个链接导入就能用，适合作为日常默认配置。
- 自动选快节点，并把 OpenAI、流媒体、游戏等流量分到更合适的组。
- 继续使用你自己的机场订阅，不用在每台设备手动维护一堆规则文件。

## 它能做什么 🧩

- 从你现有订阅中拉取节点。
- 基于 BlackMatrix7 规则源，自动加好一套懒人分流规则。
- 生成一个适合日常使用的默认配置链接。
- 支持 iOS 兼容配置，也照顾旧版 sing-box core `1.11.x` 的行为差异。

## 快速开始 ⚡

1. 部署 Worker

```bash
npm install
npx wrangler login
npx wrangler secret put SUBSCRIPTION_URL
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

2. 导入下面这个链接

```text
https://YOUR-WORKER.workers.dev/config/default.json?access_token=YOUR_TOKEN
```

## 工作方式 🛠️

当设备拉取配置时，Worker 会：

1. 读取你的订阅内容。
2. 解析 `vless`、`trojan`、`ss`、`vmess`、`hysteria2` 等常见节点。
3. 构建选择器和 `urltest` 自动测速分组。
4. 应用基于 BlackMatrix7 的分类路由规则。
5. 返回一个可以直接导入 sing-box 的配置文件。

默认配置是给大多数人日常使用准备的；高级设备兼容参数依然保留，但不是必需项。

## 截图 📱

![iOS overview](docs/ios-overview.png)

![iOS groups](docs/ios-groups.png)

## 更新与刷新 🔄

有些上游订阅会阻止 Cloudflare Worker 直接拉取，这个项目也准备了兜底方案：

- 通过 GitHub Actions 在 Cloudflare 之外拉取订阅。
- 将最新快照上传到 Worker 存储。
- 按需刷新配置镜像链接。

仓库内已包含工作流文件：

- `.github/workflows/refresh-subscription.yml`

自动化场景里常用的仓库密钥包括：

- `SUBSCRIPTION_URL`
- `WORKER_UPLOAD_URL`
- `WORKER_CONFIG_URL`
- `GIST_ID`
- `GIST_TOKEN`

## 开发 🧪

本地检查命令：

```bash
npm run check
npm test
```

主要文件：

- `src/index.js`
- `wrangler.toml`
- `tests-smoke.js`

## 说明 📌

- 本项目重点是“给现有订阅加规则”，不是通用订阅转换站。
- 如果上游屏蔽 Worker 直连拉取，可以使用仓库内的 GitHub Actions 自动刷新流程。

## 安全提醒 🔐

- 不要提交真实订阅链接、访问令牌或管理令牌。
- 不要把 Worker secrets 提交进仓库。
- 不要在 README 中公开私有配置链接。
- 任何未公开的配置镜像链接都应视为敏感信息，因为生成后的配置里包含真实服务器凭据。
