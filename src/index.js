var BASE_CONFIG = {
  ruleRepoBase: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge",
  defaultTestUrl: "https://www.gstatic.com/generate_204",
  configCacheTtl: 300,
  ruleCacheTtl: 86400,
  upstreamTimeoutMs: 15000,
  defaultRuleUpdateInterval: "1d",
  subscriptionHeaders: {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
  },
  ruleSets: {
    OpenAI: { path: "OpenAI/OpenAI.list" },
    GlobalMedia: { path: "GlobalMedia/GlobalMedia.list" },
    Netflix: { path: "Netflix/Netflix.list" },
    YouTube: { path: "YouTube/YouTube.list" },
    Telegram: { path: "Telegram/Telegram.list" },
    Spotify: { path: "Spotify/Spotify.list" },
    Steam: { path: "Steam/Steam.list" },
    GitHub: { path: "GitHub/GitHub.list" },
    Google: { path: "Google/Google.list" }
  },
  profiles: {
    default: {
      description: "Balanced profile with OpenAI/media/game split routing.",
      groups: [
        {
          tag: "proxy",
          matchAny: [".*"],
          autoTest: true,
          allowManual: true
        },
        {
          tag: "openai",
          matchAny: ["美国", "\\bUS\\b", "新加坡", "\\bSG\\b", "日本", "\\bJP\\b"],
          autoTest: true,
          allowManual: true,
          fallback: "proxy"
        },
        {
          tag: "media",
          matchAny: ["香港", "\\bHK\\b", "台湾", "\\bTW\\b", "日本", "\\bJP\\b", "新加坡", "\\bSG\\b", "美国", "\\bUS\\b"],
          autoTest: true,
          allowManual: true,
          fallback: "proxy"
        },
        {
          tag: "gaming",
          matchAny: ["香港", "\\bHK\\b", "台湾", "\\bTW\\b", "日本", "\\bJP\\b", "新加坡", "\\bSG\\b"],
          autoTest: true,
          allowManual: true,
          fallback: "proxy"
        }
      ],
      routes: [
        { ruleSet: "OpenAI", outbound: "openai" },
        { ruleSet: "GlobalMedia", outbound: "media" },
        { ruleSet: "Netflix", outbound: "media" },
        { ruleSet: "YouTube", outbound: "media" },
        { ruleSet: "Spotify", outbound: "media" },
        { ruleSet: "Steam", outbound: "gaming" },
        { ruleSet: "Telegram", outbound: "proxy" },
        { ruleSet: "GitHub", outbound: "proxy" },
        { ruleSet: "Google", outbound: "proxy" }
      ],
      final: "proxy"
    },
    global: {
      description: "Everything except LAN/private goes through the fastest proxy.",
      groups: [
        {
          tag: "proxy",
          matchAny: [".*"],
          autoTest: true,
          allowManual: true
        }
      ],
      routes: [],
      final: "proxy"
    }
  }
};

if (typeof addEventListener === "function") {
  addEventListener("fetch", function (event) {
    event.respondWith(handleRequest(event.request, event));
  });
}

