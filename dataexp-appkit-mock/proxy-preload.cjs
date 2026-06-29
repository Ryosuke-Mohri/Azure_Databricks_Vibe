const https = require('node:https');
const http = require('node:http');
const { HttpsProxyAgent } = require('https-proxy-agent');
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

if (proxy) {
  const proxyAgent = new HttpsProxyAgent(proxy);
  https.globalAgent = proxyAgent;
  http.globalAgent = proxyAgent;

  const OrigHttpsAgent = https.Agent;
  function PatchedAgent(opts) {
    if (!(this instanceof PatchedAgent)) return new PatchedAgent(opts);
    return new HttpsProxyAgent(proxy, opts);
  }
  PatchedAgent.prototype = OrigHttpsAgent.prototype;
  https.Agent = PatchedAgent;
}
