# 天朝小将 2.8 游戏服务器协议文档（完整版）

> 依据 `decrypted_inner.html` 客户端源码 + 真实服务器实测整理。
> 服务器：`http://103.236.98.227:3000`（HTTP 明文），图片/音频：同 IP `:18880` / `:3000`。
> 仅供学习研究使用。

---

## 1. 通用约定

| 项目 | 说明 |
|---|---|
| Base URL | `http://103.236.98.227:3000/api`（部分接口直连 `:3000` 根） |
| 客户端版本 | 所有请求头带 `x-client-version: 22`（= `CLIENT_VERSION`） |
| Content-Type | JSON 请求带 `application/json` |
| 压缩 | `/cloud/save` 等大请求，payload≥2KB 用 `Content-Encoding: gzip` |
| CORS | 服务器回显任意 `Origin` 头 → 桌面浏览器可直连 |
| 认证 | `sessionToken` 放请求体；帮派接口用 `Authorization: Bearer <token>` |
| 账号规则 | 账号 ≤8 字，密码 ≥4 位；密码明文传输 |

### 接口分组速查

| 分组 | 端点 |
|---|---|
| 认证 | `/auth/register` `/auth/login` `/check-name` `/heartbeat` `/account/changepwd` `/account/reset` |
| 云存档 | `/cloud/save` `/cloud/load` |
| 战斗 | `/battle/pve` `/battle/pvp` `/battle/story` |
| 斗神殿 | `/register` `/leaderboard` `/challenge` `/history` `/player/:uid/team` |
| 帮派 | `/guild/*`（见 §6） |
| 云宝 | `/yunbao/*`（见 §7） |
| 社交 | `/chat/*` `/friend/*` `/mail/*` |
| 杂项 | `/time` `/announcements/active` `/player/:uid` `/yunbao/broadcasts` |

---

## 2. 认证

### POST /auth/register
```json
{ "playerName": "账号", "password": "明文密码" }
```
→ `{ "success": true, "userId": "DS-xxxxxxxx-xxxxxx" }`
> 注册**不返回 token**，前端会立即再调一次 login 补 token。

### POST /auth/login
```json
{ "playerName": "账号", "password": "明文密码" }
```
→ `{ "success": true, "userId": "...", "sessionToken": "ST-xxxxxxxx-xxxxxx" }`

### GET /check-name?name=<url编码昵称>
→ `{ "success": true, "available": true|false }`

### POST /account/changepwd
```json
{ "userId": "...", "oldPassword": "...", "newPassword": "..." }
```
→ `{ "success": true }`

### POST /account/reset
```json
{ "userId": "..." }
```
→ `{ "success": true }`（GM 重置后 /cloud/load 返回 `resetRequired`）

### POST /heartbeat（每 10s）
```json
{ "userId": "...", "playerName": "...", "mainHeroName": "...",
  "totalPower": 4306, "sessionToken": "..." }
```
→ `{ "success": true, "lastActiveTime": "..." }`
> 服务端错误前缀：`KICKED:`（被顶号）/ `SESSION_EXPIRED`（token 失效）/ `BANNED:`（封号）
> `lastActiveTime` 即排行榜接口返回的最近心跳时刻：`GET /leaderboard` 每玩家的 `lastActiveTime` 距今 <2 分钟 ≈ 在线。在线查询：`python tools\check_online.py`。

---

## 3. 云存档

### POST /cloud/save
```json
{ "userId": "...", "saveData": "<JSON.stringify(gameData)>", "sessionToken": "...", "force": true }
```
- payload≥2KB 自动 gzip（`Content-Encoding: gzip`）
- `force` 绕过限流（429 时客户端稍后重试）
- 服务器**无任何校验**，原样存储 → 可任意篡改（SECURITY V-01）
- → `{ "success": true }`

### GET /cloud/load?userId=<userId>
→ `{ "success": true, "saveData": "<明文 JSON 存档>", "resetRequired": 0|1 }`
> 客户端加载后写 localStorage + 启动恢复。