async function handleRequest(request, event) {
  try {
    var url = new URL(request.url);
    var path = normalizePath(url.pathname);
    var settings = getSettings();
    var bypassCache = shouldBypassCache(request, url) || shouldSkipAuthSensitiveCache(url, settings);

    if (path === "/") {
      return jsonResponse({
        name: "singbox-manager",
        description: "Cloudflare-hosted sing-box config generator",
        endpoints: {
          profiles: "/profiles",
          config: "/config/:profile.json?access_token=YOUR_TOKEN",
          advanced_config: "/config/:profile.json?device=apple|desktop|proxy|tun&compat=legacy|modern&access_token=YOUR_TOKEN",
          rules: "/rules/:ruleSet.json?access_token=YOUR_TOKEN",
          health: "/health"
        },
        profiles: Object.keys(settings.profiles),
        default_device: "apple",
        default_compat: "legacy",
        configured: Boolean(settings.subscriptionUrl)
      });
    }

    if (path === "/health") {
      return jsonResponse({ ok: true, now: new Date().toISOString() });
    }

    if (path === "/profiles") {
      if (!isAuthorized(request, url, settings)) {
        return unauthorizedResponse();
      }
      return jsonResponse({
        profiles: simplifyProfiles(settings),
        ruleSets: Object.keys(settings.ruleSets)
      });
    }

    if (path.indexOf("/config/") === 0) {
      if (!isAuthorized(request, url, settings)) {
        return unauthorizedResponse();
      }
      if (!settings.subscriptionUrl) {
        return jsonResponse({ error: "Missing SUBSCRIPTION_URL binding" }, 500);
      }
      if (!bypassCache) {
        var cachedConfig = await matchCache(request);
        if (cachedConfig) {
          return cachedConfig;
        }
      }
      var configResponse = await handleConfigRequest(request, url, settings);
      if (!bypassCache && configResponse.ok) {
        event.waitUntil(putCache(request, configResponse.clone()));
      }
      return configResponse;
    }

    if (path === "/admin/subscription") {
      if (!isAdminAuthorized(request, url, settings)) {
        return unauthorizedResponse();
      }
      return await handleAdminSubscriptionRequest(request, settings);
    }

    if (path === "/admin/subscription/sync") {
      if (!isAdminAuthorized(request, url, settings)) {
        return unauthorizedResponse();
      }
      return await handleAdminSubscriptionSync(settings);
    }

    if (path.indexOf("/rules/") === 0 && path.slice(-5) === ".json") {
      if (!isAuthorized(request, url, settings)) {
        return unauthorizedResponse();
      }
      if (!bypassCache) {
        var cachedRules = await matchCache(request);
        if (cachedRules) {
          return cachedRules;
        }
      }
      var ruleResponse = await handleRuleRequest(request, url, settings);
      if (!bypassCache && ruleResponse.ok) {
        event.waitUntil(putCache(request, ruleResponse.clone()));
      }
      return ruleResponse;
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    return jsonResponse({
      error: error && error.message ? error.message : "Internal error"
    }, 500);
  }
}

async function handleConfigRequest(request, url, settings) {
  var profileName = stripExtension(lastPathPart(url.pathname), ".json");
  var profile = settings.profiles[profileName];

  if (!profile) {
    return jsonResponse({ error: "Unknown profile", profile: profileName }, 404);
  }

  var device = normalizeDevice(url.searchParams.get("device"));
  var compat = normalizeCompatibility(url.searchParams.get("compat"), device);
  var rawSubscription = await loadSubscriptionText(settings);
  var subscription = parseSubscription(rawSubscription);

  if (!subscription.outbounds.length) {
    return jsonResponse({
      error: "Subscription did not contain any supported nodes",
      unsupported: subscription.unsupported
    }, 502);
  }

  var generated = buildSingBoxConfig({
    requestUrl: url,
    settings: settings,
    profileName: profileName,
    profile: profile,
    device: device,
    compat: compat,
    nodes: subscription.outbounds
  });

  return jsonResponse(generated, 200, {
    "cache-control": "public, max-age=" + settings.configCacheTtl,
    "x-singbox-manager-profile": profileName,
    "x-singbox-manager-device": device,
    "x-singbox-manager-compat": compat,
    "x-singbox-manager-nodes": String(subscription.outbounds.length),
    "x-singbox-manager-unsupported": String(subscription.unsupported.length)
  });
}

async function handleRuleRequest(request, url, settings) {
  var ruleName = stripExtension(lastPathPart(url.pathname), ".json");
  var ruleMeta = settings.ruleSets[ruleName];

  if (!ruleMeta) {
    return jsonResponse({ error: "Unknown rule set", ruleSet: ruleName }, 404);
  }

  var upstreamUrl = settings.ruleRepoBase.replace(/\/$/, "") + "/" + ruleMeta.path;
  var rawList = await fetchText(upstreamUrl, {
    headers: settings.subscriptionHeaders,
    timeoutMs: settings.upstreamTimeoutMs
  });
  var converted = convertRuleList(ruleName, rawList);

  return jsonResponse(converted.body, 200, {
    "cache-control": "public, max-age=" + settings.ruleCacheTtl,
    "x-singbox-manager-rule": ruleName,
    "x-singbox-manager-skipped": String(converted.skipped.length)
  });
}

async function handleAdminSubscriptionRequest(request, settings) {
  if (request.method === "GET") {
    return jsonResponse(await getSubscriptionSnapshotStatus(settings));
  }

  if (request.method !== "PUT" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  var body = await request.text();
  if (!String(body || "").trim()) {
    return jsonResponse({ error: "Empty subscription body" }, 400);
  }

  await storeSubscriptionSnapshot(settings, body, "manual-upload");
  var parsed = parseSubscription(body);

  return jsonResponse({
    ok: true,
    source: "manual-upload",
    nodes: parsed.outbounds.length,
    unsupported: parsed.unsupported.length,
    stored_at: new Date().toISOString()
  });
}

async function handleAdminSubscriptionSync(settings) {
  try {
    var liveText = await fetchText(settings.subscriptionUrl, {
      headers: settings.subscriptionHeaders,
      timeoutMs: settings.upstreamTimeoutMs
    });
    await storeSubscriptionSnapshot(settings, liveText, "upstream-sync");
    var parsed = parseSubscription(liveText);
    return jsonResponse({
      ok: true,
      source: "upstream-sync",
      nodes: parsed.outbounds.length,
      unsupported: parsed.unsupported.length,
      stored_at: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error && error.message ? error.message : String(error),
      snapshot: await getSubscriptionSnapshotStatus(settings)
    }, 502);
  }
}

function buildSingBoxConfig(input) {
  var accessToken = input.settings.accessToken || input.requestUrl.searchParams.get("access_token") || "";
  var resolvedNodes = applyOutboundDomainResolver(input.nodes, "dns-direct");
  var proxyGroups = buildProxyGroups(input.profile, resolvedNodes, input.settings);
  var routeRuleSets = buildRemoteRuleSets(input.requestUrl, input.settings, input.profile, accessToken);
  var routeRules = buildRouteRules(input.profile, proxyGroups.referenceMap);
  var outbounds = []
    .concat([
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ])
    .concat(proxyGroups.outbounds)
    .concat(resolvedNodes);

  var config = {
    log: {
      level: "info",
      timestamp: true
    },
    experimental: {
      cache_file: {
        enabled: true
      }
    },
    dns: {
      strategy: "prefer_ipv4",
      servers: [
        {
          type: "https",
          tag: "dns-remote",
          server: "cloudflare-dns.com",
          server_port: 443,
          path: "/dns-query",
          tls: {
            enabled: true,
            server_name: "cloudflare-dns.com"
          },
          domain_resolver: "dns-direct",
          detour: proxyGroups.defaultDetour
        },
        {
          type: "local",
          tag: "dns-direct",
          prefer_go: false
        }
      ],
      rules: [
        {
          domain_suffix: [".local"],
          action: "route",
          server: "dns-direct"
        },
        {
          query_type: ["A", "AAAA", "HTTPS"],
          action: "route",
          server: "dns-remote",
          strategy: "prefer_ipv4"
        }
      ],
      final: "dns-remote"
    },
    inbounds: buildInbounds(input.device),
    outbounds: outbounds,
    route: {
      auto_detect_interface: true,
      default_domain_resolver: "dns-direct",
      final: proxyGroups.defaultDetour,
      rule_set: routeRuleSets,
      rules: routeRules
    }
  };

  if (input.compat === "legacy") {
    return toLegacyCompatibleConfig(config);
  }

  return config;
}

function applyOutboundDomainResolver(nodes, resolverTag) {
  var results = [];
  for (var i = 0; i < nodes.length; i += 1) {
    var outbound = clone(nodes[i]);
    if (outbound.server && !isIpAddress(outbound.server) && !outbound.domain_resolver) {
      outbound.domain_resolver = resolverTag;
    }
    results.push(outbound);
  }
  return results;
}

function buildInbounds(device) {
  var sharedTun = {
    type: "tun",
    tag: "tun-in",
    address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
    mtu: 9000,
    auto_route: true,
    strict_route: true,
    stack: "mixed"
  };
  var appleTun = {
    type: "tun",
    tag: "tun-in",
    address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
    mtu: 1400,
    auto_route: true,
    strict_route: true
  };

  if (device === "proxy") {
    return [
      {
        type: "mixed",
        tag: "mixed-in",
        listen: "127.0.0.1",
        listen_port: 7890,
        sniff: true,
        sniff_override_destination: true
      }
    ];
  }

  if (device === "apple" || device === "ios") {
    return [appleTun];
  }

  sharedTun.interface_name = "singbox0";

  if (device === "desktop") {
    return [
      sharedTun,
      {
        type: "mixed",
        tag: "mixed-in",
        listen: "127.0.0.1",
        listen_port: 7890,
        sniff: true,
        sniff_override_destination: true
      }
    ];
  }

  return [sharedTun];
}

function normalizeDevice(device) {
  var normalized = String(device || "apple").toLowerCase();
  if (normalized === "default" || normalized === "ios") {
    return "apple";
  }
  if (normalized === "apple" || normalized === "desktop" || normalized === "proxy" || normalized === "tun") {
    return normalized;
  }
  return "apple";
}

function normalizeCompatibility(compat, device) {
  var normalized = String(compat || "").toLowerCase();
  if (normalized === "legacy" || normalized === "modern") {
    return normalized;
  }
  return device === "apple" ? "legacy" : "modern";
}

function toLegacyCompatibleConfig(config) {
  var legacy = clone(config);
  if (legacy.dns && legacy.dns.servers && legacy.dns.servers.length) {
    legacy.dns.servers = [
      {
        tag: "dns-remote",
        address: "local"
      },
      {
        tag: "dns-direct",
        address: "local"
      }
    ];
  }

  if (legacy.dns && legacy.dns.rules) {
    for (var j = 0; j < legacy.dns.rules.length; j += 1) {
      delete legacy.dns.rules[j].strategy;
    }
  }

  if (legacy.route) {
    delete legacy.route.default_domain_resolver;
  }

  if (legacy.outbounds) {
    for (var k = 0; k < legacy.outbounds.length; k += 1) {
      delete legacy.outbounds[k].domain_resolver;
    }
  }

  return legacy;
}

function buildProxyGroups(profile, nodes, settings) {
  var outbounds = [];
  var referenceMap = {};

  for (var i = 0; i < profile.groups.length; i += 1) {
    var group = profile.groups[i];
    var matched = matchNodes(nodes, group);
    var members = matched.length ? matched : (group.fallback ? [] : listNodeTags(nodes));
    var autoTag = group.tag + "-auto";
    var selectorMembers = [];

    if (group.autoTest !== false && members.length > 1) {
      outbounds.push({
        type: "urltest",
        tag: autoTag,
        outbounds: members,
        url: settings.defaultTestUrl,
        interval: "3m",
        tolerance: 150,
        idle_timeout: "30m",
        interrupt_exist_connections: true
      });
      selectorMembers.push(autoTag);
    }

    selectorMembers = selectorMembers.concat(members);
    if (group.fallback && selectorMembers.indexOf(group.fallback) === -1) {
      selectorMembers.push(group.fallback);
    }

    if (group.allowManual === false || selectorMembers.length === 1) {
      referenceMap[group.tag] = selectorMembers[0];
      continue;
    }

    outbounds.push({
      type: "selector",
      tag: group.tag,
      outbounds: uniqueStrings(selectorMembers),
      default: selectorMembers[0],
      interrupt_exist_connections: true
    });
    referenceMap[group.tag] = group.tag;
  }

  return {
    outbounds: outbounds,
    referenceMap: referenceMap,
    defaultDetour: referenceMap[profile.final] || profile.final || "direct"
  };
}

function buildRemoteRuleSets(requestUrl, settings, profile, accessToken) {
  var origin = requestUrl.origin;
  var results = [];
  var used = {};
  var routes = profile.routes || [];

  for (var i = 0; i < routes.length; i += 1) {
    var ruleName = routes[i].ruleSet;
    if (used[ruleName] || !settings.ruleSets[ruleName]) {
      continue;
    }
    used[ruleName] = true;
    results.push({
      type: "remote",
      tag: "rs-" + slugify(ruleName),
      format: "source",
      url: appendAccessToken(origin + "/rules/" + encodeURIComponent(ruleName) + ".json", accessToken),
      download_detour: "direct",
      update_interval: settings.defaultRuleUpdateInterval
    });
  }

  return results;
}

function buildRouteRules(profile, referenceMap) {
  var rules = buildBaseRouteRules();
  var routes = profile.routes || [];

  for (var i = 0; i < routes.length; i += 1) {
    var route = routes[i];
    rules.push({
      rule_set: ["rs-" + slugify(route.ruleSet)],
      action: "route",
      outbound: referenceMap[route.outbound] || route.outbound
    });
  }

  return rules;
}

function buildBaseRouteRules() {
  return [
    {
      action: "sniff"
    },
    {
      type: "logical",
      mode: "or",
      rules: [
        {
          protocol: "dns"
        },
        {
          port: 53
        }
      ],
      action: "hijack-dns"
    },
    {
      ip_is_private: true,
      action: "route",
      outbound: "direct"
    },
    {
      domain_suffix: [".local"],
      action: "route",
      outbound: "direct"
    }
  ];
}

function parseSubscription(text) {
  var normalized = String(text || "").trim();
  var decoded = normalized.indexOf("://") >= 0 ? normalized : safeBase64Decode(normalized);
  var lines = decoded.split(/\r?\n/);
  var outbounds = [];
  var unsupported = [];
  var seen = {};

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line) {
      continue;
    }
    try {
      var outbound = parseProxyUri(line);
      if (isInformationalTag(outbound.tag)) {
        continue;
      }
      outbound.tag = dedupeTag(outbound.tag, seen);
      outbounds.push(outbound);
    } catch (error) {
      unsupported.push({
        line: line.slice(0, 160),
        error: error && error.message ? error.message : String(error)
      });
    }
  }

  return { outbounds: outbounds, unsupported: unsupported };
}

