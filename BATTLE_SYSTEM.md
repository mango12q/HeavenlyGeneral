# 天朝小将 2.8 战斗系统深度拆解

> 基于 `decrypted_inner.html`（4.5MB 解密后的游戏本体）源码逆向。
> 行号均为 `decrypted_inner.html` 内实际行号。
> 本文档仅供网络安全学习 / 逆向研究使用。

---

## 1. 战斗总览

游戏采用**双端战斗架构**：

```
客户端                          服务器（103.236.98.227:3000）
  构建 myTeam（前端算好 hp/atk）
       │  POST /battle/pve {myTeam, battleType, stage}
       ▼
                        服务器按 myTeam 模拟回合，产出：
                        {enemyTeam, combatRounds[], result, serverTime}
       ▲
       │  返回
  客户端用 universalReplayBattle 回放 combatRounds（动画 + 结算）
```

- **绝大多数战斗**（主线/精英/铜钱/剧情/斗神殿/切磋）由**服务器模拟**，客户端只做回放。
- **搜打撤（`sfStartBattle`，行 20350）是唯一的例外**：完全由客户端本地回合制引擎模拟，不请求服务器。
- 服务器模拟的依据是**客户端提交的 `myTeam`**（含攻击者算好的 atk/hp/skill），服务器不做二次校验 → 详见 SECURITY.md 漏洞 V-03。

### 战斗单元数据结构

双方单位统一结构（客户端构造，`decrypted_inner.html:10579` 等）：

```js
{
  name: '齐天大圣',          // 显示名
  heroName: '武神主角',      // 源武将名（用于技能/头像）
  hp: 280, maxHp: 280,       // 当前/最大生命
  atk: 28,                   // 攻击力（敌方单位直接给 atk，己方由 calcHeroAtk 算出）
  position: 3,               // 九宫格站位 1~9
  xianfeng: 0,               // 先攻值（决定出手顺序）
  rage: 50,                  // 怒气（初始 50）
  skill: '霸气护体',         // 技能名（己方单位）
  skillType: 'single',       // 技能类型（见 §8）
  skillName: '霸气护体',     // 技能名（敌方单位字段）
  skillMul: 1.5,             // 技能倍率
  job: '武神',               // 职业（'天师' 为法系，其余物理）
  isMainHero: true,          // 是否主角
  specialStats: {...}        // 8 项特殊属性（见 §2）
}
```

---

## 2. 特殊属性（specialStats）

默认值（`decrypted_inner.html:2172`）：

| 字段 | 中文 | 作用 |
|---|---|---|
| `crit` | 暴击率 | 触发暴击，伤害 ×(2+deadly/100) |
| `tenacity` | 韧性 | 减少被暴击率（命中方 crit 减去该值） |
| `block` | 格挡率 | 触发格挡，伤害 ×0.5 |
| `pierce` | 破击 | 减少对方格挡率 |
| `deadly` | 必杀 | 暴击伤害倍率加成（百分比） |
| `healBonus` | 天疗 | 治疗量百分比加成 |
| `hit` | 命中 | 减少对方闪避率 |
| `dodge` | 闪避率 | 触发则本次伤害为 0 |

部分武将自带初始属性（`HERO_SPECIAL_STATS`，行 2184）：
- 斗皇主角 `{crit:30, dodge:20}`
- 齐天大圣 `{crit:30, pierce:20, hit:20, deadly:10}`
- 孙悟空 `{crit:20, pierce:20, deadly:15}` 等

---

## 3. 伤害公式（calcDamage，行 7574）

`calcDamage(attacker, defender, baseDamage, isMagic)`，按顺序判定：

```
1. 闪避判定
   dodgeRate = max(0, 防御方.dodge - 攻击方.hit)
   if random*100 < dodgeRate → 伤害 0（闪避）

2. 暴击判定
   critRate = max(0, 攻击方.crit - 防御方.tenacity)
   if random*100 < critRate → 暴击，伤害 ×(2 + 攻击方.deadly/100)

3. 格挡判定
   blockRate = max(0, 防御方.block - 攻击方.pierce)
   if random*100 < blockRate → 伤害 ×0.5

4. 防御减免
   def = isMagic ? 防御方.magicDef : 防御方.physDef
   if def > 0 → 伤害 = max(伤害*0.1, 伤害 - def)     // 最多减免 90%

5. 最终增减伤
   伤害 = 伤害 × (1 + 攻击方.finalDmgUp/100) × (1 - 防御方.finalDmgReduce/100)
   伤害 = max(1, 伤害)   // 保底 1 点

返回 {damage, isCrit, isDodge, isBlock}
```