---

## 4. 战斗（服务器模拟）

### POST /battle/pve
```json
{ "userId": "...", "battleType": "main_story"|"elite"|"coin", "stage": 1, "myTeam": [ 单元对象... ] }
```
→ `{ "success": true, "enemyTeam": [...], "combatRounds": [...], "result": "win"|"lose", "serverTime": ms }`
> 服务器用**客户端提交的 myTeam** 模拟（SECURITY V-03）。combatRounds 结构见 BATTLE_SYSTEM.md §10。

### POST /battle/story
```json
{ "userId": "...", "chapterStage": "1-3", "myTeam": [...] }
```
→ `{ success, enemyTeam, combatRounds, result, serverTime }`

### POST /battle/pvp（斗神殿/切磋）
```json
{ "userId": "...", "battleType": "doushen"|"spar", "defenderId": "...", "myTeam": [...] }
```
→ `{ "success": true, "result": "win"|"lose", "combatRounds": [...], "opponent": { "playerName": "..." } }`
> PVP 敌方阵容由客户端从挑战接口返回的 `teamData` 自行构建（服务器只回结果+回放）。

---

## 5. 斗神殿（PVP）

### POST /register（同步阵容/战力）
```json
{ "userId": "...", "playerName": "...", "displayName": "...", "mainHeroName": "...",
  "totalPower": 4306, "teamData": "<JSON stringify 阵容>" }
```
→ `{ "success": true, "player": { "rank": 228, "wins": 0, "losses": 0, "rankScore": 1000 } }`
> totalPower/teamData 均为客户端自报（SECURITY V-03）。

### GET /leaderboard?limit=50&offset=0&userId=...
→ `{ "success": true, "players": [ { userId, playerName, displayName, mainHeroName, totalPower, wins, losses } ], "total": N }`

### POST /challenge
```json
{ "attackerId": "...", "defenderId": "..." }
```
→ `{ "success": true, "defender": { "playerName": "...", "mainHeroName": "...", "teamData": [ 单元对象 ] } }`
> 冷却字段：`gameData.doushen.cooldownUntil`。

### GET /history?userId=...&limit=10
→ `{ "success": true, "history": [...] }`

### GET /player/:uid/team（切磋取对手阵容）
→ `{ "success": true, "teamData": [...], "player": { "playerName": "...", "totalPower": N } }`

### GET /player/:uid（玩家档案）
→ `{ "success": true, "player": { userId, playerName, mainHeroName, totalPower, wins, losses, rankScore, teamData, saveData, password, sessionToken, banned, rank, ... } }`
> ⚠️ 实测返回里**含明文 `password` 与 `sessionToken`** —— 服务端疑似明文存储（SECURITY V-04）。

---

## 6. 帮派（带 `Authorization: Bearer <token>`，搜索/列表除外）

| 端点 | 请求 | 响应要点 |
|---|---|---|
| `GET /guild/my?userId=` | — | `{ success, hasGuild, guild, members }` |
| `GET /guild/list?limit=20` | — | `{ success, guilds: [...] }` |
| `GET /guild/search?keyword=` | — | `{ success, guilds: [...] }` |
| `POST /guild/create` | `{ userId, name, ... }` | `{ success, guild }` |
| `POST /guild/apply` | `{ userId, guildId }` | `{ success }` |
| `POST /guild/leave` / `kick` / `approve` / `reject` | `{ userId, ... }` | `{ success }` |
| `POST /guild/contribute` | `{ userId, ... }` | `{ success, reward }` |
| `GET /guild/pending-count?userId=` | — | `{ success, pendingCount }` |
| `GET /guild/applications?guildId=` | — | `{ success, applications }` |
| `POST /guild/announcement` | `{ ... }` | `{ success }` |
| `/guild/caishen/*` | list/summon/prepare-rob/submit-rob | `{ success, list/caishen/reward }` |

> 帮派加入门槛：主角 ≥20 级。

---