function parseProxyUri(uri) {
  var scheme = uri.split("://")[0].toLowerCase();
  if (scheme === "vless") {
    return parseVlessUri(uri);
  }
  if (scheme === "trojan") {
    return parseTrojanUri(uri);
  }
  if (scheme === "ss") {
    return parseShadowsocksUri(uri);
  }
  if (scheme === "vmess") {
    return parseVmessUri(uri);
  }
  if (scheme === "hy2" || scheme === "hysteria2") {
    return parseHysteria2Uri(uri);
  }
  throw new Error("Unsupported scheme: " + scheme);
}

function parseVlessUri(uri) {
  var parsed = new URL(uri);
  var params = parsed.searchParams;
  var transportType = (params.get("type") || "tcp").toLowerCase();
  var security = (params.get("security") || "").toLowerCase();
  var outbound = {
    type: "vless",
    tag: decodeLabel(parsed.hash) || buildDefaultTag(parsed.hostname, parsed.port, "vless"),
    server: parsed.hostname,
    server_port: parsePort(parsed.port, 443),
    uuid: decodeURIComponent(parsed.username)
  };

  if (params.get("flow")) {
    outbound.flow = params.get("flow");
  }

  applyTls(outbound, parsed.hostname, params, security);
  applyTransport(outbound, transportType, params);
  return outbound;
}

