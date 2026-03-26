# 懒人规则 · sing-box

[English README](./README.en.md)

> 这不是“订阅转换器”。
>
> 这个项目保留你现有的机场订阅，只是在原订阅之上叠加一套开箱即用的懒人分流规则。

## 这是什么

- 从你自己的订阅链接拉取节点
- 自动叠加 BlackMatrix7 分流规则
- 生成一个可直接导入 sing-box 的默认配置
- 保留自动测速、自动切换、按场景分组的体验

## 为什么用它

- 一条链接，多设备通用
- OpenAI / 视频流量 / 游戏流量默认分好组
- 视频流量会优先尝试 `hysteria2` 节点
- 继续使用你原本的节点，而不是重新造一份“转换订阅”

## 功能

- 用 `urltest` 自动选择快节点
- 节点变差时自动切换
- 基于 BlackMatrix7 规则处理 OpenAI / YouTube / Netflix / Spotify / Steam / GitHub / Google
- 提供适配 sing-box `1.11.x` 的 Apple 兼容配置
- 支持部署到 Cloudflare Worker
- 如果上游屏蔽 Worker 拉取，可用 GitHub Actions 做自动刷新兜底

## 截图

![iOS overview](docs/ios-overview.png)

![iOS groups](docs/ios-groups.png)

## 工作方式

1. 读取你的订阅链接
2. 解析常见节点类型，如 `vless`、`vmess`、`trojan`、`ss`、`hysteria2`
3. 构建 `proxy`、`openai`、`media`、`gaming` 等分组
4. 叠加 BlackMatrix7 规则
5. 返回一个可直接导入的 sing-box 配置

## 默认分流逻辑

- `proxy`：全节点自动测速
- `openai`：优先美国 / 新加坡 / 日本方向节点
- `media`：优先香港 / 台湾 / 日本 / 新加坡 / 美国方向节点，并优先尝试 `hysteria2`
- `gaming`：优先亚洲低延迟节点

## 快速开始

### 1. 部署

```bash
npm install
npx wrangler login
npx wrangler secret put SUBSCRIPTION_URL
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

### 2. 导入

```text
https://YOUR-WORKER.workers.dev/config/default.json?access_token=YOUR_TOKEN
```

把上面的链接作为远程配置直接导入 sing-box 即可。

## 刷新策略

有些机场会拦截 Cloudflare Worker 直连拉取，这个项目内置 GitHub Actions 兜底刷新方案。

常见仓库密钥：

- `SUBSCRIPTION_URL`
- `WORKER_UPLOAD_URL`
- `WORKER_CONFIG_URL`
- `GIST_ID`
- `GIST_TOKEN`

## 项目结构

- [src/index.js](/Users/tengpeng/Documents/Playground/src/index.js)：Worker 逻辑和配置生成器
- [tests-smoke.js](/Users/tengpeng/Documents/Playground/tests-smoke.js)：基础测试
- [wrangler.toml](/Users/tengpeng/Documents/Playground/wrangler.toml)：Worker 配置
- [.github/workflows/refresh-subscription.yml](/Users/tengpeng/Documents/Playground/.github/workflows/refresh-subscription.yml)：刷新工作流

## 开发

```bash
npm run check
npm test
```

## 许可证

MIT

## 安全提醒

- 不要提交真实订阅链接或令牌
- 不要在 README 里公开私有配置链接
- 生成后的配置包含真实节点信息，私有镜像链接也应视为敏感信息
