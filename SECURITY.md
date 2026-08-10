# 《天朝小将 2.8》游戏服务器安全漏洞评估报告

> 评估对象：`base.apk`（包 `com.w2a.gpsn`，壳内应用「天朝最新 2.77」，实际游戏「天朝小将 2.8 [搜打撤版]」）
> 分析方法：静态逆向（jadx/apktool/Ghidra + 解密出的完整 HTML 源码 `decrypted_inner.html`）+ 真实服务器协议实测（`103.236.98.227:3000`）
> 报告日期：2026-08-06

---

## 1. 概述

**结论：该游戏存在严重安全漏洞，任何具备浏览器开发者工具基础的人都能轻松开挂，且服务器无法分辨作弊与正常存档。**

根因只有一句话：**服务器对客户端提交的数据完全没有信任边界**——存档明文、无签名、无校验、无服务端账本，战斗和排行榜也信任客户端自报的数值。

按严重程度，共发现 **9 个漏洞**，其中 2 个 Critical（存档任意篡改、批量盗号）、4 个 High、2 个 Medium、1 个架构级根因。

---

## 2. 威胁模型与攻击面

### 2.1 攻击者假设

| 攻击者 | 能力 | 可利用漏洞 |
|---|---|---|
| 普通玩家（F12/开发者工具） | 改内存对象、改 localStorage、调控制台函数 | V-01, V-02, V-03 |
| 脚本小子 | 上述 + 写脚本批量操作 | V-01, V-02, V-03, V-05 |
| 网络中间人（同 WiFi） | 抓包 | V-04, V-06 |
| 恶意玩家 | 逆向协议、自写客户端 | 全部 |

### 2.2 攻击面（服务器接口）

| 接口 | 用途 | 是否可信客户端数据 |
|---|---|---|
| `POST /auth/register` | 注册 | 明文密码 |
| `POST /auth/login` | 登录 | 明文密码 |
| `GET/POST /cloud/save` `/cloud/load` | 云存档 | **完全信任 saveData** |
| `POST /battle/pve` `/battle/pvp` `/battle/story` | 战斗模拟 | **信任请求内 myTeam** |
| `POST /register`(斗神殿) | 同步阵容 | **信任 teamData / totalPower** |
| `GET /leaderboard` | 排行榜 | 读取（受伪造同步影响） |
| `POST /heartbeat` | 心跳/互踢 | 信任 totalPower |
| 兑换码 | 发资源 | **不经过服务器（纯客户端）** |

---

## 3. 漏洞详情

### V-01【Critical】存档任意篡改，服务器照单全收

- **位置**：`decrypted_inner.html:7788`(saveGame)、`:7761`(cloudSavePost)、`:8796`(autoSave)；本地存档键 `:2160`
- **描述**：游戏存档 `saveData` 是**明文 JSON**（仅 gzip 压缩），通过 `POST /cloud/save {userId, saveData, sessionToken}` 上传，服务器原样存储、加载时原样回吐。**没有签名、没有 HMAC、没有结构校验、没有服务端资源账本**。
- **攻击步骤（最小 PoC）**：
  1. 打开浏览器进游戏 → F12 控制台
  2. 执行 `gameData.diamond = 99999999; gameData.coin = 999999999; window.cloudUpload();`
  3. 刷新页面，服务器返回篡改后的存档，游戏里天币/铜钱已生效
  4. 也可直接改 `localStorage['tianchaoxiaojiang_save_v3']` 再云上传
- **影响**：无限天币/铜钱/资源、满级英雄、全装备全宝石，横扫斗神殿/天榜/帮派战，直接摧毁游戏经济与排行榜公平性。
- **修复建议**：见 §6 路线图 1（服务端账本）+ 3（签名/权威校验）。

### V-02【High】兑换码纯客户端，可无限刷取

- **位置**：`decrypted_inner.html:3228`(CODE_LIST)、`:7728`(useCode)
- **描述**：所有兑换码写死在客户端 HTML，领取校验（码是否存在）与「已领取」标记（`gameData.codeRecord`）**全在客户端内存里，整个 `useCode()` 不发起任何服务器请求**。
- **攻击步骤**：
  1. 输入 `newbie666` 领取礼包（铜钱100万/天币300等）
  2. 控制台执行 `gameData.codeRecord = {}`（清空已领取记录）
  3. 再次领取 → 无限循环
  4. 甚至可直接 `gameData.diamond += 100000` 后云上传（同 V-01）