function parseTrojanUri(uri) {
  var parsed = new URL(uri);
  var params = parsed.searchParams;
  var transportType = (params.get("type") || "tcp").toLowerCase();
  var outbound = {
    type: "trojan",
    tag: decodeLabel(parsed.hash) || buildDefaultTag(parsed.hostname, parsed.port, "trojan"),
    server: parsed.hostname,
    server_port: parsePort(parsed.port, 443),
    password: decodeURIComponent(parsed.username)
  };

  applyTls(outbound, parsed.hostname, params, "tls");
  applyTransport(outbound, transportType, params);
  return outbound;
}

function parseShadowsocksUri(uri) {
  var withoutScheme = uri.slice(5);
  var hashIndex = withoutScheme.indexOf("#");
  var beforeHash = hashIndex >= 0 ? withoutScheme.slice(0, hashIndex) : withoutScheme;
  var tag = hashIndex >= 0 ? decodeLabel(withoutScheme.slice(hashIndex)) : "";
  var main = beforeHash.split("?")[0];
  var atIndex = main.lastIndexOf("@");
  var serverPart = atIndex >= 0 ? main.slice(atIndex + 1) : "";
  var credsPart = atIndex >= 0 ? main.slice(0, atIndex) : main;
  var credentials = credsPart.indexOf(":") >= 0 ? credsPart : safeBase64Decode(credsPart);
  var credentialParts = credentials.split(":");
  var serverParts = serverPart.split(":");

  if (credentialParts.length < 2 || serverParts.length < 2) {
    throw new Error("Invalid shadowsocks URI");
  }

  return {
    type: "shadowsocks",
    tag: tag || buildDefaultTag(serverParts[0], serverParts[1], "ss"),
    server: serverParts[0],
    server_port: parsePort(serverParts[1], 443),
    method: credentialParts[0],
    password: credentialParts.slice(1).join(":")
  };
}

