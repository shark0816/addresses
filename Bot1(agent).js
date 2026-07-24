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

// ==================== 配置 ====================
const FETCH_TIMEOUT = 12000;       // 数据源请求超时 (ms)
const GITHUB_TIMEOUT = 20000;      // GitHub API 超时 (ms)
const PER_SOURCE_LIMIT = 60;       // 每个 bestcf 源最多保留条数

// ==================== 工具函数 ====================

/** 校验 host 是否合法（IPv4 / IPv6 / 域名），拒绝纯数字等垃圾 */
function isValidHost(host) {
  if (!host || typeof host !== "string") return false;
  // IPv4
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) return ipv4.slice(1).every(o => +o <= 255);
  // IPv6（可带方括号）
  if (/^\[[\da-fA-F:.]+\]$/.test(host)) return true;
  if (host.includes(":") && !host.includes(".")) {
    const parts = host.split(":");
    if (parts.length < 2 || parts.length > 8) return false;
    let empty = 0;
    for (const p of parts) {
      if (p === "") { empty++; continue; }
      if (!/^[\da-fA-F]{1,4}$/.test(p)) return false;
    }
    return empty <= 1;
  }
  // 纯数字 → 拒绝（过滤 07:02 类时间戳垃圾）
  if (/^\d+$/.test(host)) return false;
  // 域名：必须含点，各标签合法
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(host);
}

/** 解析单行文本为 {host, port}，失败返回 null */
function parseAddressToken(raw) {
  let line = (raw || "").trim();
  if (!line || line.startsWith("#") || line.startsWith("//")) return null;
  line = line.replace(/#.*$/, "").trim();
  if (!line) return null;
  const token = line.split(/\s+/)[0];

  // IPv6: [....]:port
  const ipv6 = /^\[[\da-fA-F:.]+](?::(\d+))?$/.exec(token);
  if (ipv6) {
    const port = ipv6[1] ? parseInt(ipv6[1], 10) : 443;
    if (port < 1 || port > 65535) return null;
    return { host: token.replace(/:\d+$/, ""), port };
  }

  // 含冒号 → host:port
  if (token.includes(":")) {
    const idx = token.lastIndexOf(":");
    const host = token.slice(0, idx);
    const portStr = token.slice(idx + 1);
    if (!/^\d+$/.test(portStr)) return null;
    const port = parseInt(portStr, 10);
    if (port < 1 || port > 65535) return null;
    if (!isValidHost(host)) return null;
    return { host, port };
  }

  // 无端口 → 默认 443
  if (!isValidHost(token)) return null;
  return { host: token, port: 443 };
}

/** IP/域名 去重 key 标准化 */
function normalizeHost(host) {
  return host.replace(/^\[|\]$/g, "").toLowerCase();
}

/** UTF-8 → Base64（逐字节拼接，避免大数组 spread / apply 溢出） */
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Base64 → UTF-8 字符串（正确处理中文，用于比对已有内容） */
function base64ToUtf8(b64) {
  const binary = atob((b64 || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 带超时的 fetch（返回 {ok, text, status, error}） */
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, status: res.status };
    const text = await res.text();
    return { ok: true, text };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message };
  }
}

