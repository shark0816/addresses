你好！欢迎来到这个 Cloudflare 优选 IP 自动更新仓库。  
这个项目会通过 Cloudflare Worker 定时拉取 vps789.com 的优选 IP 数据，并自动更新到 addip.txt 文件中，方便直接对接 WorkerVless2sub 等订阅工具。  
✨ 项目简介
数据源：vps789.com 优选 IP 接口
综合排名前 20（每日更新）
电信 / 联通 / 移动线路优选 IP（每小时更新）
更新频率：可通过 Cloudflare Worker 自定义定时更新（建议每小时 / 每日）
文件内容：
综合优选 IP / 域名列表
电信、联通、移动线路优选 IP
使用场景：直接对接 WorkerVless2sub 等订阅转换工具，一键生成节点订阅  
📁 文件说明  

| 文件 | 说明|
| --- | --- |
| addip.txt	| 优选 IP / 域名列表，自动更新
| README.md	| 本项目说明文档
 

🔗 原始文件地址  
可直接用于 WorkerVless2sub 的 ADDAPI 配置：
https://raw.githubusercontent.com/shark0816/addresses/refs/heads/main/addip.txt  

🛠️ 工作原理  
1. Cloudflare Worker 拉取接口：  
- 调用 vps789.com 的两个优选 IP 接口，获取最新数据
- 解析并提取 IP / 域名，按线路分类整理
2. 自动更新到 GitHub：
- 通过 GitHub API 认证，自动更新 addip.txt 文件
- 支持手动触发更新，也可配置定时触发器自动执行
3.订阅工具读取：
- WorkerVless2sub 等工具通过 ADDAPI 读取 addip.txt
- 自动生成包含所有优选 IP 的节点订阅链接
  
⚙️ Cloudflare Worker 部署说明（简要）
1. 新建 Cloudflare Worker，部署本项目Bot脚本
2. 配置环境变量：
- GITHUB_TOKEN：你的 GitHub PAT（需开启 repo 权限）
- GITHUB_OWNER：你的 GitHub 用户名（shark0816）
- GITHUB_REPO：本仓库名（addresses）
3. 访问 /update 手动触发更新，或配置 Cron 定时任务

⚠️ 注意事项
- addip.txt 包含部分域名地址，WorkerVless2sub 可正常解析
- 数据来源为 vps789.com，IP 有效性以官方接口为准
- 若更新失败，可检查 GitHub PAT 权限、仓库配置及 Worker 日志排查问题
