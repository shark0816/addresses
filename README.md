# Cloudflare 优选 IP 自动更新仓库
本项目通过 Cloudflare Worker 定时拉取多平台优质 Cloudflare IP / 域名，自动更新至 `addip.txt`，可直接对接 [WorkerVless2sub](https://github.com/cmliu/WorkerVless2sub) 等订阅生成工具使用。
## ✨ 项目简介
### 数据源
- **vps789.com**：综合排名优选 IP（每日刷新）+ 三网（电信 / 联通 / 移动）动态优选 IP（每小时刷新）
- **api.uouin.com**：全网优质 Cloudflare IP 补充
- **bestcf.pages.dev × 4**：
  - `xinyitang3` / `tiancheng` / `gslege`：优选 IPv4
  - `domain/ircf`：优选**域名**（`ipv4.ircf.space` 等，WorkerVless2sub 同样可用作节点地址）
### 更新频率
每 8 小时自动更新（Cron：`0 */8 * * *`，可在 Worker Triggers 自定义）。
### 文件内容（addip.txt）
- 综合优选 IP / 域名
- 电信 / 联通 / 移动 三网优选 IP
- 多平台高质量 CF IP / 域名 汇总
### 使用场景
直接用于 WorkerVless2sub 订阅生成，一键批量添加节点。
---
## 📁 文件说明
| 文件名 | 说明 |
| --- | --- |
| `addip.txt` | 优选 IP / 域名列表，由 CF Worker 自动定时更新 |
| `Bot1(QoderUpdate).js` | **⭐ 最新推荐部署版本**（QoderUpdate 更新版；全数据源并行、完善 IPv6 解析、日志/异常容错全面升级、代码结构解耦优化） |
| `Bot1(agent).js` | 旧版 Hermes 输出稳定版本，仅作兼容参考，不推荐新部署 |
| `Bot1_new(buddy).js` | 早期参考对比版本（WorkBuddy 版本；改进思路来源，不强制使用） |
| `README.md` | 项目说明文档（本文件） |
> 部署时**只粘贴 `Bot1(QoderUpdate).js` 的完整内容**进 Worker 即可，其余文件为历史版本/说明/参考。
---
## 🔬 三个脚本版本对比
`Bot1_new(buddy).js`（WorkBuddy 版本）是项目早期改进思路参考版；`Bot1(agent).js`（Hermes）为上一版稳定落地版；`Bot1(QoderUpdate).js` 为当前最新迭代版本，在旧版基础上修复多处隐性 Bug、大幅优化代码结构与容错逻辑，核心差异如下：
| 对比维度 | `Bot1_new(buddy).js`（WorkBuddy 参考版） | `Bot1(agent).js`（Hermes 旧稳定版） | `Bot1(QoderUpdate).js`（⭐ 最新推荐 · QoderUpdate） |
| --- | --- | --- | --- |
| IPv6 地址解析 | 正则仅支持简单 IPv6，截取逻辑易截断 `[::1]` 类地址 | 仅支持 IPv4，无完整 IPv6 捕获逻辑 | 使用捕获组精准提取 host，彻底解决 IPv6 括号地址被错误截断问题 |
| 数据源拉取方式 | vps789 + uouin **串行**，bestcf 并行 | **全部 `Promise.all` 并行**，最坏耗时不超单源超时（≤12s） | 保留全并行拉取逻辑，数据源配置抽离独立，新增维护便捷性 |
| GitHub GET 超时 | `fetchText` 带超时 | `fetchWithTimeout` 带超时 | 复用双超时封装，`fetchWithTimeout` 统一返回 text 字段，请求失败不丢失错误日志 |
| GitHub PUT 超时 | **裸 `fetch`，无超时**（上游 hang 可拖垮更新） | `fetchWithTimeout` 带超时（20s） | 延续 PUT 超时保护，优化 409 冲突重试逻辑 |
| 409（SHA 过期）重试 | ✅ 支持重试 | ✅ 支持重试 | 重试时判断 SHA 为空直接跳过，杜绝空 SHA 盲目覆盖文件 |
| GET 非 404 失败处理 | 仅告警，仍带 `sha=null` 去 PUT → 文件已存在时偶发 `422` | **直接 `return` 跳过本次**，不莽撞写入 | 保留失败跳过逻辑，补充完整异常堆栈打印 |
| bestcf 结果取值 | `Promise.allSettled` → `r.value.*` | `Promise.all` → `r.*`（修复 `.value` 回归 bug） | 沿用修复后的取值逻辑，无数据丢失问题 |
| 域名保留（含 ircf）| ✅ `isValidHost` + `parseAddressToken` | ✅ 同左 | ✅ 同左，不受 IPv6 解析改动影响 |
| 时间戳垃圾过滤（`07:02`）| ✅ | ✅ | ✅ |
| 中文备注 → 无变化跳过提交 | ✅ `base64ToUtf8` 用 `TextDecoder` | ✅ 同左 | 新增 `utf8ToBase64` 分块处理，大数据编码性能大幅提升 |
| 定时任务异常捕获 | 异常静默吞没，无完整堆栈 | 基础捕获，日志信息不全 | 全局添加 `.catch()`，打印完整错误堆栈，定时任务报错不再静默消失 |
| 数据条数保护 | 无下限判断 | 无下限判断 | 新增 IP 数量下限保护，最终汇总少于 5 条直接跳过提交并输出告警，避免全数据源失效写入垃圾内容 |
| 代码维护性 | 数据源硬编码嵌入业务逻辑 | 数据源硬编码嵌入业务逻辑 | 数据源统一抽离至文件顶部 `BESTCF_SOURCES` / `API_SOURCES`，新增/删减数据源无需改动核心业务逻辑 |
| 单源失败不影响全局 | ✅ | ✅ | ✅ |
| 空内容保护 / HTML 页过滤 / 全局去重 | ✅ | ✅ | ✅ |

**结论**：新部署直接使用 `Bot1(QoderUpdate).js`；已有旧 Hermes 版本可按需迁移升级，修复 IPv6、日志、重试、定时报错、大数据编码、数据源维护、脏数据提交等多项隐性问题。若仍需兼容旧逻辑，可临时保留 `Bot1(agent).js` 作为备选。
---
## 🔗 直连订阅地址
可直接填入 WorkerVless2sub 变量 **`ADDAPI`** 中使用：
```
https://raw.githubusercontent.com/shark0816/addresses/refs/heads/main/addip.txt
```
`addip.txt` 输出格式为 `host:port#remark`（无端口自动补 `:443`），与 WorkerVless2sub 的 `ADDAPI` 解析（IP 走正则、域名走 fallback split）100% 兼容。
---
## 🛠️ 工作原理
1. **CF Worker 抓取数据**
   Bot 脚本定时请求 vps789、uouin、bestcf（xinyitang3 / tiancheng / gslege / ircf）接口，自动抓取、去重、整理优质 IP / 域名，统一为 `host:port#remark` 格式。
2. **自动写入 GitHub**
   通过 GitHub API 授权，自动更新 `addip.txt`，支持手动触发（`/update`）+ 定时任务（Cron）。
3. **订阅工具读取**
   WorkerVless2sub 通过 `ADDAPI` 读取本文件，自动生成多 IP / 域名节点订阅。
---
## 📘 完整详细部署教程（新手一步一步跟着做）
### 1. 准备工作
- 本 GitHub 仓库必须存在：`shark0816/addresses`
- 仓库内必须手动创建：`addip.txt`（内容随便写，用于占位）
- 拥有 Cloudflare 账号（免费版即可）
### 2. 创建 GitHub PAT 密钥（必须）
- 打开 GitHub → 右上角头像 → **Settings**
- 左侧最下方 → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
- 点击 **Generate new token** → **Generate new token (classic)**
- 名称填写：`cf-worker-ip`
- 勾选权限：**`repo`**（全部打勾）
- 过期时间：选择 **No expiration**（永久有效）
- 拉到底部点击 **Generate token**
- 复制生成的 `ghp_` 开头的密钥（只显示一次，务必保存）
### 3. 部署 Cloudflare Worker
- 登录 Cloudflare 后台 → 左侧菜单 **Workers & Pages**
- 点击 **Create application** → **Create Worker**
- 给 Worker 起一个名字：例如 `cf-ip-auto-update`
- 点击 **Deploy** 创建
- 点击 **Edit code** 进入代码编辑界面
- 全选删除默认代码
- **粘贴 `Bot1(QoderUpdate).js` 的完整内容**
- 点击右上角 **Save and deploy**
### 4. 配置 Worker 环境变量（关键）
- 退出代码编辑器 → 进入 Worker 管理界面
- 点击顶部 **Settings** → 左侧 **Variables**
- 点击 **Add variable** 依次添加以下变量：
| 变量名 | 类型 | 值 |
| --- | --- | --- |
| `GITHUB_TOKEN` | 密钥 (Secret) | 你刚才生成的 `ghp_xxx` |
| `GITHUB_OWNER` | 文本 | `shark0816` |
| `GITHUB_REPO` | 文本 | `addresses` |
- 每个变量添加后点击 **Deploy** 保存
### 5. 设置定时自动更新（Cron）
- 进入 Worker → **Settings** → **Triggers**
- 找到 **Cron Triggers**
- 点击 **Add Cron Trigger**
- 输入：`0 */8 * * *`
- 点击 **Add**
- 确保 Cron 已生效
### 6. 测试是否正常运行
- 访问你的 Worker 地址 + `/update`
- 例如：`https://你的-worker-name.你的用户名.workers.dev/update`
- 出现：**✅ 更新成功** 即部署完成
- 回到 GitHub 查看 `addip.txt` 已自动更新
---
## ⚠️ 注意事项
- 本项目仅抓取公开优质 IP / 域名，不用于违法用途。
- IP / 域名有效性、可用性依赖上游接口，不做长期稳定性保证。
- **WorkerVless2sub 既能解析纯 IP 也能解析域名**：其 `ADDAPI` 解析逻辑对 IP 行走正则、对域名行走 `split(':' + '#')` 的 fallback，**两者都会生成可用节点**。因此本项目的优选域名（如 `ipv4.ircf.space:443`）同样有效，请勿用"仅 IP"的过滤器把域名砍掉。
- 定时任务异常可在 CF Worker 日志中排查执行记录（脚本对每数据源均有独立 `console.log/warn`，失败会明确区分网络错误与 HTTP 错误；新版会完整打印异常堆栈，便于定位问题）。
- 升级新版 `Bot1(QoderUpdate).js` 无需修改环境变量与定时 Cron，直接替换 Worker 代码保存部署即可。
---
## 📝 版本更新记录
| 版本 | 关键改动 |
| --- | --- |
| 早期线上版（原 Bot1.txt）| 存在 `07:02` 等时间戳垃圾混入、优选域名被砍、GitHub 无超时等问题 |
| 改进参考版（Bot1_new(buddy).js · WorkBuddy）| 引入 `isValidHost` / `parseAddressToken` 保留域名+过滤垃圾；中文安全 base64 + 无变化跳过；GitHub 409 重试；bestcf 并行 |
| 落地版（Bot1(agent).js · Hermes）| 在参考版基础上：全部数据源并行拉取（≤12s）；GitHub GET/PUT 双超时；GET 非 404 失败跳过（不再 422）；修复 bestcf 并行后取值 `.value` 回归 |
| 最新迭代版（Bot1(QoderUpdate).js · QoderUpdate）| ### 修复 Bug<br>1. IPv6 地址（如 `[::1]`）被错误截断：改用捕获组精准提取 host，不再通过 replace 模糊匹配<br>2. 请求失败时错误日志丢失：`fetchWithTimeout` 统一固定返回 text 字段，失败日志完整留存<br>3. 409 冲突重试时 SHA 为 null 导致覆盖文件：SHA 为空直接跳过重试，不盲目执行 PUT<br>4. 定时任务异常静默消失：全局增加 `.catch()`，输出完整错误堆栈<br><br>### 功能优化<br>1. `utf8ToBase64` 分块处理，8KB 单块编码，大数据量文件性能显著提升<br>2. 所有数据源配置抽离至文件顶部常量 `BESTCF_SOURCES` / `API_SOURCES`，增删数据源无需修改核心业务逻辑<br>3. 新增 IP 数量下限保护：汇总后有效条目少于 5 条直接跳过提交并输出告警，防止上游全失效写入无效脏数据 |
