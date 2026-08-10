/* =========================================================================
 * 天朝小将 本地适配层 (Local Adapter)
 * -------------------------------------------------------------------------
 * 作用：把原本连真实服务器(103.236.98.227:3000)的游戏完全本地化：
 *   1. 拦截 window.fetch，所有 API 请求在本地模拟
 *   2. 本地账号系统（localStorage 存储）
 *   3. 本地云存档（localStorage 存储）
 *   4. 本地战斗模拟器（复用游戏引擎纯逻辑函数生成 combatRounds）
 *   5. 聊天/好友/公会/邮件/排行榜/云宝 降级为本地模拟
 * 无需任何服务器，双击 index.html 或用任意静态服务器即可游玩。
 * ========================================================================= */

(function () {
  'use strict';
  if (window.__localAdapterInstalled) return;
  window.__localAdapterInstalled = true;

  var LS_KEY = 'tcxj_local_accounts_v1';
  var SAVE_KEY = 'tianchaoxiaojiang_save_v3';
  var SESSION_KEY = 'tcxj_session_v1';
  var SERVER_HOST = '103.236.98.227:3000';
  var IMG_HOST = '103.236.98.227:18880';

  function log() {
    try { console.log('[本地]', Array.prototype.join.call(arguments, ' ')); } catch (e) {}
  }
  function warn() {
    try { console.warn('[本地]', Array.prototype.join.call(arguments, ' ')); } catch (e) {}
  }

  /* ---------------- 本地账号存储 ---------------- */
  function getAccounts() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveAccounts(a) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function makeUserId(name) {
    var seed = 'DS-' + name + '-' + Date.now() + '-' + Math.random();
    var hash = 0;
    for (var i = 0; i < seed.length; i++) { hash = (hash * 31 + seed.charCodeAt(i)) >>> 0; }
    return 'DS-' + hash.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function makeToken() {
    return 'ST-' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);
  }

  // ===== 本地版：自动创建本地账号并写会话 =====
  // 返回 session 对象；若已有会话则直接返回现有会话。
  window.__localCreateSession = function () {
    try {
      var existing = null;
      try {
        var raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) existing = JSON.parse(raw);
      } catch (e) {}
      if (existing && existing.uid) {
        return existing;
      }
      var db = getAccounts();
      var key = '本地玩家';
      var acc = db[key];
      var uid;
      if (acc) {
        uid = acc.userId;
      } else {
        uid = makeUserId(key);
        db[key] = { password: 'local', userId: uid };
        saveAccounts(db);
      }
      var sess = { uid: uid, name: key, st: makeToken() };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess)); } catch (e) {}
      log('已自动创建本地账号:', uid);
      return sess;
    } catch (e) {
      warn('__localCreateSession 异常:', e);
      return null;
    }
  };

  /* ---------------- 存档工具 ---------------- */
  function getSave(userId) {
    try {
      var all = JSON.parse(localStorage.getItem('tcxj_local_saves_v1')) || {};
      return all[userId] || null;
    } catch (e) { return null; }
  }
  function putSave(userId, saveData) {
    try {
      var all = JSON.parse(localStorage.getItem('tcxj_local_saves_v1')) || {};
      all[userId] = saveData;
      localStorage.setItem('tcxj_local_saves_v1', JSON.stringify(all));
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 本地数据库（排行榜/聊天等） ---------------- */
  var DB = null;
  function getDb() {
    if (DB) return DB;
    try { DB = JSON.parse(localStorage.getItem('tcxj_local_db_v1')) || {}; } catch (e) { DB = {}; }
    if (!DB.accounts) DB.accounts = {};
    if (!DB.messages) DB.messages = [];
    if (!DB.mails) DB.mails = {};
    if (!DB.friends) DB.friends = {};
    if (!DB.guilds) DB.guilds = [];
    if (!DB.leaderboard) DB.leaderboard = [];
    return DB;
  }
  function saveDb() {
    try { localStorage.setItem('tcxj_local_db_v1', JSON.stringify(getDb())); } catch (e) {}
  }

  /* ================== 本地战斗模拟器 ==================
   * 复用游戏引擎纯逻辑函数，生成与服务器格式一致的 combatRounds。
   * 依赖（注入时游戏脚本已加载，运行时可访问）：
   *   calcDamage, calcHeal, getRageBonus, getSkillTargets,
   *   applySkillEffects, reduceBuffRounds, getActionOrder,
   *   INIT_RAGE, MAX_RAGE, RAGE_THRESHOLD, RAGE_PER_HIT,
   *   DEFAULT_SPECIAL_STATS
   */
  function buildLocalTeam(hs) {
    var MAX_RAGE_V = (typeof MAX_RAGE !== 'undefined') ? MAX_RAGE : 150;
    var res = [];
    hs.forEach(function (h, i) {
      var atk = (typeof calcHeroAtk === 'function') ? calcHeroAtk(h) : (h.baseAtk || 10);
      var hp = (typeof calcHeroHp === 'function') ? calcHeroHp(h) : (h.baseHp || 100);
      var skill = { mul: 1.0, type: 'single', name: '普通攻击' };
      if (typeof getSkillConfig === 'function') skill = getSkillConfig(h.name, h.isMainHero);
      var ava = '';
      if (typeof avatarMap !== 'undefined' && typeof getAvatar === 'function') ava = getAvatar(h.name) || '';
      if (h.name === '武神主角') ava = 'images/wsnan.png';
      else if (h.name === '天师主角') ava = 'images/tsnan.png';
      else if (h.name === '斗皇主角') ava = 'images/dhnan.png';
      var disp = h.name;
      if (typeof getHeroDisplayName === 'function') disp = getHeroDisplayName(h);
      var xf = (h.level || 1) * 5;
      if (typeof window.heroXianfeng === 'function') xf = window.heroXianfeng(h);
      var stats = (typeof window.getEffectiveStats === 'function') ? window.getEffectiveStats(h) : (h.specialStats || {});
      var rage = (typeof window.calcInitRage === 'function') ? window.calcInitRage(h) : ((typeof INIT_RAGE !== 'undefined') ? INIT_RAGE : 50);
      res.push({
        name: disp, heroName: h.name, avatar: ava,
        skill: h.isMainHero ? (h.skill || skill.name) : skill.name,
        skillType: skill.type, skillMul: (h.isMainHero ? (h.skillDmgMul || skill.mul) : skill.mul),
        skillEffects: (skill && skill.effects) ? skill.effects : [],
        atk: atk, hp: hp, maxHp: hp, index: i, position: (i % 9) + 1,
        xianfeng: xf, isMainHero: !!h.isMainHero, rage: rage,
        job: h.job || '武神', specialStats: stats, buffs: []
      });
    });
    return res;
  }

  function normalizeUnit(u) {
    if (!u.specialStats) u.specialStats = {};
    if (!u.buffs) u.buffs = [];
    if (!u.position) u.position = 0;
    return u;
  }

  function getBattleStats(unit) {
    var stats = Object.assign({}, unit.specialStats || {});
    (unit.buffs || []).forEach(function (b) {
      if (b.remainingRounds > 0) {
        for (var k in b) {
          if (k !== 'remainingRounds' && k !== 'source' && k !== 'id' && k !== 'name' && k !== 'kind') {
            stats[k] = (stats[k] || 0) + b[k];
          }
        }
      }
    });
    return stats;
  }

  function getActionOrderOf(myTeam, enemyList) {
    var myAlive = myTeam.filter(function (u) { return u.hp > 0; });
    var enAlive = enemyList.filter(function (u) { return u.hp > 0; });
    myAlive.sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
    enAlive.sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
    var mt = 0, et = 0;
    myAlive.forEach(function (u) { mt += u.xianfeng || 0; });
    enAlive.forEach(function (u) { et += u.xianfeng || 0; });
    var myFirst = mt >= et;
    var order = [];
    var mi = 0, ei = 0;
    while (mi < myAlive.length || ei < enAlive.length) {
      if (myFirst) {
        if (mi < myAlive.length) { order.push({ unit: myAlive[mi], side: 'A' }); mi++; }
        if (ei < enAlive.length) { order.push({ unit: enAlive[ei], side: 'B' }); ei++; }
      } else {
        if (ei < enAlive.length) { order.push({ unit: enAlive[ei], side: 'B' }); ei++; }
        if (mi < myAlive.length) { order.push({ unit: myAlive[mi], side: 'A' }); mi++; }
      }
      if (mi >= myAlive.length || ei >= enAlive.length) break;
    }
    while (mi < myAlive.length) { order.push({ unit: myAlive[mi], side: 'A' }); mi++; }
    while (ei < enAlive.length) { order.push({ unit: enAlive[ei], side: 'B' }); ei++; }
    return order;
  }

  function findNormalTarget(attacker, isMy, myTeam, enemyList) {
    var defenders = isMy ? enemyList : myTeam;
    var alive = defenders.filter(function (d) { return d.hp > 0; });
    if (alive.length === 0) return null;
    if (typeof getPosRow === 'function' && typeof window.getPosRow !== 'undefined') {
      var pos = attacker.position || 0;
      var col = window.getPosRow(pos);
      var colOrder = col === 1 ? [1, 2, 3] : col === 2 ? [2, 3, 1] : [3, 2, 1];
      for (var ci = 0; ci < colOrder.length; ci++) {
        var c = colOrder[ci];
        var inCol = [];
        alive.forEach(function (d) { if (window.getPosRow(d.position) === c) inCol.push(d); });
        if (inCol.length > 0) {
          inCol.sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
          return inCol[0];
        }
      }
    }
    return alive[0];
  }

  function selectSkillTargets(skillType, attackerArr, defenderArr, normalTarget) {
    if (typeof getSkillTargets === 'function') {
      try {
        var extraArg = getSkillTargets.length >= 5 ? normalTarget : undefined;
        var t = getSkillTargets(skillType, attackerArr, defenderArr, false, extraArg);
        if (t && t.length) return t;
      } catch (e) {}
    }
    var alive = defenderArr.filter(function (t) { return t.hp > 0; });
    if (skillType === 'single' || skillType === 'last' || !skillType) {
      if (normalTarget && normalTarget.hp > 0) return [normalTarget];
      if (skillType === 'last') { var arr = alive.slice(); return arr.length ? [arr[arr.length - 1]] : []; }
      return alive.length ? [alive[0]] : [];
    }
    if (skillType === 'front3' || skillType === 'front2') {
      var n = skillType === 'front3' ? 3 : 2;
      return alive.slice(0, n);
    }
    if (skillType === 'all') return alive;
    if (skillType === 'lowestHp') {
      if (!alive.length) return [];
      var low = alive[0];
      alive.forEach(function (t) { if ((t.hp / t.maxHp) < (low.hp / low.maxHp)) low = t; });
      return [low];
    }
    return alive.length ? [alive[0]] : [];
  }

  function selectHealTargets(skillType, attackerArr, myTeam, enemyList, isMy) {
    var allies = isMy ? myTeam : enemyList;
    var alive = allies.filter(function (t) { return t.hp > 0; });
    if (skillType === 'healAll') return alive;
    if (skillType === 'healFront2' || skillType === 'healFront3') {
      var n = skillType === 'healFront2' ? 2 : 3;
      var sorted = alive.slice().sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
      return sorted.slice(0, n);
    }
    if (skillType === 'healLowest') {
      if (!alive.length) return [];
      var low = alive[0];
      alive.forEach(function (t) { if (t.hp < low.hp) low = t; });
      return [low];
    }
    if (skillType === 'healColumn') {
      var pos = null;
      return alive.filter(function (t) { return true; });
    }
    return alive.length ? [alive[0]] : [];
  }

  function applySkillEffectsLocal(attacker, targets, skill, isMy, myTeam, enemyList, round, rounds) {
    if (typeof applySkillEffects === 'function') {
      try {
        applySkillEffects(attacker, targets, skill, isMy, myTeam, enemyList, round);
        return rounds;
      } catch (e) {}
    }
    var effects = skill.effects || [];
    effects.forEach(function (eff) {
      var tgt = eff.target === 'self' ? [attacker] : targets;
      tgt.forEach(function (u) {
        if (!u.buffs) u.buffs = [];
        var buff = { id: 'local-' + round + '-' + Math.random(), kind: (eff.target === 'self' ? 'buff' : 'debuff'), remainingRounds: eff.duration || 1 };
        ['crit', 'dodge', 'hit', 'pierce', 'deadly', 'block', 'tenacity', 'healBonus', 'defPct', 'stun'].forEach(function (k) {
          if (eff[k] !== undefined) buff[k] = eff[k];
        });
        if (eff.rage !== undefined) {
          u.rage = Math.max(0, Math.min((typeof MAX_RAGE !== 'undefined' ? MAX_RAGE : 150), (u.rage || 0) + eff.rage));
        }
        if (buff.stun) u.stunRounds = buff.stun;
        u.buffs.push(buff);
      });
    });
    return rounds;
  }

  function snapshot(team, teamKey, idx) {
    var u = team[idx];
    if (!u) return null;
    return { team: teamKey, idx: idx, hp: Math.max(0, Math.floor(u.hp)), maxHp: u.maxHp, rage: Math.round(u.rage || 0) };
  }

  function localBattleSimulate(myTeamIn, enemyTeamIn, maxRounds) {
    var MAX_RAGE_V = (typeof MAX_RAGE !== 'undefined') ? MAX_RAGE : 150;
    var THRESHOLD = (typeof RAGE_THRESHOLD !== 'undefined') ? RAGE_THRESHOLD : 100;
    var PER_HIT = (typeof RAGE_PER_HIT !== 'undefined') ? RAGE_PER_HIT : 25;
    var rounds = [];
    var myTeam = myTeamIn.map(normalizeUnit);
    var enemyList = enemyTeamIn.map(normalizeUnit);
    var battleEnd = false;
    var round = 1;

    function reduceBuffRoundsLocal(arr) {
      arr.forEach(function (u) {
        (u.buffs || []).forEach(function (b) { b.remainingRounds--; });
        u.buffs = (u.buffs || []).filter(function (b) { return b.remainingRounds > 0; });
        if (u.stunRounds > 0) u.stunRounds--;
      });
    }

    while (!battleEnd && round <= maxRounds) {
      var actionOrder = getActionOrderOf(myTeam, enemyList);
      for (var ai = 0; ai < actionOrder.length; ai++) {
        var act = actionOrder[ai];
        var unit = act.unit;
        var isMy = act.side === 'A';
        if (unit.hp <= 0) continue;

        var actorIdx = (isMy ? myTeam : enemyList).indexOf(unit);
        var actorTeamKey = isMy ? 'A' : 'B';

        // 眩晕
        if (unit.stunRounds > 0) {
          rounds.push({
            actorTeam: actorTeamKey, actorIdx: actorIdx,
            actorHp: Math.floor(unit.hp), actorRage: Math.round(unit.rage), actorMaxHp: unit.maxHp,
            targetTeam: actorTeamKey, targetIdx: actorIdx,
            targetHp: Math.floor(unit.hp), targetRage: Math.round(unit.rage), targetMaxHp: unit.maxHp,
            isSkill: false, isStatusSkip: true, fullRound: round,
            log: (unit.name || '') + ' 被眩晕，无法行动'
          });
          continue;
        }

        var skill = {
          name: unit.skill || unit.skillName || '普通攻击',
          type: unit.skillType || 'single',
          mul: unit.skillMul || 1.0,
          effects: unit.skillEffects || []
        };
        var isHeal = skill.type && skill.type.indexOf('heal') === 0;
        var isMagic = unit.job === '天师';
        var isSkill = (unit.rage || 0) >= THRESHOLD && skill.type;

        var defenders = isMy ? enemyList : myTeam;
        var attackers = isMy ? myTeam : enemyList;
        var normalTarget = findNormalTarget(unit, isMy, myTeam, enemyList);

        if (isSkill) {
          var targets;
          if (isHeal) {
            targets = selectHealTargets(skill.type, attackers, myTeam, enemyList, isMy);
          } else {
            targets = selectSkillTargets(skill.type, attackers, defenders, normalTarget);
          }
          var logText = unit.name + ' 释放【' + skill.name + '】';

          // buff 事件（显示用）
          var beforeEffects = [];
          var cr = {
            actorTeam: actorTeamKey, actorIdx: actorIdx,
            actorHp: Math.floor(unit.hp), actorRage: Math.round(unit.rage), actorMaxHp: unit.maxHp,
            targetTeam: 'A', targetIdx: 0,
            targetHp: 0, targetRage: 0, targetMaxHp: 0,
            isSkill: true, isHeal: isHeal, skillName: skill.name, skillType: skill.type,
            fullRound: round, log: logText, beforeEffects: beforeEffects
          };

          if (isHeal) {
            var healTargets = [];
            targets.forEach(function (t) {
              if (t.hp <= 0) return;
              var tidx = (isMy ? myTeam : enemyList).indexOf(t);
              var baseHeal = unit.atk * skill.mul * getRageBonus(unit.rage || 0);
              var healRes = (typeof calcHeal === 'function') ? calcHeal(unit, baseHeal) : { heal: baseHeal, isCrit: false };
              var oldHp = t.hp;
              var actual = Math.min(healRes.heal, t.maxHp - t.hp);
              t.hp = Math.min(t.maxHp, t.hp + actual);
              healTargets.push({
                team: actorTeamKey, idx: tidx, hp: Math.floor(t.hp), maxHp: t.maxHp,
                rage: Math.round(t.rage || 0), heal: Math.round(actual), crit: !!healRes.isCrit
              });
            });
            cr.healTargets = healTargets;
            if (healTargets.length) { cr.targetTeam = healTargets[0].team; cr.targetIdx = healTargets[0].idx; cr.targetHp = healTargets[0].hp; cr.targetRage = healTargets[0].rage; cr.targetMaxHp = healTargets[0].maxHp; }
          } else {
            var aoeTargets = [];
            targets.forEach(function (t) {
              if (t.hp <= 0) return;
              var tidx = (isMy ? enemyList : myTeam).indexOf(t);
              var tidx_team = isMy ? 'B' : 'A';
              var baseDmg = unit.atk * skill.mul * getRageBonus(unit.rage || 0);
              var dmg = (typeof calcDamage === 'function') ? calcDamage(unit, t, baseDmg, isMagic) : { damage: Math.floor(baseDmg), isCrit: false, isDodge: false, isBlock: false };
              if (dmg.isDodge) {
                aoeTargets.push({ team: tidx_team, idx: tidx, hp: Math.floor(t.hp), maxHp: t.maxHp, rage: Math.round(t.rage || 0), isDodge: true });
              } else {
                t.hp = Math.max(0, t.hp - dmg.damage);
                aoeTargets.push({ team: tidx_team, idx: tidx, hp: Math.floor(t.hp), maxHp: t.maxHp, rage: Math.round(t.rage || 0), isCrit: dmg.isCrit, isBlock: dmg.isBlock });
              }
            });
            cr.aoeTargets = aoeTargets;
            if (aoeTargets.length) { cr.targetTeam = aoeTargets[0].team; cr.targetIdx = aoeTargets[0].idx; cr.targetHp = aoeTargets[0].hp; cr.targetRage = aoeTargets[0].rage; cr.targetMaxHp = aoeTargets[0].maxHp; cr.isDodge = !!aoeTargets[0].isDodge; cr.isCrit = !!aoeTargets[0].isCrit; cr.isBlock = !!aoeTargets[0].isBlock; }
          }

          // buff 应用
          applySkillEffectsLocal(unit, targets, skill, isMy, myTeam, enemyList, round, rounds);
          unit.rage = 0;
          if (unit._pendingRageGain) { unit.rage = Math.min(MAX_RAGE_V, unit._pendingRageGain); unit._pendingRageGain = 0; }
          cr.actorRage = Math.round(unit.rage);

          rounds.push(cr);
        } else {
          // 普攻
          if (!normalTarget) { battleEnd = true; break; }
          var tidx2 = (isMy ? enemyList : myTeam).indexOf(normalTarget);
          var teamB = isMy ? 'B' : 'A';
          var dmg2 = (typeof calcDamage === 'function') ? calcDamage(unit, normalTarget, unit.atk, isMagic) : { damage: Math.floor(unit.atk), isCrit: false, isDodge: false, isBlock: false };
          var hpAfter = normalTarget.hp;
          if (!dmg2.isDodge) {
            hpAfter = Math.max(0, normalTarget.hp - dmg2.damage);
            normalTarget.hp = hpAfter;
            if (!dmg2.isDodge) {
              unit.rage = Math.min(MAX_RAGE_V, unit.rage + PER_HIT);
              normalTarget.rage = Math.min(MAX_RAGE_V, (normalTarget.rage || 0) + PER_HIT);
            }
          }
          rounds.push({
            actorTeam: actorTeamKey, actorIdx: actorIdx,
            actorHp: Math.floor(unit.hp), actorRage: Math.round(unit.rage), actorMaxHp: unit.maxHp,
            targetTeam: teamB, targetIdx: tidx2,
            targetHp: Math.floor(hpAfter), targetRage: Math.round(normalTarget.rage || 0), targetMaxHp: normalTarget.maxHp,
            isSkill: false, isDodge: !!dmg2.isDodge, isCrit: !!dmg2.isCrit, isBlock: !!dmg2.isBlock,
            fullRound: round,
            log: unit.name + ' 对 ' + normalTarget.name + ' 造成' + (dmg2.isDodge ? '闪避' : dmg2.damage + '点伤害' + (dmg2.isCrit ? '（暴击）' : '') + (dmg2.isBlock ? '（格挡）' : ''))
          });
        }

        if (myTeam.every(function (m) { return m.hp <= 0; }) || enemyList.every(function (e) { return e.hp <= 0; })) {
          battleEnd = true;
          break;
        }
      }

      if (myTeam.every(function (m) { return m.hp <= 0; }) || enemyList.every(function (e) { return e.hp <= 0; })) {
        battleEnd = true;
        break;
      }

      round++;
      reduceBuffRoundsLocal(myTeam);
      reduceBuffRoundsLocal(enemyList);
      if (round > maxRounds) battleEnd = true;
    }

    var myTotal = myTeam.reduce(function (s, u) { return s + (u.hp > 0 ? u.hp : 0); }, 0);
    var enTotal = enemyList.reduce(function (s, u) { return s + (u.hp > 0 ? u.hp : 0); }, 0);
    var result = (enemyList.every(function (e) { return e.hp <= 0; })) ? 'win'
      : (myTeam.every(function (m) { return m.hp <= 0; })) ? 'lose'
      : (myTotal >= enTotal ? 'win' : 'lose');
    return { rounds: rounds, result: result, myTeam: myTeam, enemyTeam: enemyList };
  }

  /* ---------------- 敌人构建（复用游戏函数） ---------------- */
  function buildEnemiesFor(battleType, stage) {
    try {
      if (battleType === 'coin') {
        if (typeof createCoinEnemies === 'function') {
          var saveStage = gameData && gameData.coinStage;
          var savedSelected = (typeof selectedCoinStage !== 'undefined') ? selectedCoinStage : stage;
          var enemies = createCoinEnemies();
          return enemies.map(function (e, i) {
            return { name: e.name || '铜钱怪', hp: e.hp, maxHp: e.maxHp, atk: e.atk, position: e.position || ((i % 9) + 1), xianfeng: e.xianfeng || 0, rage: e.rage != null ? e.rage : INIT_RAGE, skillType: e.skillType || 'single', skillName: e.skillName || '普通攻击', skillMul: e.skillMul || 1, job: e.job || '武神', specialStats: e.specialStats || {}, skillEffects: e.skillEffects || [] };
          });
        }
      }
      if (battleType === 'elite' || battleType === 'main_story') {
        if (typeof createEnemy === 'function') {
          var isElite = battleType === 'elite';
          var list = createEnemy(isElite);
          return list.map(function (e) {
            return { name: e.name, hp: e.hp, maxHp: e.maxHp, atk: e.atk, position: e.position, xianfeng: e.xianfeng || 0, rage: e.rage != null ? e.rage : INIT_RAGE, skillType: e.skillType || 'single', skillName: e.skillName || '普通攻击', skillMul: e.skillMul || 1, job: e.job || '武神', specialStats: e.specialStats || {}, skillEffects: e.skillEffects || [], isHero: e.isHero };
          });
        }
      }
      if (battleType === 'story') {
        if (typeof createStoryEnemies === 'function') {
          var list2 = createStoryEnemies(stage);
          return list2.map(function (e) {
            return { name: e.name, hp: e.hp, maxHp: e.maxHp, atk: e.atk, position: e.position || 1, xianfeng: e.xianfeng || 0, rage: e.rage != null ? e.rage : INIT_RAGE, skillType: e.skillType || 'single', skillName: e.skillName || '普通攻击', skillMul: e.skillMul || 1, job: e.job || '武神', specialStats: e.specialStats || {}, skillEffects: e.skillEffects || [] };
          });
        }
      }
    } catch (e) {
      warn('buildEnemiesFor 异常:', e);
    }
    // 兜底敌人
    return [1, 2, 3].map(function (i) {
      return {
        name: '怪物' + i, hp: 200 + i * 50, maxHp: 200 + i * 50, atk: 15 + i * 5,
        position: i, xianfeng: 10, rage: 50, skillType: 'single', skillName: '普通攻击', skillMul: 1,
        job: '武神', specialStats: {}, skillEffects: []
      };
    });
  }

  /* ---------------- 斗神殿本地 ---------------- */
  var localPvp = {
    leaderboard: [],
    history: [],
    register: function (uid, name, power, teamData) {
      var db = getDb();
      var existing = null;
      db.leaderboard.forEach(function (p) { if (p.userId === uid) existing = p; });
      var rec = {
        userId: uid, playerName: name, displayName: name, mainHeroName: '',
        totalPower: power || 0, wins: 0, losses: 0, rankScore: 1000, rank: 1, teamData: teamData || null,
        lastActiveTime: new Date().toISOString()
      };
      if (existing) { Object.assign(existing, rec); }
      else { db.leaderboard.push(rec); }
      db.leaderboard.sort(function (a, b) { return (b.totalPower || 0) - (a.totalPower || 0); });
      db.leaderboard.forEach(function (p, i) { p.rank = i + 1; });
      saveDb();
      var self = null;
      db.leaderboard.forEach(function (p) { if (p.userId === uid) self = p; });
      return self || rec;
    }
  };

  /* ================== 请求处理 ================== */
  function mockFetch(url, options) {
    options = options || {};
    var method = (options.method || 'GET').toUpperCase();
    var headers = options.headers || {};
    var u = String(url || '');
    var path = u;
    // 提取相对路径
    if (path.indexOf('://') >= 0) {
      var m = path.match(/^[a-z]+:\/\/[^/]+(\/.*)?$/i);
      path = m ? (m[1] || '/') : path;
    }

    function jsonRes(obj, status) {
      var body = JSON.stringify(obj || {});
      return Promise.resolve(new Response(body, {
        status: status || 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    function parseBody() {
      var b = options.body;
      if (typeof b === 'string') {
        try { return JSON.parse(b); } catch (e) { return {}; }
      }
      return b || {};
    }

    // ========== 时间 ==========
    if (path === '/api/time' || path === '/time') {
      return jsonRes({ timestamp: Date.now(), version: (typeof CLIENT_VERSION !== 'undefined') ? CLIENT_VERSION : 22 });
    }

    // ========== 公告 ==========
    if (path.indexOf('/api/announcements/active') >= 0) {
      return jsonRes({ success: true, announcements: [{ id: 'local', content: '本地版 · 无需联网' }] });
    }

    // ========== 认证 ==========
    if (path.indexOf('/api/auth/register') >= 0 || path.indexOf('/auth/register') >= 0) {
      var b1 = parseBody();
      var name1 = (b1.playerName || '').trim();
      var pwd1 = b1.password || '';
      var dbA = getAccounts();
      if (dbA[name1]) {
        return jsonRes({ success: false, error: '该账号已被注册' });
      }
      var uid1 = makeUserId(name1);
      dbA[name1] = { password: pwd1, userId: uid1 };
      saveAccounts(dbA);
      return jsonRes({ success: true, userId: uid1 });
    }
    if (path.indexOf('/api/auth/login') >= 0 || path.indexOf('/auth/login') >= 0) {
      var b2 = parseBody();
      var name2 = (b2.playerName || '').trim();
      var pwd2 = b2.password || '';
      var dbA2 = getAccounts();
      var acc = dbA2[name2];
      if (!acc) return jsonRes({ success: false, error: '账号不存在' });
      if (acc.password !== pwd2) return jsonRes({ success: false, error: '密码错误' });
      return jsonRes({ success: true, userId: acc.userId, sessionToken: makeToken() });
    }
    if (path.indexOf('/api/check-name') >= 0 || path.indexOf('/check-name') >= 0) {
      var mq = path.match(/name=([^&]*)/);
      var nm = mq ? decodeURIComponent(mq[1]) : '';
      var dbA3 = getAccounts();
      return jsonRes({ success: true, available: !dbA3[nm] });
    }
    if (path.indexOf('/api/account/changepwd') >= 0 || path.indexOf('/account/changepwd') >= 0) {
      var b3 = parseBody();
      var uid3 = b3.userId;
      var oldP = b3.oldPassword;
      var newP = b3.newPassword;
      var dbA4 = getAccounts();
      for (var k in dbA4) {
        if (dbA4[k].userId === uid3) {
          if (dbA4[k].password !== oldP) return jsonRes({ success: false, error: '旧密码错误' });
          dbA4[k].password = newP;
          saveAccounts(dbA4);
          return jsonRes({ success: true });
        }
      }
      return jsonRes({ success: false, error: '账号不存在' });
    }
    if (path.indexOf('/api/account/reset') >= 0 || path.indexOf('/account/reset') >= 0) {
      return jsonRes({ success: true });
    }

    // ========== 云存档 ==========
    if (path.indexOf('/api/cloud/save') >= 0 || path.indexOf('/cloud/save') >= 0) {
      // 支持 gzip
      var pSave = Promise.resolve().then(function () {
        var body = options.body;
        var enc = headers['Content-Encoding'] || headers['content-encoding'] || '';
        if (enc.toLowerCase() === 'gzip') {
          var gzBody = body;
          // 兼容 gzip 文本 base64 或 Blob
          return Promise.resolve().then(function () {
            if (gzBody instanceof Blob) {
              return gzBody.arrayBuffer();
            }
            if (typeof gzBody === 'string') {
              // 字符串形式的 gzip（少见），尝试 base64 解码
              try {
                var bin = atob(gzBody);
                var bytes = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                return bytes.buffer;
              } catch (e2) {
                return null;
              }
            }
            return null;
          }).then(function (buf) {
            if (!buf) return Promise.resolve('');
            if (typeof DecompressionStream === 'undefined') {
              // 老浏览器：无法解压 gzip，直接返回空（存档可能丢失，但功能不崩）
              warn('不支持 DecompressionStream，云存档 gzip 解压失败');
              return '';
            }
            var ds = new DecompressionStream('gzip');
            return new Response(new Blob([buf]).stream().pipeThrough(ds)).text();
          });
        }
        if (typeof body === 'string') return Promise.resolve(body);
        if (body instanceof Blob) return body.text();
        return Promise.resolve('');
      });
      return pSave.then(function (text) {
        var parsed;
        try { parsed = JSON.parse(text); } catch (e) { parsed = {}; }
        if (!parsed || !parsed.userId) return jsonRes({ success: false, error: '缺少userId' });
        var ok = putSave(parsed.userId, parsed.saveData || '');
        return jsonRes({ success: ok });
      });
    }
    if (path.indexOf('/api/cloud/load') >= 0 || path.indexOf('/cloud/load') >= 0) {
      var mq2 = path.match(/userId=([^&]*)/);
      var uidL = mq2 ? decodeURIComponent(mq2[1]) : '';
      var save = getSave(uidL);
      return jsonRes({ success: true, saveData: save || '', resetRequired: 0 });
    }

    // ========== 心跳 ==========
    if (path.indexOf('/api/heartbeat') >= 0 || path.indexOf('/heartbeat') >= 0) {
      var b4 = parseBody();
      if (b4 && b4.userId) {
        var db = getDb();
        db.leaderboard.forEach(function (p) { if (p.userId === b4.userId) { p.lastActiveTime = new Date().toISOString(); p.mainHeroName = b4.mainHeroName || p.mainHeroName; } });
        saveDb();
      }
      return jsonRes({ success: true, lastActiveTime: new Date().toISOString() });
    }

    // ========== 战斗 ==========
    if (path.indexOf('/api/battle/pve') >= 0 || path.indexOf('/battle/pve') >= 0) {
      var bp = parseBody();
      var stage = bp.stage || 1;
      var bt = bp.battleType || 'main_story';
      var myTeam = buildLocalTeam(bp.myTeam || []);
      if (!myTeam.length && typeof gameData !== 'undefined' && typeof getFormationTeam === 'function') {
        var ids = getFormationTeam();
        ids.forEach(function (idx) { if (gameData.heroList[idx]) myTeam.push(gameData.heroList[idx]); });
        myTeam = buildLocalTeam(myTeam);
      }
      var enemies = buildEnemiesFor(bt, stage);
      var sim = localBattleSimulate(myTeam, enemies, 30);
      return jsonRes({
        success: true,
        enemyTeam: sim.enemyTeam,
        combatRounds: sim.rounds,
        result: sim.result,
        serverTime: Date.now()
      });
    }
    if (path.indexOf('/api/battle/story') >= 0 || path.indexOf('/battle/story') >= 0) {
      var bst = parseBody();
      var stageS = bst.chapterStage || '1-1';
      var myTeamS = buildLocalTeam(bst.myTeam || []);
      var enemiesS = buildEnemiesFor('story', stageS);
      var simS = localBattleSimulate(myTeamS, enemiesS, 30);
      return jsonRes({
        success: true, enemyTeam: simS.enemyTeam, combatRounds: simS.rounds,
        result: simS.result, serverTime: Date.now()
      });
    }
    if (path.indexOf('/api/battle/pvp') >= 0 || path.indexOf('/battle/pvp') >= 0) {
      var bpvp = parseBody();
      var myTeamP = buildLocalTeam(bpvp.myTeam || []);
      var defTeam = null;
      if (bpvp.defenderId) {
        var dbp = getDb();
        dbp.leaderboard.forEach(function (p) { if (p.userId === bpvp.defenderId && p.teamData) { try { defTeam = JSON.parse(p.teamData); } catch (e) {} } });
      }
      if (!defTeam || !defTeam.length) {
        var myP = gameData ? (gameData.team || []).map(function (i) { return gameData.heroList[i]; }).filter(Boolean) : [];
        if (!myP.length && myTeamP.length) {
          defTeam = myTeamP.slice().map(function (u) { var c = Object.assign({}, u); c.name = c.name + '(影)'; return c; });
        }
      }
      var enemiesP = defTeam || buildEnemiesFor('main_story', 1);
      var simP = localBattleSimulate(myTeamP, enemiesP, 30);
      return jsonRes({
        success: true, result: simP.result, combatRounds: simP.rounds,
        opponent: { playerName: (bpvp.defenderId ? '挑战对手' : '镜像') }, serverTime: Date.now()
      });
    }

    // ========== 斗神殿 ==========
    if (path.indexOf('/api/register') >= 0 || path === '/register') {
      var br = parseBody();
      var player = localPvp.register(br.userId, br.playerName || br.displayName || '玩家', br.totalPower || 0, br.teamData || null);
      return jsonRes({ success: true, player: player });
    }
    if (path.indexOf('/api/leaderboard') >= 0 || path.indexOf('/leaderboard') >= 0) {
      var dbL = getDb();
      var limit = 50, offset = 0;
      var mLim = path.match(/limit=(\d+)/); if (mLim) limit = parseInt(mLim[1], 10) || 50;
      var mOff = path.match(/offset=(\d+)/); if (mOff) offset = parseInt(mOff[1], 10) || 0;
      var players = dbL.leaderboard.slice(offset, offset + limit);
      return jsonRes({ success: true, players: players, total: dbL.leaderboard.length });
    }
    if (path.indexOf('/api/challenge') >= 0 || path.indexOf('/challenge') >= 0) {
      var bc = parseBody();
      var def = null;
      var dbC = getDb();
      dbC.leaderboard.forEach(function (p) { if (p.userId === bc.defenderId) def = p; });
      if (!def) {
        // 生成一个假对手
        def = {
          playerName: '守关者', mainHeroName: '', totalPower: 1000,
          teamData: JSON.stringify(buildEnemiesFor('main_story', 5))
        };
      }
      return jsonRes({
        success: true,
        defender: { playerName: def.playerName, mainHeroName: def.mainHeroName || '', teamData: def.teamData }
      });
    }
    if (path.indexOf('/api/history') >= 0 || path.indexOf('/history') >= 0) {
      return jsonRes({ success: true, history: getDb().history || [] });
    }
    if (path.indexOf('/api/power-ranking') >= 0 || path.indexOf('/power-ranking') >= 0) {
      var dbR = getDb();
      return jsonRes({ success: true, players: dbR.leaderboard.slice(0, 100), total: dbR.leaderboard.length });
    }
    if (path.indexOf('/api/player/') >= 0 || path.indexOf('/player/') >= 0) {
      var uidP = path.split('/player/')[1] || '';
      uidP = uidP.replace(/[?].*$/, '');
      var dbD = getDb();
      var pRec = null;
      dbD.leaderboard.forEach(function (p) { if (p.userId === decodeURIComponent(uidP)) pRec = p; });
      if (pRec) {
        var save2 = getSave(pRec.userId) || '';
        return jsonRes({
          success: true,
          player: { userId: pRec.userId, playerName: pRec.playerName, mainHeroName: pRec.mainHeroName, totalPower: pRec.totalPower, wins: pRec.wins, losses: pRec.losses, rankScore: pRec.rankScore, teamData: pRec.teamData, saveData: save2, rank: pRec.rank }
        });
      }
      return jsonRes({ success: false, error: '玩家不存在' });
    }

    // ========== 聊天 ==========
    if (path.indexOf('/api/chat/messages') >= 0 || path.indexOf('/chat/messages') >= 0) {
      return jsonRes({ success: true, messages: getDb().messages.slice(-50) });
    }
    if (path.indexOf('/api/chat/send') >= 0 || path.indexOf('/chat/send') >= 0) {
      var bsend = parseBody();
      var dbM = getDb();
      dbM.messages.push({
        id: 'm' + Date.now(), userId: bsend.userId, playerName: bsend.playerName || '我',
        message: bsend.message, timestamp: Date.now()
      });
      if (dbM.messages.length > 200) dbM.messages = dbM.messages.slice(-200);
      saveDb();
      return jsonRes({ success: true });
    }
    if (path.indexOf('/api/chat/private') >= 0 || path.indexOf('/chat/private') >= 0) {
      if (path.indexOf('/chat/private/send') >= 0) {
        var bpriv = parseBody();
        var dbP = getDb();
        var key = bpriv.fromUserId + '_' + bpriv.toUserId;
        dbP.privateMessages = dbP.privateMessages || {};
        dbP.privateMessages[key] = dbP.privateMessages[key] || [];
        dbP.privateMessages[key].push({ from: bpriv.fromUserId, to: bpriv.toUserId, fromName: bpriv.fromName, message: bpriv.message, timestamp: Date.now() });
        saveDb();
        return jsonRes({ success: true });
      }
      return jsonRes({ success: true, messages: [] });
    }

    // ========== 好友 ==========
    if (path.indexOf('/api/friend/list') >= 0 || path.indexOf('/friend/list') >= 0) {
      return jsonRes({ success: true, friends: [] });
    }
    if (path.indexOf('/api/friend/requests') >= 0 || path.indexOf('/friend/requests') >= 0) {
      return jsonRes({ success: true, requests: [] });
    }
    if (path.indexOf('/api/friend/') >= 0 || path.indexOf('/friend/') >= 0) {
      return jsonRes({ success: true });
    }

    // ========== 邮件 ==========
    if (path.indexOf('/api/mail/list') >= 0 || path.indexOf('/mail/list') >= 0) {
      return jsonRes({ success: true, mails: [] });
    }
    if (path.indexOf('/api/mail/unread') >= 0 || path.indexOf('/mail/unread') >= 0) {
      return jsonRes({ success: true, unread: [], count: 0 });
    }
    if (path.indexOf('/api/mail/claim') >= 0 || path.indexOf('/mail/claim') >= 0) {
      return jsonRes({ success: true });
    }
    if (path.indexOf('/api/mail/read') >= 0 || path.indexOf('/mail/read') >= 0) {
      return jsonRes({ success: true });
    }

    // ========== 公会 ==========
    if (path.indexOf('/api/guild/my') >= 0 || path.indexOf('/guild/my') >= 0) {
      return jsonRes({ success: true, hasGuild: false, guild: null, members: [] });
    }
    if (path.indexOf('/api/guild/list') >= 0 || path.indexOf('/guild/list') >= 0) {
      return jsonRes({ success: true, guilds: [] });
    }
    if (path.indexOf('/api/guild/search') >= 0 || path.indexOf('/guild/search') >= 0) {
      return jsonRes({ success: true, guilds: [] });
    }
    if (path.indexOf('/api/guild/') >= 0 || path.indexOf('/guild/') >= 0) {
      return jsonRes({ success: true });
    }

    // ========== 云宝 ==========
    if (path.indexOf('/api/yunbao/status') >= 0 || path.indexOf('/yunbao/status') >= 0) {
      return jsonRes({ success: true, sendCount: 0, sendLimit: 0, robCount: 0, robLimit: 0, myYunbao: null, now: Date.now() });
    }
    if (path.indexOf('/api/yunbao/list') >= 0 || path.indexOf('/yunbao/list') >= 0) {
      return jsonRes({ success: true, list: [] });
    }
    if (path.indexOf('/api/yunbao/broadcasts') >= 0 || path.indexOf('/yunbao/broadcasts') >= 0) {
      return jsonRes({ success: true, broadcasts: [] });
    }
    if (path.indexOf('/api/yunbao/') >= 0 || path.indexOf('/yunbao/') >= 0) {
      return jsonRes({ success: true });
    }

    // ========== 其它 API 兜底 ==========
    if (path.indexOf('/api/') >= 0 || path.indexOf('/auth/') >= 0) {
      log('未识别的 API，返回成功: ' + path);
      return jsonRes({ success: true });
    }

    // ========== 非 API：静态资源或未知 ==========
    if (path.indexOf(SERVER_HOST) >= 0 || path.indexOf(IMG_HOST) >= 0) {
      // 静态资源被改写为相对路径，正常不会走到这里
      var rel = path.replace(/^.*?\/audio\//, 'audio/').replace(/^.*?\/images\//, 'images/');
      if (rel !== path) {
        log('重写静态资源: ' + rel);
        return fetch(rel, options);
      }
    }

    // 其余请求放行
    return originalFetch.apply(window, arguments);
  }

  /* ---------------- 安装 ---------------- */
  var originalFetch = window.fetch;
  var originalSendBeacon = navigator.sendBeacon;

  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var url = args[0];
    var opts = args[1] || {};
    var urlStr = (typeof url === 'string') ? url : (url && url.url) ? url.url : String(url);
    if (urlStr.indexOf(SERVER_HOST) >= 0 || urlStr.indexOf(IMG_HOST) >= 0 ||
        (urlStr.indexOf('/api/') === 0) || (urlStr.indexOf('/auth/') === 0) ||
        (urlStr.indexOf('/yunbao/') === 0) || (urlStr.indexOf('/guild/') === 0) ||
        (urlStr.indexOf('/cloud/') === 0) || (urlStr.indexOf('/leaderboard') === 0) ||
        (urlStr.indexOf('/battle/') === 0) || (urlStr.indexOf('/chat/') === 0) ||
        (urlStr.indexOf('/friend/') === 0) || (urlStr.indexOf('/mail/') === 0) ||
        (urlStr.indexOf('/player/') === 0) || (urlStr.indexOf('/register') === 0) ||
        (urlStr.indexOf('/challenge') === 0) || (urlStr.indexOf('/history') === 0) ||
        (urlStr.indexOf('/heartbeat') === 0) || (urlStr.indexOf('/check-name') === 0) ||
        (urlStr.indexOf('/time') === 0) || (urlStr.indexOf('/power-ranking') === 0)) {
      return mockFetch(urlStr, opts);
    }
    return originalFetch.apply(window, args);
  };

  if (navigator.sendBeacon && typeof originalSendBeacon === 'function') {
    navigator.sendBeacon = function (url, data) {
      var urlStr = String(url);
      if (urlStr.indexOf(SERVER_HOST) >= 0 || urlStr.indexOf('/api/cloud/save') >= 0) {
        try {
          var text = (typeof data === 'string') ? data : (data && data.text ? '' : '');
          var payload;
          if (typeof data === 'string') payload = data;
          else if (data instanceof Blob) { /* async, cannot await */ payload = ''; }
          else payload = JSON.stringify(data);
          if (payload) {
            try {
              var parsed = JSON.parse(payload);
              if (parsed.userId) putSave(parsed.userId, parsed.saveData || '');
            } catch (e) {}
          }
        } catch (e) {}
        return true;
      }
      return originalSendBeacon.call(navigator, url, data);
    };
  }

  // ========== 处理缺失的怪物图片（兜底为默认头像） ==========
  // 服务器本身缺失：太白金星、黄巾小兵（已直接在 index.html 中把 getMonsterBase 改为本地路径）

  log('本地适配层已安装');
})();
