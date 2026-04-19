这是一个优选域名汇总项目，支持TLS，不定期维护

部署步骤（超详细）

登录 Cloudflare → Workers 和 Pages → 创建 Worker
给 Worker 起个名字，例如 vps789-daily-updater
复制BOt内全部代码，全部替换 Worker 默认代码，然后点击 保存并部署
添加环境变量（Secrets）
进入 Worker → 设置 → 变量 → 添加变量（类型选 Secret）变量名值（必须填写）
说明


GITHUB_TOKEN（选择密钥）你的 GitHub PAT必须有 repo 权限
GITHUB_OWNER你的 GitHub用户名例如 
KGITHUB_REPO你的仓库名例如 cf-addressesFILE_PATHaddresses.txt

你要更新的文件BRANCHmain一般是 main如何生成 GitHub PAT：
进入 https://github.com/settings/tokens
点击 Generate new token (classic)
勾选 repo 权限 → 生成 → 复制保存（只显示一次）

添加定时触发器
进入 Worker → 触发器 → 添加计划触发器
输入 Cron 表达式：0 0 * * * （每天 0 点 UTC 执行）
测试
部署完成后，直接在浏览器访问：
https://你的worker名.你的子域.workers.dev/update
如果看到 “✅ VPS789 优选IP 已更新并推送到 GitHub！” 就成功了。


三、使用建议

每天会自动在 addresses.txt 末尾新增一个带日期的区块，方便你以后手动清理旧记录。
如果想只保留最新一组，可以在脚本里把 newSection 改为替换指定标记区（告诉我，我再给你改）。
每次更新后，用 Clash Party 刷新订阅即可看到新 IP。
推荐配合你之前用的 ACL4SSR_Online_Full_WithIcon.yaml 覆写，用 filter: "vps789" 创建专用组。
