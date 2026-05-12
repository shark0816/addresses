# Cloudflare 优选 IP 自动更新仓库
本项目通过 Cloudflare Worker 定时拉取多平台优质 Cloudflare IP，自动更新至 addip.txt，可直接对接 WorkerVless2sub 等订阅生成工具使用。
## ✨ 项目简介
### 数据源
- vps789.com：综合排名优选 IP（每日刷新）+ 三网动态优选 IP（每小时刷新）
- api.uouin.com：全网优质 Cloudflare IP 补充
### 更新频率：每 8 小时自动更新（可自定义 Cron 规则）
### 文件内容
- 综合优选 IP
- 电信 / 联通 / 移动 三网优选 IP
- 多平台高质量 CF IP 汇总
### 使用场景：直接用于 WorkerVless2sub 订阅生成，一键批量添加节点
## 📁 文件说明

|文件名|说明|
| --- | --- |
|addip.txt|优选 IP 列表，由 CF Worker 自动定时更新|
|README.md|项目说明文档|

🔗 直连订阅地址
可直接填入 WorkerVless2sub 变量 ADDAPI 中使用：
plaintext
https://raw.githubusercontent.com/shark0816/addresses/refs/heads/main/addip.txt  

🛠️ 工作原理
1. CF Worker 抓取数据
Bot脚本定时请求 vps789、uouin 接口，自动抓取、去重、整理优质 IP
Bot1脚本定时请求 vps789、uouin Mia 天诚 Gslege IRCF接口，自动抓取、去重、整理优质 IP
3. 自动写入 GitHub
通过 GitHub API 授权，自动更新 addip.txt，支持手动触发 + 定时任务
4. 订阅工具读取
WorkerVless2sub 通过 ADDAPI 读取本文件，自动生成多 IP 节点订阅  

⚙️ 完整详细部署教程（新手一步一步跟着做）
1. 准备工作
- 本 GitHub 仓库必须存在：shark0816/addresses
- 仓库内必须手动创建：addip.txt（内容随便写，用于占位）
- 拥有 Cloudflare 账号（免费版即可）
2. 创建 GitHub PAT 密钥（必须）
- 打开 GitHub → 右上角头像 → Settings
- 左侧最下方 → Developer settings → Personal access tokens → Tokens (classic)
- 点击 Generate new token → Generate new token (classic)
- 名称填写：cf-worker-ip
- 勾选权限：repo （全部打勾）
- 过期时间：选择 No expiration（永久有效）
- 拉到底部点击 Generate token
- 复制生成的 ghp_ 开头的密钥（只显示一次，务必保存）
3. 部署 Cloudflare Worker
- 登录 Cloudflare 后台 → 左侧菜单 Workers & Pages
- 点击 Create application → Create Worker
- 给 Worker 起一个名字：例如 cf-ip-auto-update
- 点击 Deploy 创建
- 点击 Edit code 进入代码编辑界面
- 全选删除默认代码
- 粘贴项目提供的完整 Worker 脚本
- 点击右上角 Save and deploy
4. 配置 Worker 环境变量（关键）
- 退出代码编辑器 → 进入 Worker 管理界面
- 点击顶部 Settings → 左侧 Variables
- 点击 Add variable 依次添加以下变量：

|变量名|类型|值|
| --- | --- | --- |
|GITHUB_TOKEN|密钥 (Secret)|你刚才生成的 ghp_xxx|
|GITHUB_OWNER| 文本 |shark0816|
|GITHUB_REPO| 文本 |addresses|

- 每个变量添加后点击 Deploy 保存
5. 设置定时自动更新（Cron）
- 进入 Worker → Settings → Triggers
- 找到 Cron Triggers
- 点击 Add Cron Trigger
- 输入：0 */8 * * *
- 点击 Add
- 确保 Cron 已生效
6. 测试是否正常运行
- 访问你的 Worker 地址 + /update
- 例如：https://你的-worker-name.你的用户名.workers.dev/update
- 出现：✅ 更新成功 即部署完成
- 回到 GitHub 查看 addip.txt 已自动更新
⚠️ 注意事项
- 本项目仅抓取公开优质 IP，不用于违法用途
- IP 有效性、可用性依赖上游接口，不做长期稳定性保证
- WorkerVless2sub 可直接解析纯 IP 格式，无需额外处理
- 定时任务异常可在 CF Worker 日志中排查执行记录