function parseVmessUri(uri) {
  var payload = safeBase64Decode(uri.slice(8));
  var data = JSON.parse(payload);
  var net = (data.net || "tcp").toLowerCase();
  var params = new URLSearchParams();

  if (data.path) {
    params.set("path", data.path);
  }
  if (data.host) {
    params.set("host", data.host);
  }
  if (data.sni) {
    params.set("sni", data.sni);
  }
  if (data.alpn) {
    params.set("alpn", data.alpn);
  }
  if (data.fp) {
    params.set("fp", data.fp);
  }

  var outbound = {
    type: "vmess",
    tag: data.ps || buildDefaultTag(data.add, data.port, "vmess"),
    server: data.add,
    server_port: parsePort(data.port, 443),
    uuid: data.id,
    security: data.scy || "auto",
    alter_id: parsePort(data.aid, 0)
  };

  if ((data.tls || "").toLowerCase() === "tls") {
    applyTls(outbound, data.add, params, "tls");
  }
  applyTransport(outbound, net, params);
  return outbound;
}

function parseHysteria2Uri(uri) {
  var parsed = new URL(uri.replace(/^hy2:\/\//i, "hysteria2://"));
  var params = parsed.searchParams;
  var outbound = {
    type: "hysteria2",
    tag: decodeLabel(parsed.hash) || buildDefaultTag(parsed.hostname, parsed.port, "hy2"),
    server: parsed.hostname,
    server_port: parsePort(parsed.port, 443),
    password: decodeURIComponent(parsed.username || parsed.password)
  };

  applyTls(outbound, parsed.hostname, params, "tls");
  return outbound;
}

function applyTls(outbound, fallbackServerName, params, security) {
  var normalized = String(security || "").toLowerCase();
  if (!normalized || normalized === "none") {
    return;
  }

  var tls = {
    enabled: true,
    server_name: params.get("sni") || fallbackServerName
  };

  if (isTruthy(params.get("allowInsecure")) || isTruthy(params.get("insecure"))) {
    tls.insecure = true;
  }

  if (params.get("alpn")) {
    tls.alpn = splitCsv(params.get("alpn"));
  }

  if (params.get("fp")) {
    tls.utls = {
      enabled: true,
      fingerprint: params.get("fp")
    };
  }

  if (normalized === "reality") {
    tls.reality = {
      enabled: true,
      public_key: params.get("pbk") || "",
      short_id: params.get("sid") || ""
    };
  }

  outbound.tls = tls;
}

function applyTransport(outbound, transportType, params) {
  if (transportType === "ws") {
    outbound.transport = {
      type: "ws",
      path: params.get("path") || "/"
    };
    if (params.get("host")) {
      outbound.transport.headers = { Host: params.get("host") };
    }
    return;
  }

  if (transportType === "grpc") {
    outbound.transport = {
      type: "grpc",
      service_name: params.get("serviceName") || params.get("service_name") || ""
    };
    return;
  }

  if (transportType === "http") {
    outbound.transport = {
      type: "http",
      path: params.get("path") || "/",
      host: splitCsv(params.get("host"))
    };
  }
}

function convertRuleList(ruleName, rawList) {
  var lines = String(rawList || "").split(/\r?\n/);
  var exact = [];
  var suffix = [];
  var keyword = [];
  var cidr = [];
  var skipped = [];

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#") {
      continue;
    }

    var parts = line.split(",");
    var type = String(parts[0] || "").trim().toUpperCase();
    var value = String(parts[1] || "").trim();

    if (!value) {
      skipped.push({ line: line, reason: "missing-value" });
      continue;
    }

    if (type === "DOMAIN") {
      exact.push(value);
      continue;
    }
    if (type === "DOMAIN-SUFFIX") {
      suffix.push(normalizeDomainSuffix(value));
      continue;
    }
    if (type === "DOMAIN-KEYWORD") {
      keyword.push(value);
      continue;
    }
    if (type === "IP-CIDR" || type === "IP-CIDR6") {
      cidr.push(value);
      continue;
    }

    skipped.push({ line: line, reason: "unsupported-rule-type:" + type });
  }

  var rules = [];
  if (exact.length) {
    rules.push({ domain: uniqueStrings(exact) });
  }
  if (suffix.length) {
    rules.push({ domain_suffix: uniqueStrings(suffix) });
  }
  if (keyword.length) {
    rules.push({ domain_keyword: uniqueStrings(keyword) });
  }
  if (cidr.length) {
    rules.push({ ip_cidr: uniqueStrings(cidr) });
  }

  return {
    skipped: skipped,
    body: {
      version: 2,
      rules: rules
    }
  };
}

