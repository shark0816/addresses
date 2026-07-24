// ============================================================
// 优选 IP 自动更新 Worker（改进版）
// 相比原 Bot1 的修复点：
//  1. bestcf 解析不再误抓时间戳(如 07:02)等垃圾，强制校验 host 为合法 IPv4/域名/IPv6
//  2. 所有条目统一为 host:port#remark 格式，兼容 WorkerVless2sub 的 ADDAPI 解析
//  3. 修复 btoa(String.fromCharCode(...)) 大文件栈溢出 + 中文乱码风险（分块 UTF-8 转 Base64）
//  4. 每个请求加超时(AbortController)，避免上游 hang 拖垮整个更新
//  5. bestcf 4 源并行拉取，速度更快、单源失败不影响其他源
//  6. 全局去重(host:port)，避免重复条目污染 addip.txt
//  7. 全部数据源失败时跳过本次写入，不覆盖掉已有好数据
//  8. GitHub 409(SHA 过期)自动重试一次
//  9. 自动过滤 bestcf 返回的 HTML 部署页/404 页
//  v2 修订：
//   - vps789/uouin 的地址加入 isValidHost 校验（保留优选域名，仅拒绝非法 host）
//   - 内容无变化则跳过 GitHub 提交，避免冗余 commit
//   - utf8ToBase64 改为逐字节拼接，彻底规避 apply/spread 的栈溢出风险
//   - 修正 bestcf 拉取结果的状态判断（fetchText 永不 reject，原 r.status 分支为死代码）
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/update") {
      return await updateAndCommit(env);
    }
    return new Response("服务运行中，访问 /update 更新", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateAndCommit(env));
  }
};

// ============ 配置 ============
const FETCH_TIMEOUT = 12000;     // 单个数据源请求超时(ms)
const GITHUB_TIMEOUT = 20000;    // GitHub API 超时(ms)
const PER_SOURCE_LIMIT = 60;     // 每个源最多保留条数

// ============ 工具：带超时的 fetch（返回 {ok,text,status}） ============
async function fetchText(url, timeout = FETCH_TIMEOUT, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) {
      clearTimeout(timer);
      return { ok: false, status: res.status };
    }
    const text = await res.text();
    clearTimeout(timer);
    return { ok: true, text };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message };
  }
}

