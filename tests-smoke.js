const assert = require('node:assert/strict');
const {
  parseSubscription,
  convertRuleList,
  parseProxyUri,
  buildProxyGroups,
  buildRouteRules,
} = require('./src/index.js');

(function testParseSubscription() {
  const lines = [
    'vless://11111111-1111-1111-1111-111111111111@example.com:443?type=ws&security=tls&path=%2Fws#US-Node',
    'trojan://password@example.org:443?type=tcp#JP-Node',
    'unknown://bad'
  ].join('\n');
  const result = parseSubscription(lines);
  assert.equal(result.outbounds.length, 2);
  assert.equal(result.unsupported.length, 1);
})();

(function testConvertRuleList() {
  const raw = [
    'DOMAIN,openai.com',
    'DOMAIN-SUFFIX,google.com',
    'DOMAIN-KEYWORD,netflix',
    'IP-CIDR,1.1.1.0/24',
    'URL-REGEX,^https://example.com'
  ].join('\n');
  const converted = convertRuleList('test', raw);
  assert.equal(converted.body.version, 2);
  assert.equal(converted.body.rules.length, 4);
  assert.equal(converted.skipped.length, 1);
})();

(function testVmessParsing() {
  const payload = Buffer.from(JSON.stringify({
    v: '2',
    ps: 'VMESS-1',
    add: 'vm.example.com',
    port: '443',
    id: '11111111-1111-1111-1111-111111111111',
    aid: '0',
    net: 'ws',
    path: '/ws',
    host: 'vm.example.com',
    tls: 'tls'
  })).toString('base64');
  const outbound = parseProxyUri(`vmess://${payload}`);
  assert.equal(outbound.type, 'vmess');
  assert.equal(outbound.transport.type, 'ws');
  assert.equal(outbound.tls.enabled, true);
})();

(function testRouteFallback() {
  const nodes = [{ tag: 'US-1' }, { tag: 'JP-1' }];
  const profile = {
    groups: [
      { tag: 'proxy', matchAny: ['.*'], autoTest: true, allowManual: true },
      { tag: 'openai', matchAny: ['SG'], fallback: 'proxy', autoTest: true, allowManual: true }
    ],
    routes: [{ ruleSet: 'OpenAI', outbound: 'openai' }],
    final: 'proxy'
  };
  const grouped = buildProxyGroups(profile, nodes, { defaultTestUrl: 'https://www.gstatic.com/generate_204' });
  const rules = buildRouteRules(profile, grouped.referenceMap);
  assert.equal(grouped.referenceMap.openai, 'proxy');
  assert.equal(rules[2].outbound, 'proxy');
})();

console.log('tests-smoke passed');