async function fetchText(url, options) {
  var requestOptions = cloneRequestOptions(options);
  var timeoutMs = requestOptions.timeoutMs || BASE_CONFIG.upstreamTimeoutMs;
  var controller = typeof AbortController === "function" ? new AbortController() : null;
  var timer = null;

  delete requestOptions.timeoutMs;
  if (controller && timeoutMs > 0) {
    requestOptions.signal = controller.signal;
    timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
  }

  try {
    var response = await fetch(url, requestOptions);
    if (!response.ok) {
      throw new Error("Upstream fetch failed: " + response.status + " " + response.statusText);
    }
    return response.text();
  } catch (error) {
    if (controller && controller.signal && controller.signal.aborted) {
      throw new Error("Upstream fetch timed out after " + timeoutMs + "ms");
    }
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function loadSubscriptionText(settings) {
  var liveError = null;

  if (settings.subscriptionUrl) {
    try {
      return await fetchText(settings.subscriptionUrl, {
        headers: settings.subscriptionHeaders,
        timeoutMs: settings.upstreamTimeoutMs
      });
    } catch (error) {
      liveError = error;
    }
  }

  var snapshot = await readSubscriptionSnapshot(settings);
  if (snapshot) {
    return snapshot;
  }

  if (liveError) {
    throw liveError;
  }

  throw new Error("No subscription source configured");
}

async function readSubscriptionSnapshot(settings) {
  var cache = settings.snapshotStore;
  if (!cache || typeof cache.get !== "function") {
    return "";
  }
  var value = await cache.get("subscription/current");
  return value || "";
}

async function storeSubscriptionSnapshot(settings, content, source) {
  var cache = settings.snapshotStore;
  if (!cache || typeof cache.put !== "function") {
    throw new Error("SINGBOX_CACHE binding is missing");
  }
  var now = new Date().toISOString();
  await cache.put("subscription/current", String(content || "").trim());
  await cache.put("subscription/meta", JSON.stringify({
    updated_at: now,
    source: source || "unknown"
  }));
}

async function getSubscriptionSnapshotStatus(settings) {
  var cache = settings.snapshotStore;
  if (!cache || typeof cache.get !== "function") {
    return {
      available: false,
      binding: false
    };
  }

  var content = await cache.get("subscription/current");
  var metaRaw = await cache.get("subscription/meta");
  var meta = null;

  try {
    meta = metaRaw ? JSON.parse(metaRaw) : null;
  } catch (error) {
    meta = null;
  }

  return {
    available: Boolean(content),
    binding: true,
    updated_at: meta && meta.updated_at ? meta.updated_at : null,
    source: meta && meta.source ? meta.source : null,
    size: content ? content.length : 0
  };
}

function getSettings() {
  var settings = clone(BASE_CONFIG);
  settings.subscriptionUrl = getBinding("SUBSCRIPTION_URL", "");
  settings.accessToken = getBinding("ACCESS_TOKEN", "");
  settings.adminToken = getBinding("ADMIN_TOKEN", "");
  settings.snapshotStore = getBinding("SINGBOX_CACHE", null);
  settings.ruleRepoBase = getBinding("RULES_REPO_BASE", settings.ruleRepoBase);
  settings.defaultTestUrl = getBinding("DEFAULT_TEST_URL", settings.defaultTestUrl);
  settings.configCacheTtl = parsePort(getBinding("CONFIG_CACHE_TTL", settings.configCacheTtl), settings.configCacheTtl);
  settings.ruleCacheTtl = parsePort(getBinding("RULE_CACHE_TTL", settings.ruleCacheTtl), settings.ruleCacheTtl);
  settings.upstreamTimeoutMs = parsePort(getBinding("UPSTREAM_TIMEOUT_MS", settings.upstreamTimeoutMs), settings.upstreamTimeoutMs);
  settings.defaultRuleUpdateInterval = getBinding("DEFAULT_RULE_UPDATE_INTERVAL", settings.defaultRuleUpdateInterval);

  return settings;
}

function getBinding(name, fallbackValue) {
  if (typeof globalThis !== "undefined" && Object.prototype.hasOwnProperty.call(globalThis, name)) {
    return globalThis[name];
  }
  return fallbackValue;
}

function isAuthorized(request, url, settings) {
  if (!settings.accessToken) {
    return true;
  }
  var headerToken = request.headers.get("x-access-token");
  var authHeader = request.headers.get("authorization");
  var bearerToken = authHeader && authHeader.toLowerCase().indexOf("bearer ") === 0 ? authHeader.slice(7) : "";
  var queryToken = url.searchParams.get("access_token");
  return headerToken === settings.accessToken || bearerToken === settings.accessToken || queryToken === settings.accessToken;
}

function isAdminAuthorized(request, url, settings) {
  if (!settings.adminToken) {
    return false;
  }
  var headerToken = request.headers.get("x-admin-token");
  var authHeader = request.headers.get("authorization");
  var bearerToken = authHeader && authHeader.toLowerCase().indexOf("bearer ") === 0 ? authHeader.slice(7) : "";
  var queryToken = url.searchParams.get("admin_token");
  return headerToken === settings.adminToken || bearerToken === settings.adminToken || queryToken === settings.adminToken;
}

function shouldBypassCache(request, url) {
  var refresh = url.searchParams.get("refresh");
  if (request.method !== "GET" || refresh !== "1") {
    return false;
  }
  var adminToken = getBinding("ADMIN_TOKEN", "");
  if (!adminToken) {
    return true;
  }
  var headerToken = request.headers.get("x-admin-token");
  var queryToken = url.searchParams.get("admin_token");
  return headerToken === adminToken || queryToken === adminToken;
}

function shouldSkipAuthSensitiveCache(url, settings) {
  return Boolean(settings.accessToken && !url.searchParams.get("access_token"));
}

function simplifyProfiles(settings) {
  var result = {};
  var names = Object.keys(settings.profiles);
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i];
    result[name] = {
      description: settings.profiles[name].description,
      groups: settings.profiles[name].groups.map(function (group) {
        return group.tag;
      }),
      routes: settings.profiles[name].routes.map(function (route) {
        return route.ruleSet + " -> " + route.outbound;
      })
    };
  }
  return result;
}

