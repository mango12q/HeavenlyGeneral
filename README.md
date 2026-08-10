# 天朝小将 2.8 · 纯本地版

《天朝小将 2.8》网页游戏的**完全本地化版本**：不连接任何远程服务器，所有数据存本机浏览器，双击即可游玩。

> 本仓库内容仅供网络安全学习与授权测试使用。

## 快速开始

**方式一（推荐）：双击 `play.bat`**
自动启动 8090 静态服务器并打开浏览器 `http://127.0.0.1:8090/game.html`。

**方式二：手动启动**
```bash
python -m http.server 8090 --directory .
```
浏览器打开 `http://127.0.0.1:8090/game.html`。

**方式三：直接打开**
双击 `game.html`（`file://` 协议，功能完整）。

## 本地化改造说明

| 功能 | 说明 |
|---|---|
| 登录 / 注册 | 99 账号制：账号 1~99，密码=账号数字；存档按账号分槽存本机 |
| 云存档 | 已移除，数据直接保存在浏览器 `localStorage` |
| 战斗 | 本地模拟，复用游戏内置战斗引擎生成战斗回放 |
| 存档 | 自动保存到本机浏览器对应账号槽位，刷新 / 重开自动恢复 |
| 切换账号 | 账号信息页「退出登录」可回到登录界面切换账号 |
| 重置账号 | 仅清空当前账号存档，不影响其他 98 个账号，清档后回登录界面 |
| 静态资源 | 音频、图片、怪物头像全部下载到本地 `audio/`、`images/` |

### 降级内容（无真实玩家）
- 聊天、好友、公会、邮件：返回空数据（无其他玩家）
- 排行榜、斗神殿：只有本地自己
- 云宝、帮派战：本地模拟

## 目录结构

```
tianchaoxiaojiang/
├── game.html               # 纯本地版游戏（已从最新源重建，逐字节验证过）
├── game.html.verified      # 已验证基线备份（用于 localize_game.py 逐字节校验，不入库）
├── local-adapter.js        # 本地适配层：拦截 fetch/sendBeacon，模拟全部 API
├── decrypted_inner.html    # 原始游戏 HTML（未本地化，对照分析用）
├── decrypted_app_config.json
├── audio/  images/         # 本地静态资源（21 音频 + 89 怪物图 + 主角头像等）
├── play.bat                # 一键启动：8090 静态服务器 + 自动开浏览器
├── BATTLE_SYSTEM.md        # 战斗系统深度拆解（伤害/治疗/怒气/站位/技能目标）
├── GAME_DATA.md            # 游戏数据手册（武将/技能/装备/升星/关卡/兑换码）
├── PROTOCOL.md             # 服务器协议文档（供理解，本地版不连服务器）
├── SECURITY.md             # 安全漏洞评估（仅供学习）
├── NATIVE_LIBS.md          # 原生库分析
├── leaderboard_data.json   # 排行榜 150 名玩家采集数据
├── leaderboard_top10_teams.json  # TOP10 阵容
├── zheng_myteam.json       # 示例玩家阵容
└── tools/
    ├── localize_game.py    # 从 decrypted_inner.html 重建 game.html（纯本地化）
    ├── localize_patch.json # 本地化补丁（行级 diff 操作）
    ├── analyze_leaderboard.py   # 排行榜分析（读 leaderboard_data.json，纯本地）
    ├── analyze_top10_heroes.py  # TOP10 英雄分析（需联网拉取，走代理）
    └── find_apis.py        # 从原始 HTML 提取 API 端点（纯本地）
```

## 本地化原理

`game.html` = `decrypted_inner.html` + 本地化补丁（`tools/localize_patch.json`，57 个行级操作）：

1. **静态资源改相对路径**：`http://103.236.98.227:3000/audio/*` → `audio/*`，`http://103.236.98.227:18880/images/*` → `images/*`
2. **注入** `<script src="local-adapter.js">`，运行时拦截 `window.fetch` 与 `navigator.sendBeacon`，把注册/登录/云存档/战斗/排行榜/聊天/帮派/邮件/云宝全部在本地模拟
3. **登录 / 云存档 UI 改本地版**：无需账号密码，自动创建本地账号；存档写入 `localStorage`；「重置账号」清空全部本地数据
4. **API 硬编码 URL（`DS_API`/`AUTH_API` 等约 21 处）保留不动**——它们全走 `fetch`/`sendBeacon`，由 local-adapter 运行时拦截，绝不产生外网请求

## 重建 / 更新本地化游戏

若 `tianX` 的解密 HTML 更新，可重新生成：

```bash
python tools/localize_game.py <源decrypted_inner.html> game.html
```

脚本会把补丁应用到最新源；若旧版 `game.html` 仍可用，放一份为 `game.html.verified` 做逐字节校验。

## 分析命令

```bash
# 排行榜分析（纯本地，读 leaderboard_data.json）
python tools/analyze_leaderboard.py

# TOP10 英雄 / 阵容分析（联网拉取实时数据 → 需走代理，严禁直连真实服务器）
python tools/analyze_top10_heroes.py

# 从原始 HTML 提取 API 端点（纯本地）
python tools/find_apis.py
```

## 安全规范

- 本目录游戏为纯本地版，正常游玩不连接真实游戏服务器；确需联网验证 / 采集时须经代理换出口后小规模进行。
- 产物（文档 / 脚本）中不得包含本机 IP、主机名、MAC、宽带 / 运营商信息、本地绝对路径等个人身份信息。
- 漏洞 / 作弊相关内容仅用于网络安全学习与授权测试。
- 账号密码类敏感数据（如 `账号名单.md`）严禁提交入库，已通过 `.gitignore` 排除。
