# Lazy Rules for sing-box

[中文 README](./README.md)

> This is not a subscription converter.
>
> This project keeps your existing subscription and adds a ready-to-use routing layer on top.

## What Is This

- Pull nodes from your own subscription link
- Add BlackMatrix7-based traffic rules automatically
- Build one importable sing-box profile for daily use
- Keep auto-testing, auto-switching, and grouped routing simple

## Why Use It

- One link for all devices
- OpenAI, media, and gaming traffic are already grouped
- Media traffic prefers `hysteria2` nodes when available
- It still uses your original nodes instead of creating a fake converted pool

## Features

- Auto choose fast nodes with `urltest`
- Auto switch when a better node appears
- Route OpenAI, YouTube, Netflix, Spotify, Steam, GitHub, and Google traffic with BlackMatrix7 rules
- Apple-friendly profile for sing-box `1.11.x`
- Cloudflare Worker deployment
- GitHub Actions refresh fallback when upstream blocks Worker fetch

## Screenshots

![iOS overview](docs/ios-overview.png)

![iOS groups](docs/ios-groups.png)

## How It Works

1. Read your subscription link
2. Parse common node types such as `vless`, `vmess`, `trojan`, `ss`, and `hysteria2`
3. Build groups like `proxy`, `openai`, `media`, and `gaming`
4. Add BlackMatrix7 rules
5. Return a ready-to-import sing-box profile

## Default Routing Logic

- `proxy`: all nodes, auto-tested
- `openai`: prefers US, SG, and JP related nodes
- `media`: prefers HK, TW, JP, SG, and US related nodes, and prefers `hysteria2` when available
- `gaming`: prefers nearby Asian nodes for lower delay

## Quick Start

### 1. Deploy

```bash
npm install
npx wrangler login
npx wrangler secret put SUBSCRIPTION_URL
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

### 2. Import

```text
https://YOUR-WORKER.workers.dev/config/default.json?access_token=YOUR_TOKEN
```

Import that URL directly in sing-box as a remote profile.

## Refresh Strategy

Some providers block direct fetches from Cloudflare Workers. This project includes a GitHub Actions fallback refresh path.

Common repository secrets:

- `SUBSCRIPTION_URL`
- `WORKER_UPLOAD_URL`
- `WORKER_CONFIG_URL`
- `GIST_ID`
- `GIST_TOKEN`

## Project Structure

- [src/index.js](/Users/tengpeng/Documents/Playground/src/index.js): Worker logic and config builder
- [tests-smoke.js](/Users/tengpeng/Documents/Playground/tests-smoke.js): smoke tests
- [wrangler.toml](/Users/tengpeng/Documents/Playground/wrangler.toml): Worker config
- [.github/workflows/refresh-subscription.yml](/Users/tengpeng/Documents/Playground/.github/workflows/refresh-subscription.yml): refresh workflow

## Development

```bash
npm run check
npm test
```

## License

MIT

## Security Notes

- Do not commit real subscription links or tokens
- Do not publish private config URLs in the README
- Generated profiles contain real server credentials, so treat private mirror URLs as sensitive