// ==================== 核心更新函数 ====================
async function updateAndCommit(env) {
  console.log("🚀 开始执行 IP 更新任务...");

  const GITHUB_TOKEN = env.GITHUB_TOKEN;
  const GITHUB_OWNER = env.GITHUB_OWNER;
  const GITHUB_REPO = env.GITHUB_REPO;

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error("❌ 环境变量未正确设置");
    return new Response("❌ 环境变量未设置", { status: 500 });
  }

  const filePath = "addip.txt";
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const ghHeaders = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "User-Agent": "Cloudflare-Worker-IP-Updater",
    "Accept": "application/vnd.github.v3+json"
  };

  try {
    const newContent = await updateIPs();

    // 空内容保护
    if (!newContent.trim()) {
      console.warn("⚠️ 所有数据源均为空，跳过提交");
      return new Response("⚠️ 数据源全部为空，未更新", { status: 200 });
    }

    // 获取现有文件 SHA + 内容（用于比较）
    let sha = null;
    let existingContent = "";
    const getRes = await fetchWithTimeout(apiUrl, { headers: ghHeaders }, GITHUB_TIMEOUT);
    if (getRes.ok) {
      try {
        const data = JSON.parse(getRes.text);
        sha = data.sha;
        if (data.content) existingContent = base64ToUtf8(data.content);
      } catch (e) { /* 解析失败当作新文件 */ }
    } else if (getRes.status === 404) {
      // 文件不存在，下面会用 null sha 创建新文件
      console.log("ℹ️ addip.txt 不存在，将创建新文件");
    } else {
      // GET 失败（网络抖动 / 500 等），拿不到可靠基线，跳过本次写入
      console.error("❌ 获取文件信息失败:", getRes.status, getRes.error);
      return new Response("⚠️ 无法获取文件状态，跳过更新", { status: 200 });
    }

    // 内容无变化则跳过
    if (existingContent.trim() === newContent.trim()) {
      console.log("⏭️ 内容无变化，跳过提交");
      return new Response("⏭️ 内容无变化，无需更新", { status: 200 });
    }

    const putBody = {
      message: `Auto update IP list - ${new Date().toISOString()}`,
      content: utf8ToBase64(newContent),
      sha
    };

    let putRes = await fetchWithTimeout(apiUrl, {
      method: "PUT",
      headers: ghHeaders,
      body: JSON.stringify(putBody)
    }, GITHUB_TIMEOUT);

    // 409 → SHA 过期，重试一次
    if (putRes.status === 409) {
      console.warn("⚠️ SHA 冲突，重试一次...");
      const r2 = await fetchWithTimeout(apiUrl, { headers: ghHeaders }, GITHUB_TIMEOUT);
      let sha2 = null;
      if (r2.ok) {
        try { sha2 = JSON.parse(r2.text).sha; } catch (e) {}
      }
      putRes = await fetchWithTimeout(apiUrl, {
        method: "PUT",
        headers: ghHeaders,
        body: JSON.stringify({ ...putBody, sha: sha2 })
      }, GITHUB_TIMEOUT);
    }

    if (putRes.ok) {
      console.log("✅ GitHub 更新成功！");
      return new Response("✅ 更新成功！addip.txt 已更新", { status: 200 });
    }

    const errText = putRes.text || `HTTP ${putRes.status}`;
    console.error("❌ GitHub 更新失败:", putRes.status, errText);
    return new Response("❌ GitHub 更新失败", { status: 500 });

  } catch (err) {
    console.error("❌ 更新异常:", err.message);
    return new Response(`❌ 更新失败: ${err.message}`, { status: 500 });
  }
}

