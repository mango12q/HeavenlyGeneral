# AGENTS.md

《天朝小将 2.8》游戏分析 + 纯本地部署工作区（Windows / pwsh）。不是 git 仓库？是 git 仓库（HeavenlyGeneral，远程 GitHub），工作区为本目录。**本目录的游戏是纯本地版：不连接任何远程服务器。**

## 这是什么

从 `tianX`（APK 逆向工作区）复制而来的「天朝小将 2.8」游戏内容，用于：
- **分析**：阵容 / 玩法 / 战力 / 战斗（文档 + 原始游戏 HTML）
- **纯本地部署**：`game.html` 不连远程服务器，所有数据存本机浏览器

## 目录结构

```
tianchaoxiaojiang\
├── game.html               # 纯本地版游戏（已从最新源重建，逐字节验证过）
├── game.html.verified      # 已验证基线备份（重建校验用，已 .gitignore 不入库）
├── local-adapter.js        # 本地适配层：拦截 fetch/sendBeacon，模拟全部 API
├── auto-inject-saves.js    # 存档默认注入：打开游戏自动写入 99 个默认存档
├── saves_99.json           # 99 个存档数据（账号 1~99，按实战强度分配队伍）
├── decrypted_inner.html    # 原始游戏 HTML（未本地化，对照分析用）
├── decrypted_app_config.json
├── audio\  images\         # 本地静态资源（21 音频 + 89 怪物图 + 主角头像等）
├── play.bat                # 一键启动：8090 静态服务器 + 自动开浏览器
├── BATTLE_SYSTEM.md        # 战斗系统深度拆解（伤害/治疗/怒气/站位/技能目标）
├── GAME_DATA.md            # 游戏数据手册（武将/技能/装备/升星/关卡/兑换码）
├── PROTOCOL.md             # 服务器协议文档（供理解，本地版不连服务器）
├── SECURITY.md             # 安全漏洞评估（仅供学习）
├── NATIVE_LIBS.md          # 原生库分析
├── 最强战斗力阵容.md        # 最强阵容分析（PVP 模拟验证 + 流派克制链）
├── leaderboard_data.json   # 排行榜 150 名玩家采集数据
├── leaderboard_top10_teams.json  # TOP10 阵容
├── zheng_myteam.json       # 示例玩家阵容
├── 账号名单.md              # 账号名单（含历史备注，已 .gitignore 不入库）
└── tools\
    ├── localize_game.py    # 从 decrypted_inner.html 重建 game.html（纯本地化）
    ├── localize_patch.json # 本地化补丁（行级 diff 操作）
    ├── generate_saves.py   # 生成 saves_99.json（按实战强度分配 99 队）
    ├── import_saves.js     # 浏览器控制台手动注入存档脚本
    ├── analyze_leaderboard.py   # 排行榜分析（读 leaderboard_data.json，纯本地）
    ├── analyze_top10_heroes.py  # TOP10 英雄分析（需联网拉取，走代理）
    └── find_apis.py        # 从 decrypted_inner.html 提取 API 端点（纯本地）
```

## 本地化原理（重要）

`game.html` = `decrypted_inner.html` + 本地化补丁（`tools/localize_patch.json`，57 个行级操作）：

1. **静态资源改相对路径**：`http://103.236.98.227:3000/audio/*` → `audio/*`，`http://103.236.98.227:18880/images/*` → `images/*`
2. **注入** `<script src="local-adapter.js">`，运行时拦截 `window.fetch` 与 `navigator.sendBeacon`，把注册/登录/云存档/战斗/排行榜/聊天/帮派/邮件/云宝全部在本地模拟
3. **登录系统改 99 账号制**：账号 1~99，密码=账号数字；存档按账号分槽（`tianchaoxiaojiang_save_v3_<账号>`）；退出登录可切换账号；「重置账号」仅清空当前账号存档，不影响其他 98 个账号
4. **注入** `<script src="auto-inject-saves.js">`：全新环境自动把 `saves_99.json` 的 99 个存档写入 localStorage（已有进度则跳过），并触发斗神殿 99 人排行榜预注册
5. **斗神殿本地预注册**：local-adapter 启动后遍历 99 存档，计算战力/序列化队伍，自动注册进排行榜 → 斗神殿有 99 个可互战对手
6. **API 硬编码 URL（`DS_API`/`AUTH_API` 等约 21 处）保留不动**——它们全走 `fetch`/`sendBeacon`，由 local-adapter 运行时拦截，绝不产生外网请求