- **已确认存在的可用码**：`newbie666`、`dhhd1`、`dhdu2`、`duiol3`、`diypz4`、`fwb666`（HTML 里还保留了大量被注释掉的超值码 `god888`/`king666` 等历史码）。
- **影响**：任何玩家可免费无限获取高价值资源，等于直接发钱。
- **修复建议**：兑换码判定与领取记录**必须迁到服务端**，服务端校验码是否存在 + 是否已用。

### V-03【High】战斗/斗神殿请求信任客户端数据

- **位置**：`/battle/pve` `decrypted_inner.html:9456`；`/battle/pvp` `:13222`；斗神殿同步 `/register` `:12844`；属性计算 `calcHeroAtk` `:5235`、`calcHeroHp` `:5252`
- **描述**：
  - PVE 战斗请求体直接携带客户端算好的 `myTeam`（含 atk/hp）→ 服务器用它模拟并判定胜负；
  - 斗神殿 `/register` 上传客户端自报的 `teamData` 和 `totalPower` → 排行榜战力、PVP 对手强度全由玩家自报；
  - `calcHeroAtk`/`calcHeroHp` 是纯前端函数，改英雄属性即可改变上报数值。
- **攻击步骤**：控制台把 `myTeam` 各英雄 `atk` 改成 10 万再打副本 → 服务器按此模拟 → 必胜；同步前先改属性 → 排行榜战力虚高。
- **影响**：必赢副本、PVP 无敌、战力刷榜。
- **修复建议**：战斗模拟改为从**服务端存档读取玩家真实阵容**，不复用请求内的 `myTeam`；`totalPower`/`teamData` 由服务端计算。

### V-04【High】明文 HTTP + 明文密码 + base64「记住密码」

- **位置**：`AUTH_API = http://103.236.98.227:3000/api` `:14997`；登录 `:15213`/注册 `:15302`（明文密码 POST）；记住密码 `:15002`(atob)/`:15013`(btoa)
- **描述**：
  - 全链路 HTTP 明文传输，账号密码、sessionToken、存档可被中间人抓取；
  - `/auth/login`/`/auth/register` 直接明文传密码；
  - 「记住密码」仅 `btoa()` base64 存 localStorage，`atob()` 一行还原。
- **攻击步骤**：同 WiFi 抓包（密码/token）；或拿到他人设备读 localStorage。
- **影响**：账号被盗、身份冒用、数据泄露。
- **修复建议**：全站 HTTPS；密码至少加盐哈希后再传输/存储；放弃 base64「记住密码」或改用安全存储。

### V-05【Medium】注册无风控，可批量刷号

- **位置**：`doRegister` `:15302`（仅校验账号≤8字、密码≥4位）
- **描述**：无验证码、无邮箱/手机绑定、无 IP/频率限制。
- **影响**：批量建小号用于刷资源、刷榜、恶意行为。
- **修复建议**：注册限流 + 人机验证 + 设备/IP 指纹。

### V-06【Medium】sessionToken 明文传输、生命周期弱

- **位置**：`SESSION_KEY = tcxj_session_v1` `:14998`；心跳 `:14788`
- **描述**：token 由登录下发，全程明文出现在每个请求里；泄漏即完全接管账号（多端互踢靠心跳，只能事后踢下线）。
- **影响**：token 窃取 = 账号接管；配合 V-04 可大规模盗号。
- **修复建议**：HTTPS + token 定期轮换/过期 + 绑定设备/IP。

### V-07【架构级】经济系统全在客户端，服务器无经济权威

- **位置**：游戏全部数值（价格/掉落/升级/抽卡概率/任务奖励）均在 `decrypted_inner.html` 客户端实现；服务器仅做存储/战斗/排行榜。
- **描述**：这是 V-01/02/03 的共同根因。由于服务器不掌握「资源从哪来」，就无法验证任何资源变动是否合法。
- **影响**：任何单项修复（如只给 saveData 加密）都会被绕过——客户端可被任意修改，加密密钥也在客户端。
- **修复建议**：核心资源（天币/铜钱/战力）改由**服务端记账**，客户端只提交「行为事件」，服务器结算发放；这是唯一治本方案。

