// 针对 Mihomo Party 和 WorkerVless2sub 优化的覆写脚本
function main(config) {
  const { proxies } = config;
  
  // 1. 定义图标和分组名
  const icon = {
    auto: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/auto.png",
    select: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/select.png",
    hk: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/hongkong.png",
    tw: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/taiwan.png",
    sg: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/singapore.png",
    jp: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/japan.png",
    us: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/usa.png",
    apple: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/apple.png",
    google: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/google.png",
    telegram: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/telegram.png",
    netflix: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/backdrops/netflix.png"
  };

  // 2. 节点过滤函数 (参考 YaNet 优点)
  const filter = (reg) => proxies.filter(p => reg.test(p.name)).map(p => p.name);
  const allNodes = proxies.map(p => p.name);

  // 3. 重新构建策略组 (Proxy Groups)
  config["proxy-groups"] = [
    {
      name: "🚀 节点选择",
      type: "select",
      proxies: ["♻️ 自动选择", "🔮 负载均衡", "DIRECT", ...allNodes],
      icon: icon.select
    },
    {
      name: "♻️ 自动选择",
      type: "url-test",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      proxies: allNodes,
      icon: icon.auto
    },
    {
      name: "🔮 负载均衡",
      type: "load-balance",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      strategy: "consistent-hashing",
      proxies: allNodes
    },
    {
      name: "🇭🇰 香港节点",
      type: "select",
      proxies: filter(/香港|HK|Hong Kong|HONGKONG/i).length > 0 ? filter(/香港|HK|Hong Kong|HONGKONG/i) : ["🚀 节点选择"],
      icon: icon.hk
    },
    {
      name: "🇯🇵 日本节点",
      type: "select",
      proxies: filter(/日本|JP|Japan|JAPAN/i).length > 0 ? filter(/日本|JP|Japan|JAPAN/i) : ["🚀 节点选择"],
      icon: icon.jp
    },
    {
      name: "🇺🇸 美国节点",
      type: "select",
      proxies: filter(/美国|US|USA|United States/i).length > 0 ? filter(/美国|US|USA|United States/i) : ["🚀 节点选择"],
      icon: icon.us
    },
    {
      name: "🎬 奈飞视频",
      type: "select",
      proxies: ["🚀 节点选择", "♻️ 自动选择", "🇭🇰 香港节点", "🇺🇸 美国节点"],
      icon: icon.netflix
    },
    {
      name: "🍎 苹果服务",
      type: "select",
      proxies: ["DIRECT", "🚀 节点选择", "♻️ 自动选择"],
      icon: icon.apple
    },
    {
      name: "📢 谷歌服务",
      type: "select",
      proxies: ["🚀 节点选择", "♻️ 自动选择"],
      icon: icon.google
    },
    {
      name: "📲 电报消息",
      type: "select",
      proxies: ["🚀 节点选择", "♻️ 自动选择"],
      icon: icon.telegram
    },
    {
      name: "🐟 漏网之鱼",
      type: "select",
      proxies: ["🚀 节点选择", "DIRECT", "♻️ 自动选择"],
      icon: icon.select
    }
  ];

  // 4. 注入 ACL4SSR 核心分流规则 (Rule Providers)
  // 这里采用远程 Rule Provider 模式，保持配置简洁
  config["rule-providers"] = {
    google: {
      type: "http",
      behavior: "domain",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Google.yaml",
      path: "./ruleset/google.yaml",
      interval: 86400
    },
    telegram: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Telegram.yaml",
      path: "./ruleset/telegram.yaml",
      interval: 86400
    },
    netflix: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Netflix.yaml",
      path: "./ruleset/netflix.yaml",
      interval: 86400
    }
  };

  // 5. 设置规则映射
  config["rules"] = [
    "RULE-SET,google,📢 谷歌服务",
    "RULE-SET,telegram,📲 电报消息",
    "RULE-SET,netflix,🎬 奈飞视频",
    "GEOIP,CN,DIRECT",
    "MATCH,🐟 漏网之鱼"
  ];

  return config;
}