技能伤害基础值：`baseDmg = attacker.atk × skill.mul × getRageBonus(attacker.rage)`

---

## 4. 治疗公式（calcHeal，行 7627）

```
finalHeal = baseHeal × (1 + 治疗方.healBonus/100)
治疗可暴击：if random*100 < 治疗方.crit → finalHeal ×= (2 + 治疗方.deadly/100)
实际回血 = min(finalHeal, 目标.maxHp - 目标.hp)
```

---

## 5. 怒气机制

| 常量 | 值 | 含义 |
|---|---|---|
| `INIT_RAGE` | 50 | 开局怒气 |
| `RAGE_THRESHOLD` | 100 | 达到即可释放技能 |
| `MAX_RAGE` | 150 | 怒气上限 |
| `RAGE_PER_HIT` | 25 | 普攻命中：攻击方与目标各 +25 |

怒气加成（`getRageBonus`，行 6701）：

```
seg = floor(rage / 25)
bonus = clamp(1.0 + 0.25*(seg-4), 1.0, 1.5)
// 100 怒气=1.0x，125=1.25x，150=1.5x（封顶）
```

规则：
- 怒气 ≥ 100 → 释放技能，怒气清 0（若有 `_pendingRageGain` 立即应用）
- 普攻命中（非闪避）→ 攻击方与目标各 +25
- 部分技能效果可额外加/减怒气（`applySkillEffects` 里的 `rage` 效果）

---

## 6. 行动顺序（getActionOrder，行 20408）

搜打撤引擎的出手顺序算法（服务器引擎逻辑应一致）：

1. 存活单位按 `position` 升序排列
2. 计算双方 `xianfeng` 总值，**总值高的一方先手**
3. 双方按位置**交替**出手（我方→敌方→我方→…），直到一方出手完，剩余由另一方继续

---

## 7. 站位与九宫格

`getPosRow(pos)`（行 9012）把 1~9 号位映射为左中右三列：

```
列 1: 位置 1,4,7   （前排→后排）
列 2: 位置 2,5,8
列 3: 位置 3,6,9
```

普攻目标选择（`getNormalAttackTarget`，行 9021）：
- 以攻击者所在列为基准，列优先顺序 = 自己列 → 下一列 → 绕回
- 列内按位置号从小到大（前排优先）

---

## 8. 技能目标选择（getSkillTargets，行 9038）

按 `skillType` 分支：

| 类型 | 效果 |
|---|---|
| `single` | 单体：优先普攻目标，否则按列优先找第一个 |
| `front3` / `front2` | 前排 3 / 2 个存活目标 |
| `all` | 全体存活目标 |
| `last` | 最后排单体 |
| `column` | 纵列：普攻目标所在列的所有目标 |
| `row` | 横排：普攻目标所在横排的所有目标 |
| `backSingle` | 后排单体：普攻目标所在列最后排 |
| `rageHighest` | 怒气最高的单体 |
| `lowestHp` | 血量百分比最低的单体 |
| `healAll` / `healFront2` / `healFront3` | 治疗：全体 / 前排 2 / 3 个友军 |
| `healColumn` | 治疗：与施法者同列友军 |
| `healLowest` | 治疗：血量百分比最低友军 |
| 其他 | 默认打第一个存活目标 |

---

## 9. Buff / Debuff（applySkillEffects，行 19703）

技能可带 `effects` 数组，每项格式：

```js
{ target: 'self'|'enemy', duration: 回合数, chance: 概率, 
  rage: ±N, stun: 眩晕回合数, crit/dodge/hit/block/pierce/tenacity/deadly/healBonus/defense: ±N% }
```

- `target:'self'` → 给自己上 buff / 加怒气 / 眩晕
- `target:'enemy'` → 给命中目标上 debuff
- 回合结束 `reduceBuffRounds`（行 20602）递减剩余回合
- `stun` → 眩晕期间无法行动

---

## 10. 服务器战斗协议（combatRounds）

### 10.1 请求

```
POST /battle/pve   {userId, battleType: 'main_story'|'elite'|'coin', stage, myTeam}
POST /battle/story {userId, chapterStage: '1-3', myTeam}
POST /battle/pvp   {userId, battleType: 'doushen'|'spar', defenderId, myTeam}
```