## 7. 云宝 / 天界寻宝

| 端点 | 请求 | 响应要点 |
|---|---|---|
| `POST /yunbao/status` | `{ userId }` | `{ success, sendCount, sendLimit, robCount, robLimit, myYunbao: {id, endTime, status:'transporting'}, now }` |
| `POST /yunbao/list` | `{}` | `{ success, list: [ 云宝列表 ] }` |
| `POST /yunbao/start` | `{ userId, treasure, ... }` | `{ success }` |
| `POST /yunbao/settle` | `{ yunbaoId }` | `{ success, reward }` |
| `POST /yunbao/roll` | `{ userId }` | `{ success, result, item }` |
| `POST /yunbao/refresh` | `{ userId, rushCai }` | `{ success }` |
| `POST /yunbao/escort-counts` | `?userId=` | `{ success, counts: {escort, rob} }` |
| `POST /yunbao/prepare-rob` | `{ robberId, yunbaoId }` | `{ success, result:'win', combatRounds, stolenAmount, opponent:{playerName}, yunbao:{treasure, baseReward} }` |
| `GET /yunbao/broadcasts?since=` | — | `{ success, broadcasts: [...] }`（2s 轮播） |

---

## 8. 社交（聊天 / 好友 / 邮件）

### 聊天
| 端点 | 说明 |
|---|---|
| `GET /chat/messages?limit=N` | → `{ success, messages }`（世界频道） |
| `POST /chat/send` | `{ userId, playerName, message }` → `{ success }` |
| `GET /chat/private/messages?userId=` | → `{ success, messages }` |
| `POST /chat/private/send` | `{ fromUserId, toUserId, fromName, message }` |
| `GET /chat/private/unread?userId=` | → `{ success, unread }` |
| `GET /chat/private/unread-by-user?userId=` | → `{ success, unread }` |

### 好友
| 端点 | 说明 |
|---|---|
| `GET /friend/list?userId=` | → `{ success, friends }` |
| `GET /friend/requests?userId=` | → `{ success, requests }` |
| `POST /friend/add` `remove` `respond` | `{ userId, ... }` → `{ success }` |

### 邮件
| 端点 | 说明 |
|---|---|
| `GET /mail/list?userId=` | → `{ success, mails }` |
| `GET /mail/unread?userId=` | → `{ success, unread, count }` |
| `POST /mail/claim` `read` | `{ ... }` → `{ success }` |

---

## 9. 杂项

| 端点 | 说明 |
|---|---|
| `GET /time` | → `{ timestamp, version: 22 }`（版本校验，不一致弹「已更新」遮罩） |
| `GET /announcements/active` | → `{ success, announcements: [{id, content}] }`（顶部跑马灯） |
| `GET /player/:uid` | 玩家档案（含明文密码，见 §5） |
| `GET /audio/*.ogg` / `/images/*` | 音频 / 图片静态资源（`:3000` / `:18880`） |

---

## 10. 客户端本地存储键

| 键 | 位置 | 内容 |
|---|---|---|
| `tianchaoxiaojiang_save_v3` | localStorage | 完整存档 JSON（`gameData`） |
| `tcxj_session_v1` | sessionStorage | `{uid, name, st(sessionToken)}` |
| `tcxj_remember_v1` | localStorage | `{name, pwd: base64}`（记住密码） |
| `tcxj_remember_on` | localStorage | 记住密码勾选 |
| `tcxj_cloud_restored` | sessionStorage | 防云恢复死循环标记 |

---

## 11. 安全提示（与本协议相关的漏洞）

- 明文密码 / 明文 token / 明文存档（`password`、`sessionToken`、`saveData` 均明文）→ 中间人可盗号
- `/cloud/save` 无校验 → 存档任意篡改
- `/battle/*` 信任请求内 `myTeam` → 可伪造必赢
- `/register`(斗神殿) 信任自报 `teamData`/`totalPower` → 可刷榜
- 完整评估见 [`SECURITY.md`](SECURITY.md)

---

（完）