// ==================== IP 拉取函数 ====================
async function updateIPs() {
  const baseHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };

  const seen = new Set();   // 全局去重
  const lines = [];

  function addLine(host, port, remark) {
    const key = `${normalizeHost(host)}:${port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    lines.push(`${host}:${port}#${remark}`);
    return true;
  }

  console.log("📡 开始拉取数据源...");

  // ---- 全部数据源并行拉取（互不依赖，最坏从 ~48s 降到 ≤12s） ----
  const bestcfSources = [
    { url: "https://bestcf.pages.dev/xinyitang3/ipv4.txt", tag: "xinyitang3" },
    { url: "https://bestcf.pages.dev/tiancheng/all.txt", tag: "tiancheng" },
    { url: "https://bestcf.pages.dev/gslege/Cfxyz.txt", tag: "gslege" },
    { url: "https://bestcf.pages.dev/domain/ircf/all.txt", tag: "ircf" }
  ];

  const [topRes, dynRes, uo, ...bestcfResults] = await Promise.all([
    fetchWithTimeout("https://vps789.com/openApi/cfIpTop20", { headers: baseHeaders }),
    fetchWithTimeout("https://vps789.com/openApi/cfIpApi", { headers: baseHeaders }),
    fetchWithTimeout("https://api.uouin.com/cloudflare.html", { headers: baseHeaders, redirect: "follow" }),
    ...bestcfSources.map(src => fetchWithTimeout(src.url, { headers: baseHeaders }))
  ]);

  // ---- 1. 处理 vps789 top ----
  if (topRes.ok) {
    try {
      const data = JSON.parse(topRes.text);
      const list = (data?.data?.good || []).slice(0, 10);
      list.forEach((item, i) => {
        const val = item.ip || item;
        if (isValidHost(val)) addLine(val, 443, `综合优选(vps789)${i + 1}`);
      });
    } catch (e) { console.warn("❌ vps789 top 解析失败:", e.message); }
  } else {
    console.warn("❌ vps789 top:", topRes.error || topRes.status);
  }

  // ---- 2. 处理 vps789 运营商 ----
  if (dynRes.ok) {
    try {
      const dyn = JSON.parse(dynRes.text);
      (dyn?.data?.CT || []).slice(0, 10).forEach((item, i) => {
        const val = item.ip || item;
        if (isValidHost(val)) addLine(val, 443, `电信CT(vps789)${i + 1}`);
      });
      (dyn?.data?.CU || []).slice(0, 10).forEach((item, i) => {
        const val = item.ip || item;
        if (isValidHost(val)) addLine(val, 443, `联通CU(vps789)${i + 1}`);
      });
      (dyn?.data?.CM || []).slice(0, 10).forEach((item, i) => {
        const val = item.ip || item;
        if (isValidHost(val)) addLine(val, 443, `移动CM(vps789)${i + 1}`);
      });
    } catch (e) { console.warn("❌ vps789 运营商解析失败:", e.message); }
  } else {
    console.warn("❌ vps789 运营商:", dynRes.error || dynRes.status);
  }

  // ---- 3. 处理 uouin ----
  if (uo.ok) {
    try {
      const ips = (uo.text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])
        .filter(ip => isValidHost(ip));
      [...new Set(ips)].slice(0, 10).forEach((ip, i) => addLine(ip, 443, `优选ip(uouin)${i + 1}`));
    } catch (e) { console.warn("❌ uouin 解析失败:", e.message); }
  } else {
    console.warn("❌ uouin:", uo.error || uo.status);
  }

  // ---- 4. 处理 bestcf 4 源 ----
  bestcfSources.forEach((src, i) => {
    const r = bestcfResults[i];
    if (!r || !r.ok) {
      console.warn(`❌ ${src.tag} 拉取失败`, r?.error || r?.status);
      return;
    }

    // 过滤 HTML 部署页
    if (/<(doctype|html|head|body)/i.test(r.text)) {
      console.warn(`⚠️ ${src.tag} 返回 HTML，跳过`);
      return;
    }

    const text = r.text;
    const idxMap = new Map(); // tagId → sequential index
    let added = 0;
    for (const line of text.split(/\r?\n/)) {
      if (added >= PER_SOURCE_LIMIT) break;
      const parsed = parseAddressToken(line);
      if (!parsed) continue;
      const tagId = `优选(bestcf-${src.tag})`;
      const seq = (idxMap.get(tagId) || 0) + 1;
      idxMap.set(tagId, seq);
      if (addLine(parsed.host, parsed.port, `${tagId}${seq}`)) added++;
    }
    console.log(`✅ ${src.tag} 有效 ${added} 条`);
  });

  // ---- 输出 ----
  const result = lines.join("\n") + "\n";
  console.log(`📊 汇总: 共 ${lines.length} 条 (去重后)`);
  return result;
}