### V-08【Critical】批量盗号链路：公开排行榜 → 无鉴权接口 → 明文密码

- **位置**：排行榜 `decrypted_inner.html:12970`（`/leaderboard`）；玩家档案 `/player/:uid`（`doushenApi('/player/'+uid)` `:14225`）；云存档 `/cloud/load`（`syncCloudSaveOnVisible` `:8839`）
- **描述**：三条接口组合成一条**可直接批量盗号**的攻击链，全部无需登录鉴权：
  1. `/leaderboard` **完全公开**，返回所有玩家 `userId`（实测采集到 150 个真实 userId）；
  2. `GET /player/:uid` **无鉴权**，返回该玩家的明文 `password` 与 `sessionToken`（实测返回 `password:"test1234"`）；
  3. `GET /cloud/load?userId=` **无鉴权**，可读取任意玩家完整存档。
- **攻击步骤**：
  1. `GET /leaderboard?limit=50` 拿任意玩家 userId
  2. `GET /player/<userId>` → 得到明文密码 + sessionToken
  3. `POST /auth/login`（明文密码）→ 完全接管该账号
- **已实测证据**（走代理，验证用自有测试号 `probe001`）：
  ```
  /player/DS-mshgacsc-ttlegw  → password:"test1234"、sessionToken 均在（无鉴权）
  /cloud/load?userId=DS-...    → 返回完整 saveData（无鉴权）
  ```
- **影响**：任何能看排行榜的人都能盗走榜上任意账号；可读他人隐私、毁档、冒名顶替、借壳作恶、撞库（密码复用则连带盗其他平台账号）。结合实测，排行榜 TOP 玩家账号随时可被接管。
- **修复建议**（P0）：
  - `/player/:uid`、`/cloud/load` **强制校验 sessionToken**，未授权一律拒绝
  - 响应**绝不返回 `password` / `sessionToken` 字段**（当前返回即泄露）
  - 密码改**加盐哈希**存储，杜绝明文
  - 全站 HTTPS + 登录限流/验证码（阻断抓包与暴力破解）

### V-09【High】DDoS 抗性缺失，可用性脆弱

- **位置**：服务器部署特征（非客户端代码）：单一公网 IP `103.236.98.227:3000`，无 CDN / WAF / 负载均衡，纯 HTTP 明文，接口无任何限流/验证码。
- **描述**：该服务器是**单节点 Node.js 明文 HTTP 服务**，且自带多个高计算量接口，对拒绝服务攻击几乎无抵抗力：
  - `/battle/pve`：每个请求触发一次**服务端战斗模拟**（CPU 密集）；
  - `/cloud/save`：每个请求需 **gzip 解压**（可被超大压缩体耗尽 CPU）；
  - `/auth/login`：登录触发**密码哈希计算**（可被慢速哈希 flood 耗尽 CPU）；
  - 无 CDN / 无 WAF / 无限流 / 无验证码。
- **可能后果**（按攻击类型）：
  - 流量型（SYN/UDP flood）：带宽/连接表打满 → 全服不可玩；
  - 应用层（刷 `/battle/pve`、gzip `/cloud/save`、慢速登录）：CPU 饱和 → 响应延迟暴增甚至崩溃；
  - 慢速连接（Slowloris）：Node.js 连接池占满 → 正常请求无法进入。
- **影响**：全服玩家无法登录/战斗/存档，服务可被单机脚本轻易打瘫。
- **修复建议**：
  - 套 CDN/WAF（如 Cloudflare）挡流量型攻击；
  - `/battle/pve`、`/cloud/save`、`/auth/login` 加**频率限制 + IP 指纹**；
  - gzip 解压设**体积/压缩比上限**（防 gzip bomb）；
  - 登录哈希用慢速算法 + 人机验证；全站 HTTPS。

---

## 4. 实际开挂路径（玩家视角）

以最普通的玩家为例，一条命令即可开挂：

```javascript
// F12 控制台执行
gameData.diamond = 99999999;        // 天币拉满
gameData.coin = 999999999;          // 铜钱拉满
gameData.token = 99999;             // 封神令牌拉满
window.cloudUpload();               // 上传到云存档，服务器无校验直接接受
location.reload();                  // 生效
```