### 10.2 响应

```json
{
  "success": true,
  "enemyTeam": [ {单元对象}, ... ],
  "combatRounds": [ {回合动作}, ... ],
  "result": "win" | "lose",
  "serverTime": 1786021306036
}
```

### 10.3 combatRounds 单条结构

每个 `cr` 描述**一次出手**后双方各单位的精确 hp/怒气：

| 字段 | 说明 |
|---|---|
| `actorTeam` | 'A'（我方）/ 'B'（敌方）/ 'SYSTEM'（系统消息） |
| `actorIdx` | 出手单位在队伍数组中的下标 |
| `actorHp` / `actorRage` / `actorMaxHp` | 出手后自己的状态 |
| `targetTeam` / `targetIdx` / `targetHp` / `targetRage` / `targetMaxHp` | 单体目标状态 |
| `aoeTargets` | 群体技能：`[{team, idx, hp, maxHp, rage}]` |
| `healTargets` | 治疗：`[{team, idx, hp, maxHp, rage, heal}]`（`isHeal:true` 时） |
| `isSkill` | 是否技能 |
| `log` | 日志文本 |
| `fullRound` | 回合序号 |
| `isStatusSkip` | 眩晕等无法行动标记 |

### 10.4 回放（universalReplayBattle，行 16300）

- 用 `renderBattleUnits` 渲染九宫格
- 逐条 `playNext()` 消费 `combatRounds`，每条约几百 ms（受倍速影响）
- 每回合先应用 buff 事件（`applyEffectEvents`），再 `applyCombatRound`（行 16162）直接把 hp/怒气写入单位对象
- 30 回合上限：按剩余总血量判定胜负
- 结束调 `onComplete(result)` → 胜利走 `battleWin` 结算，失败记录跳过冷却

---

## 11. 敌人生成

### 11.1 主线 / 精英（createEnemy，行 6531）

- 等级缩放：主线 ≤30 关 `baseLv=stage×4`，31~90 关 `×8`（难度×1.6），>90 关增长放缓；精英全程 `×8`
- 敌人数量：10 关后 4 个、20 关后 5 个、精英至少 4 个
- 首领/BOSS：每 30 关 BOSS，`精英首领` 血量 ×2.8×0.7
- 随机强力英雄混入敌方阵营（赵云/关羽/张飞…，属性 ×1.2）
- **关卡种子随机**（`stage*17+100003`）→ 同一关卡所有玩家、每次挑战敌人固定

### 11.2 铜钱副本（createCoinEnemies，行 10463）

- 从封神殿英雄池随机抽 5 个英雄作敌人
- `baseLv = stage×10+5`，难度 `1+(stage-1)×0.8`
- 同样用关卡种子固定随机

### 11.3 搜打撤（sfCreateEnemy）

- 按难度 + 波次生成，纯客户端

### 11.4 剧情副本

- 敌人由服务器返回，按章节阶段生成

---

## 12. 战斗奖励（battleWin，行 7647）

| 模式 | 通关奖励 |
|---|---|
| 主线 | `stage` 递增；铜钱 `stage×270`；声望 `min(stage,120)×25`；天币 `floor(rand(5..8)×1.5)` |
| 精英 | `eliteStage` 递增；铜钱 `stage×380`；声望 `×50`；升级石 `stage×22`；天币 `floor(rand(10..23)×1.5)` |

失败则记录跳过冷却（`gameData.skipCooldownUntil`），铜钱副本每日限次数。

---

## 13. 搜打撤独立引擎（sfStartBattle，行 20350）

唯一的纯客户端战斗：不请求服务器。流程：
1. `sfCreateEnemy` 生成敌方 → `sfBuildMyTeam` 构建我方
2. 循环：`getActionOrder` 决定出手顺序 → 每单位判定怒气/眩晕 → 选目标 → 放技能/普攻
3. `doAttackSkillNew` / `doHealSkillNew`（行 9261/9281）直接改 hp
4. 30 回合上限判负；胜利 `sfHandleWin`

---

## 14. 与安全漏洞的关联

- 服务器用**客户端提交的 `myTeam`** 模拟战斗 → 改属性即可必赢（SECURITY V-03）
- 战报 `combatRounds` 与结算 `result` 完全由服务器返回，客户端无法伪造结果，但**可伪造输入**
- 战力 `totalPower` 由客户端计算上报 → 排行榜可刷（斗神殿 `/register` 上传 `teamData`）

---

（完）