// ============ 工具：UTF-8 字符串 -> Base64（逐字节拼接，彻底避免 apply/spread 的栈溢出风险，支持中文） ============
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============ 工具：Base64 -> UTF-8 字符串（用于比对 GitHub 已有内容，避免冗余提交） ============
function base64ToUtf8(b64) {
  const binary = atob((b64 || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ============ 校验 host 是否合法（IPv4 / 域名） ============
function isValidHost(host) {
  if (!host) return false;
  // IPv4
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    return ipv4.slice(1).every(o => parseInt(o, 10) <= 255);
  }
  // IPv6 由调用方特殊处理后传入，这里不判断
  if (host.startsWith("[")) return true;
  // 纯数字（如 "07"）直接拒绝 -> 过滤时间戳 07:02 之类
  if (/^\d+$/.test(host)) return false;
  // 域名：必须含点，且各标签合法
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(host);
}

// ============ 解析单行文本为 {host, port}（失败返回 null） ============
function parseAddressToken(raw) {
  let line = (raw || "").trim();
  if (!line || line.startsWith("#") || line.startsWith("//")) return null;
  line = line.replace(/#.*$/, "").trim();   // 去掉行内注释
  if (!line) return null;
  const token = line.split(/\s+/)[0];        // 取首个 token

  // IPv6: [....]:port 或 [....]
  const ipv6 = /^\[[^\]]+\](?::(\d+))?$/.exec(token);
  if (ipv6) {
    const port = ipv6[1] ? parseInt(ipv6[1], 10) : 443;
    if (port < 1 || port > 65535) return null;
    return { host: token.replace(/:\d+$/, ""), port };
  }

  // 含端口：host:port
  if (token.includes(":")) {
    const idx = token.lastIndexOf(":");
    const host = token.slice(0, idx);
    const portStr = token.slice(idx + 1);
    if (!/^\d+$/.test(portStr)) return null;     // 端口必须纯数字
    const port = parseInt(portStr, 10);
    if (port < 1 || port > 65535) return null;
    if (!isValidHost(host)) return null;          // 过滤 07:02 等垃圾
    return { host, port };
  }

  // 无端口：仅 host，默认 443
  if (!isValidHost(token)) return null;
  return { host: token, port: 443 };
}

// ============ 核心更新：拉取 -> 写 GitHub ============
async function updateAndCommit(env) {
  console.log("🚀 开始执行 IP 更新任务...");

  const GITHUB_TOKEN = env.GITHUB_TOKEN;
  const GITHUB_OWNER = env.GITHUB_OWNER;
  const GITHUB_REPO = env.GITHUB_REPO;

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error("❌ 环境变量未正确设置");
    return new Response("❌ 环境变量未设置", { status: 500 });
  }

  const githubHeaders = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "User-Agent": "Cloudflare-Worker-IP-Updater",
    "Accept": "application/vnd.github.v3+json"
  };
  const filePath = "addip.txt";
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  try {
    const newContent = await updateIPs();

    // 全部数据源失败时，保留旧文件，不覆盖
    if (!newContent || !newContent.trim()) {
      console.error("❌ 所有数据源均失败，跳过本次写入");
      return new Response("⚠️ 数据源全部失败，未更新", { status: 200 });
    }

    // 获取现有 sha（用于更新已有文件）+ 已有内容（用于判断是否有变化）
    let sha = null;
    let existingContent = null;
    const getRes = await fetchText(apiUrl, GITHUB_TIMEOUT, githubHeaders);
    if (getRes.ok) {
      try {
        const json = JSON.parse(getRes.text);
        sha = json.sha;
        if (json.content) existingContent = base64ToUtf8(json.content);
      } catch (e) {}
    } else if (getRes.status && getRes.status !== 404) {
      console.warn("获取 SHA 返回:", getRes.status);
    }

    // 内容无变化则跳过提交，避免冗余 commit
    if (existingContent !== null && existingContent.trim() === newContent.trim()) {
      console.log("ℹ️ 内容无变化，跳过提交");
      return new Response("ℹ️ 内容无变化，未更新", { status: 200 });
    }

    const putBody = {
      message: `Auto update IP list - ${new Date().toISOString()}`,
      content: utf8ToBase64(newContent),
      sha: sha
    };

    let putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: githubHeaders,
      body: JSON.stringify(putBody)
    });

    // 409 = SHA 过期（并发更新），重试一次
    if (putRes.status === 409) {
      console.warn("⚠️ SHA 冲突，重试一次...");
      const r2 = await fetchText(apiUrl, GITHUB_TIMEOUT, githubHeaders);
      let sha2 = null;
      if (r2.ok) { try { sha2 = JSON.parse(r2.text).sha; } catch (e) {} }
      putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: githubHeaders,
        body: JSON.stringify({ ...putBody, sha: sha2 })
      });
    }

    if (putRes.ok) {
      console.log("✅ GitHub 更新成功！");
      return new Response("✅ 更新成功！addip.txt 已更新", { status: 200 });
    }

    const errText = await putRes.text();
    console.error("❌ GitHub 更新失败:", putRes.status, errText);
    return new Response("❌ GitHub 更新失败", { status: 500 });

  } catch (err) {
    console.error("❌ 更新异常:", err.message);
    return new Response(`❌ 更新失败: ${err.message}`, { status: 500 });
  }
}