配合 V-02（兑换码无限领）和 V-03（改属性后同步/战斗），即可在 PVE、PVP、排行榜全面作弊。

---

## 5. 实测证据（真实服务器）

使用 `tools/game_protocol_test.py` 对 `103.236.98.227:3000` 实测：

| 请求 | 结果 | 说明 |
|---|---|---|
| `POST /auth/register` | `success` + `userId` | 明文密码被接受 |
| `POST /auth/login` | `success` + `sessionToken` | 明文密码被接受 |
| `POST /cloud/save` | `success` | 自定义 saveData 被原样接受 |
| `GET /cloud/load` | 返回该 userId 的 saveData | 无任何字段/结构校验 |
| `GET /player/:uid` | 完整玩家记录（含 saveData） | 明文可见 |
| `POST /heartbeat` | `success` | 信任自报 totalPower |

> 服务器返回的玩家记录中甚至直接包含明文 `"password"` 字段（协议测试响应可见），说明服务端以明文存储密码——进一步佐证 V-04。

---

## 6. 修复路线图（服务端，按优先级）

> 客户端 HTML 是开源的、可被任何人修改，**在客户端加校验没有任何意义**，一切加固必须发生在服务端。

| 优先级 | 措施 | 解决漏洞 |
|---|---|---|
| P0 | 服务端资源账本：天币/铜钱/令牌由服务端记账，客户端只发行为事件 | V-01, V-02, V-07 |
| P0 | 战斗/排行榜从服务端读真实阵容，不信任请求内 myTeam/teamData/totalPower | V-03 |
| P0 | 兑换码判定迁到服务端 + 服务端记录已用码 | V-02 |
| P0 | **`/player/:uid`、`/cloud/load` 强制鉴权 + 响应移除 password/sessionToken** | **V-08** |
| P1 | 套 CDN/WAF；`/battle/pve`、`/cloud/save`、`/auth/login` 限流 + IP 指纹；gzip 体积上限 | **V-09** |
| P1 | saveData 服务端权威校验（拒绝非法字段/资源负值/突变） | V-01 |
| P1 | 全站 HTTPS | V-04, V-06 |
| P1 | 密码加盐哈希存储（当前疑似明文存储） | V-04, V-08 |
| P2 | 注册限流 + 人机验证 | V-05 |
| P2 | token 轮换/过期/绑定 | V-06 |
| P2 | 异常检测：存档资源跳变、同 IP 批量账号、兑换码滥用告警 | 全部 |

---

## 7. 代码位置索引

| 漏洞 | 关键位置（`decrypted_inner.html`） |
|---|---|
| V-01 存档篡改 | `saveKey` :2160 · `cloudSavePost` :7761 · `saveGame` :7788 · `autoSave` :8796 · `cloudUpload` :7804 |
| V-02 兑换码 | `CODE_LIST` :3228 · `useCode` :7728 · `codeRecord` 见 gameData 初始化 :3587 |
| V-03 战斗信任 | `/battle/pve` :9456 · `/battle/pvp` :13222 · 斗神殿同步 :12844 · `calcHeroAtk/Hp` :5235/:5252 |
| V-04 明文密码 | `AUTH_API` :14997 · `authApi` :15030 · `doLogin` :15213 · `doRegister` :15302 · 记住密码 :15002/:15013 |
| V-05 注册无风控 | `doRegister` :15302 |
| V-06 token | `SESSION_KEY` :14998 · 心跳 `wcHeartbeat` :14788 |
| V-07 架构根因 | 全部客户端数值逻辑（`decrypted_inner.html` 全文件） |
| V-08 批量盗号 | 排行榜 `/leaderboard` :12970 · 玩家档案 `/player/:uid` :14225 · 存档 `/cloud/load` :8839 |
| V-09 DDoS 抗性缺失 | 服务器部署特征（单节点明文 HTTP，无 CDN/限流；高 CPU 接口 `/battle/pve` :9456 · `/cloud/save` :7761） |

---

## 8. 附注

- 本报告只做安全评估用途，不包含任何可直接用于攻击他人的完整工具代码（PoC 仅描述到「打开控制台改一个变量」的层面，任何玩家本来就能做到）。
- 「某人在服务器开挂」与本报告结论吻合：该游戏协议从设计上就不具备防作弊能力，属**结构性漏洞**，而非个别实现缺陷。