function matchNodes(nodes, group) {
  var results = [];
  for (var i = 0; i < nodes.length; i += 1) {
    if (nodeMatchesGroup(nodes[i], group)) {
      results.push(nodes[i].tag);
    }
  }
  return uniqueStrings(results);
}

function nodeMatchesGroup(node, group) {
  if (group.members && group.members.length) {
    for (var i = 0; i < group.members.length; i += 1) {
      if (node.tag === group.members[i]) {
        return true;
      }
    }
    return false;
  }

  var include = group.matchAny || [];
  var exclude = group.excludeAny || [];
  var tag = node.tag;
  var included = include.length === 0;

  for (var j = 0; j < include.length; j += 1) {
    if (safeRegexTest(include[j], tag)) {
      included = true;
      break;
    }
  }

  if (!included) {
    return false;
  }

  for (var k = 0; k < exclude.length; k += 1) {
    if (safeRegexTest(exclude[k], tag)) {
      return false;
    }
  }

  return true;
}

function appendAccessToken(url, accessToken) {
  if (!accessToken) {
    return url;
  }
  var target = new URL(url);
  target.searchParams.set("access_token", accessToken);
  return target.toString();
}

function listNodeTags(nodes) {
  var results = [];
  for (var i = 0; i < nodes.length; i += 1) {
    results.push(nodes[i].tag);
  }
  return results;
}