// ============ 拉取所有数据源并拼装 addip.txt ============
async function updateIPs() {
  const baseHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };

  const seen = new Set();   // 全局去重 host:port
  let content = "";
  const push = (host, port, remark) => {
    const key = `${host}:${port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    content += `${host}:${port}#${remark}\n`;
    return true;
  };

  // ---- 1. vps789：综合优选 + 三网 ----
  try {
    const topRes = await fetchText("https://vps789.com/openApi/cfIpTop20", FETCH_TIMEOUT, baseHeaders);
    if (topRes.ok) {
      const topData = JSON.parse(topRes.text);
      (topData?.data?.good || []).slice(0, 10)
        .forEach((i, n) => { if (isValidHost(i.ip)) push(i.ip, 443, `综合优选(vps789)${n + 1}`); });
    }
  } catch (e) { console.warn("vps789 top 异常", e.message); }

  try {
    const dynRes = await fetchText("https://vps789.com/openApi/cfIpApi", FETCH_TIMEOUT, baseHeaders);
    if (dynRes.ok) {
      const dyn = JSON.parse(dynRes.text);
      (dyn?.data?.CT || []).slice(0, 10).forEach((i, n) => { if (isValidHost(i.ip)) push(i.ip, 443, `电信CT(vps789)${n + 1}`); });
      (dyn?.data?.CU || []).slice(0, 10).forEach((i, n) => { if (isValidHost(i.ip)) push(i.ip, 443, `联通CU(vps789)${n + 1}`); });
      (dyn?.data?.CM || []).slice(0, 10).forEach((i, n) => { if (isValidHost(i.ip)) push(i.ip, 443, `移动CM(vps789)${n + 1}`); });
    }
  } catch (e) { console.warn("vps789 运营商异常", e.message); }

  // ---- 2. uouin：全网优质 CF IP ----
  try {
    const uo = await fetchText("https://api.uouin.com/cloudflare.html", FETCH_TIMEOUT, baseHeaders);
    if (uo.ok) {
      const ips = (uo.text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b|\[[0-9a-fA-F:]+\]/g) || [])
        .filter(ip => isValidHost(ip));
      [...new Set(ips)].slice(0, 10)
        .forEach((ip, n) => push(ip, 443, `优选ip(uouin)${n + 1}`));
    }
  } catch (e) { console.warn("uouin 异常", e.message); }

  // ---- 3. bestcf：4 源并行拉取 ----
  const bestcfSources = [
    { url: "https://bestcf.pages.dev/xinyitang3/ipv4.txt", tag: "xinyitang3" },
    { url: "https://bestcf.pages.dev/tiancheng/all.txt", tag: "tiancheng" },
    { url: "https://bestcf.pages.dev/gslege/Cfxyz.txt", tag: "gslege" },
    { url: "https://bestcf.pages.dev/domain/ircf/all.txt", tag: "ircf" }
  ];

  const results = await Promise.allSettled(
    bestcfSources.map(src => fetchText(src.url, FETCH_TIMEOUT, baseHeaders))
  );

  bestcfSources.forEach((src, i) => {
    const r = results[i];
    if (!r.value.ok) {
      console.warn(`❌ ${src.tag} 拉取失败`, r.value.error || r.value.status);
      return;
    }
    const text = r.value.text;
    // 过滤 HTML 部署页 / 404 页（bestcf 路径失效时可能返回）
    if (/<(!doctype|html|head|body)/i.test(text)) {
      console.warn(`⚠️ ${src.tag} 返回疑似 HTML，跳过`);
      return;
    }

    const lines = text.split(/\r?\n/);
    let idx = 0, added = 0;
    for (const line of lines) {
      if (added >= PER_SOURCE_LIMIT) break;
      const parsed = parseAddressToken(line);
      if (!parsed) continue;
      idx++;
      if (push(parsed.host, parsed.port, `优选(bestcf-${src.tag})${idx}`)) added++;
    }
    console.log(`✅ ${src.tag} 有效 ${added} 条`);
  });

  return content;
}
