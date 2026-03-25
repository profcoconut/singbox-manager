# singbox-manager

Cloudflare Worker that:

1. pulls your subscription from `SUBSCRIPTION_URL`
2. converts BlackMatrix7 Surge rule lists into sing-box remote rule-set JSON
3. generates per-profile sing-box configs with `urltest` auto selection
4. lets every device pull the config from one HTTPS URL

## What it does

- Reads the real subscription payload you gave me. It already matches the expected base64 subscription style.
- Supports `vless://`, `trojan://`, `ss://`, `vmess://`, and `hysteria2://` nodes.
- Builds `urltest` groups so sing-box can automatically choose the fastest node and switch when a better node appears.
- Exposes BlackMatrix7-backed endpoints like `/rules/OpenAI.json` and `/rules/Netflix.json`.
- Lets you route categories to different groups with a simple profile definition in [`src/index.js`](/Users/tengpeng/Documents/Playground/src/index.js).

## Endpoints

- `GET /profiles`
- `GET /config/default?device=tun&access_token=YOUR_TOKEN`
- `GET /config/global?device=desktop&access_token=YOUR_TOKEN`
- `GET /rules/OpenAI.json?access_token=YOUR_TOKEN`
- `GET /admin/subscription?admin_token=YOUR_ADMIN_TOKEN`
- `PUT /admin/subscription?admin_token=YOUR_ADMIN_TOKEN`
- `POST /admin/subscription/sync?admin_token=YOUR_ADMIN_TOKEN`
- `GET /health`

`device` options:

- `tun`: one TUN inbound for phones/tablets
- `desktop`: TUN + local mixed port `127.0.0.1:7890`
- `proxy`: local mixed port only

## Customize Traffic Routing

Edit [`src/index.js`](/Users/tengpeng/Documents/Playground/src/index.js) in `BASE_CONFIG.profiles`.

`groups` decide which nodes belong to a server pool:

```js
{
  tag: "openai",
  matchAny: ["美国", "\\bUS\\b", "新加坡", "\\bSG\\b", "日本", "\\bJP\\b"],
  autoTest: true,
  allowManual: true,
  fallback: "proxy"
}
```

`routes` decide which traffic goes to which pool:

```js
[
  { ruleSet: "OpenAI", outbound: "openai" },
  { ruleSet: "Netflix", outbound: "media" },
  { ruleSet: "Steam", outbound: "gaming" }
]
```

This is the Profiles4limbo-style part: traffic category -> chosen outbound group.

## Deploy To Cloudflare

You need Node 18+ locally for `wrangler`. This machine currently has Node `v10.16.0`, so deployment was not possible from here.

1. Install a newer Node and Wrangler.
2. Log into Cloudflare:

```bash
npm install
npx wrangler login
```

3. Add your secrets:

```bash
npx wrangler secret put SUBSCRIPTION_URL
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put ADMIN_TOKEN
```

Use your real subscription URL for `SUBSCRIPTION_URL`.

4. Deploy:

```bash
npx wrangler deploy
```

5. Import the generated config URL into sing-box on each device, for example:

```text
https://YOUR-WORKER.workers.dev/config/default?device=tun&access_token=YOUR_TOKEN
```

For desktops:

```text
https://YOUR-WORKER.workers.dev/config/default?device=desktop&access_token=YOUR_TOKEN
```

## Notes

- BlackMatrix7 contains some rule types that do not map cleanly to sing-box source rule-sets, such as `URL-REGEX`, `PROCESS-NAME`, and `IP-ASN`. This Worker skips those lines and reports the skipped count in the response header.
- Latency switching is handled by sing-box `urltest` on the device side, not by Cloudflare.
- The current subscription host returns `403` to Cloudflare Worker fetches, even though it is reachable from a normal client. Because of that, the Worker now supports a Cloudflare KV snapshot fallback.
- To refresh the snapshot from a trusted machine, run:

```bash
curl -sS 'YOUR_SUBSCRIPTION_URL' | curl -sS -X PUT --data-binary @- 'https://YOUR-WORKER.workers.dev/admin/subscription?admin_token=YOUR_ADMIN_TOKEN'
```

- You can check snapshot status with:

```bash
curl -sS 'https://YOUR-WORKER.workers.dev/admin/subscription?admin_token=YOUR_ADMIN_TOKEN'
```

- If you want a web admin UI next, the natural next step is adding Cloudflare KV or D1 for editable profiles instead of changing code.