## 启动方式

- 双击 `play.bat` → 自动起 8090 静态服务器 + 打开浏览器 `http://127.0.0.1:8090/game.html`
- 或手动：`python -m http.server 8090 --directory .`，浏览器打开同一地址
- 双击 `game.html`（file:// 协议）也可，功能完整

## 重建 / 更新本地化游戏

若 `tianX` 的解密 HTML 更新，可重新生成：

```pwsh
python tools\localize_game.py decrypted_inner.html game.html
```

脚本会把补丁应用到最新源；若旧版 `game.html`（git HEAD）仍在，可放一份为 `game.html.verified` 做逐字节校验。

## 分析命令

```pwsh
# 排行榜分析（纯本地，读 leaderboard_data.json）
python tools\analyze_leaderboard.py

# TOP10 英雄/阵容分析（联网拉取实时数据 → 需走代理，严禁直连真实服务器）
python tools\analyze_top10_heroes.py

# 从原始 HTML 提取 API 端点（纯本地）
python tools\find_apis.py
```

## 存档管理（99 账号制）

- **默认自动注入**：打开游戏即自动把 `saves_99.json` 的 99 个存档写入 localStorage（全新环境才注入，不覆盖已有进度），并触发斗神殿 99 人排行榜预注册。
- **重新生成存档**：改 `tools/generate_saves.py` 后运行 `python tools\generate_saves.py` 生成新的 `saves_99.json`。
- **手动注入**：`tools/import_saves.js`（浏览器控制台执行，或 `fetch('saves_99.json')` 后写入 localStorage）。
- **强度分配**：账号 1 最强（T0 冠军：武神主角+齐天大圣+万妖皇+白骨精+黑山老妖）→ 账号 99 最弱，30 套 T0~T9 梯队循环。
- **存档槽位**：`tianchaoxiaojiang_save_v3_<账号>`；斗神殿排行榜数据在 `tcxj_local_db_v1.leaderboard`。

## 安全规范（沿用 tianX 工作区）

- **严禁本机直连真实游戏服务器 `103.236.98.227:3000`**。本目录游戏是纯本地版，正常游玩不会碰它。若确需联网验证/采集（如 `analyze_top10_heroes.py`），必须经代理（Clash `127.0.0.1:6789` 等）换出口后小规模进行。
- 产物（文档/脚本）中不得包含：本机 IP、主机名、MAC、宽带/运营商信息、本地绝对路径等个人身份信息；仅可保留作为分析目标的服务器 IP（默认保留）。
- 漏洞/作弊相关内容仅用于网络安全学习与授权测试，产出文档需保持「仅供学习研究」标注。
- 生成 Word 文档使用 `python-docx`，不要用 docx-js。
- **游戏服务器 IP 已加入 Clash 强制代理规则**（叠加层 `rYWAFaqFEr1O.yaml`）；若日后 APK 版本更新导致服务器 IP 变化，须同步修改规则文件并重载 Clash，否则会退化为直连暴露本机 IP。

## 注意

- `decrypted_inner.html` 为 **UTF-8 编码**（`<meta charset="UTF-8">`，已验证）；旧笔记曾误标为 GB18030，以本条为准。PowerShell 直接读中文可能乱码，用 `python` 脚本或指定编码读取。
- `game.html` 同样为 **UTF-8 编码**（与游戏本体一致），改动时勿转成 GB18030，否则中文乱码。
- 本目录是 git 仓库（HeavenlyGeneral，origin 为 GitHub）。提交前检查 `git status`/`git diff`，勿把账号名单中的真实密码、本机路径等敏感信息推上去。