function safeRegexTest(pattern, value) {
  try {
    return new RegExp(pattern, "i").test(value);
  } catch (error) {
    return String(value).toLowerCase().indexOf(String(pattern).toLowerCase()) >= 0;
  }
}

function matchCache(request) {
  return caches.default.match(request);
}

function putCache(request, response) {
  return caches.default.put(request, response);
}

function jsonResponse(data, status, extraHeaders) {
  var headers = {
    "content-type": "application/json; charset=utf-8"
  };
  var headerNames = Object.keys(extraHeaders || {});
  for (var i = 0; i < headerNames.length; i += 1) {
    headers[headerNames[i]] = extraHeaders[headerNames[i]];
  }
  return new Response(JSON.stringify(data, null, 2), {
    status: status || 200,
    headers: headers
  });
}

function unauthorizedResponse() {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

function normalizePath(pathname) {
  var normalized = pathname || "/";
  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/, "");
  }
  return normalized || "/";
}

function stripExtension(value, extension) {
  if (value.slice(-extension.length) === extension) {
    return value.slice(0, value.length - extension.length);
  }
  return value;
}

function lastPathPart(pathname) {
  var parts = pathname.split("/");
  return parts[parts.length - 1] || "";
}

function dedupeTag(tag, seen) {
  var base = cleanupTag(tag);
  if (!seen[base]) {
    seen[base] = 1;
    return base;
  }
  seen[base] += 1;
  return base + " #" + seen[base];
}

function cleanupTag(tag) {
  return String(tag || "proxy-node").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function isInformationalTag(tag) {
  var value = cleanupTag(tag);
  return /剩余流量|下次重置|套餐到期|官网|工单|使用教程|流量重置|到期时间/i.test(value);
}

function decodeLabel(hash) {
  if (!hash) {
    return "";
  }
  var value = hash.charAt(0) === "#" ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(value).trim();
  } catch (error) {
    return value.trim();
  }
}

function parsePort(value, fallbackValue) {
  var port = parseInt(value, 10);
  return isFinite(port) ? port : fallbackValue;
}

function buildDefaultTag(host, port, prefix) {
  return prefix + "-" + host + ":" + port;
}

function normalizeDomainSuffix(value) {
  return value.charAt(0) === "." ? value : "." + value;
}

function splitCsv(value) {
  if (!value) {
    return [];
  }
  return String(value).split(",").map(function (item) {
    return item.trim();
  }).filter(Boolean);
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function isIpAddress(value) {
  return /^[0-9.]+$/.test(String(value || "")) || String(value || "").indexOf(":") >= 0;
}

function safeBase64Decode(value) {
  var normalized = String(value || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) {
    normalized += "=";
  }
  if (typeof atob === "function") {
    try {
      return decodeUtf8Binary(atob(normalized));
    } catch (error) {
      return atob(normalized);
    }
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(normalized, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available");
}

function decodeUtf8Binary(binary) {
  var encoded = "";
  for (var i = 0; i < binary.length; i += 1) {
    encoded += "%" + ("00" + binary.charCodeAt(i).toString(16)).slice(-2);
  }
  return decodeURIComponent(encoded);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneRequestOptions(value) {
  var result = {};
  var key;
  for (key in value || {}) {
    if (Object.prototype.hasOwnProperty.call(value || {}, key)) {
      result[key] = value[key];
    }
  }
  return result;
}

function uniqueStrings(values) {
  var seen = {};
  var results = [];
  for (var i = 0; i < values.length; i += 1) {
    var item = values[i];
    if (!item || seen[item]) {
      continue;
    }
    seen[item] = true;
    results.push(item);
  }
  return results;
}

function isTruthy(value) {
  if (value == null) {
    return false;
  }
  var normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}


if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BASE_CONFIG: BASE_CONFIG,
    parseSubscription: parseSubscription,
    convertRuleList: convertRuleList,
    buildProxyGroups: buildProxyGroups,
    buildRouteRules: buildRouteRules,
    parseProxyUri: parseProxyUri,
    buildSingBoxConfig: buildSingBoxConfig
  };
}
