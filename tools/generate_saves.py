# -*- coding: utf-8 -*-
"""
天朝小将 2.8 · 99 存档生成器
=====================================================
按实战强度给 99 个本地账号导入不同队伍（账号 1 最强 → 账号 99 最弱）。

原理：
  99 账号制存档槽 = localStorage['tianchaoxiaojiang_save_v3_<N>']，
  本脚本生成与游戏 gameData 结构一致的存档 JSON，写入 saves_99.json。
  队伍强度按 PVP 模拟结论从强到弱排列（T0 冠军 → T9 基础）。

导入方法：
  方式一（自动注入，需浏览器）：
    启动 8090 静态服务器后，在浏览器控制台执行 tools/import_saves.js 的内容。
  方式二（手动）：
    打开游戏 → 登录任一账号 → F12 控制台：
      fetch('saves_99.json').then(r=>r.json()).then(s=>{
        Object.keys(s).forEach(k=>localStorage.setItem(k, JSON.stringify(s[k])));
      });
    然后刷新页面即可。

仅供游戏研究参考。
"""
import io
import json
import os
import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "saves_99.json")

# ============ 武将基础数据 ============
HERO = {}
def add(name, job, atk, hp, **sp):
    HERO[name] = {"job": job, "atk": atk, "hp": hp, "sp": sp}

add("武神主角","武神",32,140, tenacity=20, block=30)
add("斗皇主角","斗皇",30,120, crit=30, dodge=20)
add("天师主角","天师",28,100, pierce=20, deadly=35)
add("齐天大圣","斗皇",91,280, crit=30, pierce=20, hit=20, deadly=10)
add("孙悟空","斗皇",80,280, crit=20, pierce=20, deadly=15)
add("赵子龙","斗皇",95,350, crit=35, hit=30)
add("杨戬","武神",75,320, crit=45, hit=40)
add("岳飞","斗皇",76,300, crit=30, hit=25, pierce=10, block=20)
add("刑天","武神",74,335, crit=20, hit=30, tenacity=30, block=40)
add("吕奉先","武神",91,330, crit=30, pierce=30, deadly=20)
add("小白龙","斗皇",77,295, dodge=50, crit=10)
add("哪吒","斗皇",79,285, pierce=10, dodge=30)
add("金龙","斗皇",81,275, pierce=40, dodge=45)
add("巨灵神","武神",72,350, hit=20, tenacity=20, block=40)
add("阎罗王","武神",74,330, pierce=30, deadly=25, block=10)
add("牛魔王","武神",73,340, tenacity=20, block=30)
add("关羽","斗皇",78,290, crit=15, hit=5, pierce=5, deadly=5, tenacity=5, block=5)
add("万妖皇","天师",84,240, crit=40, pierce=40, tenacity=40)
add("白骨精","天师",83,242, crit=25, deadly=20, tenacity=50)
add("黑山老妖","天师",85,238, crit=20, block=10, deadly=10, tenacity=20)
add("嫦娥","天师",81,255, crit=30, deadly=20, tenacity=30)
add("唐僧","天师",81,255, hit=30, tenacity=40, block=30)
add("妲己","天师",83,245, crit=20, hit=30, deadly=20)
add("聂小倩","天师",83,245, hit=20, tenacity=20, block=20)
add("铁扇公主","天师",80,258, pierce=50)
add("紫霞","天师",82,248, hit=40, healBonus=25)
add("小龙女","天师",82,250, crit=10, hit=10, pierce=10, deadly=10)
add("玉面妖狐","天师",81,252, hit=20, healBonus=20)

# ============ 仙器配置 ============
XQ_MAP = {
    "atk": "土豪金箍棒", "hp": "土豪盘古幡", "rage": "土豪劈山斧", "block": "土豪仁王盾",
    "crit": "土豪弑天剑", "hit": "土豪射日弓", "physDef": "土豪罗汉金身", "magicDef": "土豪刑天盾",
    "pierce": "土豪混沌钟", "dodge": "土豪女娲石", "deadly": "土豪伏羲琴", "tenacity": "土豪混元金斗",
    "healBonus": "紫金葫芦",
}
XQ_TOP = ["atk","crit","deadly","pierce","hit","block","dodge","tenacity"]
XQ_HEAL = ["atk","hp","crit","deadly","block","dodge","tenacity","rage"]

# ============ 存档构建 ============
def base_game(player):
    now = int(datetime.datetime.now().timestamp() * 1000)
    return {
        "playerName": player,
        "coin": 99999999, "diamond": 99999, "reputation": 99999, "token": 999999,
        "stone": 999999, "xuantie": 99999, "tianjing": 99999,
        "stage": 999, "eliteStage": 999, "destinyPoint": 200,
        "destinyAtk": 0, "destinyHp": 0,
        "wearEquip": [None] * 6, "equipBag": [],
        "team": [], "heroList": [], "selectedHero": None,
        "mainHero": None, "codeRecord": {},
        "lastLoginTime": now, "lastDailyRefresh": 0,
        "dailyProgress": {"mainFight":0,"eliteFight":0,"doushen":0}, "dailyClaimed": {},
        "ownedHeroNames": [],
        "doushen": {"userId":"","cooldownUntil":0,"syncCooldownUntil":0,"refreshCooldownUntil":0,
                    "rewardClaimedDate":"","challengeCount":0,"challengeDate":""},
        "gemBag": [], "gemSelected": None, "gemSelectedHero": None, "guildWarRewards": {},
        "pantao": {"unlocked":9,"slots":[],"refreshCount":{"coin":0,"diamond":0}},
        "storyProgress": {}, "stamina": 120, "lastStaminaRecovery": now,
        "storyQuestsClaimed": {}, "storySweepDaily": {}, "storySweepDate": "",
        "formation": {1:None,2:None,3:None,4:None,5:None,6:None,7:None,8:None,9:None},
        "ys": {}, "ysUnlock3": True, "ysUnlock4": True, "ysFreeDate": "", "ysFreeUsed": 0,
        "xuanxiuTotal": 0, "selectRewardClaimed": {}, "cycleV2": None,
        "warehouse": [], "sfData": None,
    }

def make_hero(name):
    h = HERO[name]
    is_main = name in ("武神主角","斗皇主角","天师主角")
    return {
        "name": name, "job": h["job"],
        "rare": 4, "rareName": "红系",
        "baseAtk": h["atk"], "baseHp": h["hp"],
        "level": 90, "trainLevel": 50,
        "skill": "", "skillDmgMul": 1.0,
        "isMainHero": is_main,
        "star": 5, "starAtkMul": 4.5 if is_main else None, "starHpMul": 4.5 if is_main else None,
        "equipment": [None] * 6,
        "specialStats": dict(h["sp"]),
        "_beasts": {"baihu":200,"qinglong":200,"zhuque":200,"xuanwu":200},
        "_ys": [{"active":True,"star":4,"entries":[
            {"attr":"atk","q":"orange"},{"attr":"crit","q":"orange"},
            {"attr":"deadly","q":"orange"},{"attr":"pierce","q":"orange"}]} for _ in range(5)],
        "xianqiEquip": {},
    }

def add_equipment(hero):
    specs = [
        {"atk":12318}, {"physDef":2696,"magicDef":2696}, {"magicDef":6290},
        {"hp":23471}, {"physDef":6290}, {"atk":5279,"hp":10059},
    ]
    bonuses = [
        {"finalDmgUp":10},{"finalDmgReduce":14},{"rage":50},
        {"hpUp":16},{"tenacity":16},{"critRate":20},
    ]
    slots = ("剑","甲","冠","腰带","战靴","坠")
    gems = [{"type":"attack","level":10},{"type":"hp","level":10},
            {"type":"physDef","level":10},{"type":"magicDef","level":10}]
    eqs = []
    for i, spec in enumerate(specs):
        eqs.append({
            "name": "仙品-神霄%s" % slots[i], "type": i, "quality": "xianpin", "str": 90,
            "baseAtk": spec.get("atk",0), "baseHp": spec.get("hp",0),
            "bonus": bonuses[i], "gems": [dict(g) for g in gems], "unlockedSlots": 4,
        })
    hero["equipment"] = eqs

def add_xianqi(hero, cats):
    hero["xianqiEquip"] = {c: {"name": XQ_MAP[c], "level": 12} for c in cats[:8]}

def build_save(player, roster, xianqi_cats):
    """roster: [(name, position)]"""
    g = base_game(player)
    for i, (nm, pos) in enumerate(roster):
        h = make_hero(nm)
        add_equipment(h)
        add_xianqi(h, xianqi_cats)
        g["heroList"].append(h)
        g["formation"][pos] = i
        g["ownedHeroNames"].append(nm)
    g["team"] = list(range(len(g["heroList"])))
    g["mainHero"] = g["heroList"][0]
    return g

# ============ 强度梯队（T0 最强 → T9 最弱）============
POSITIONS = [1, 4, 7, 2, 3]
TEAMS = [
    # T0
    ("武神主角","齐天大圣","万妖皇","白骨精","黑山老妖"),
    # T1
    ("武神主角","齐天大圣","刑天","万妖皇","白骨精"),
    ("武神主角","齐天大圣","万妖皇","白骨精","嫦娥"),
    ("武神主角","齐天大圣","赵子龙","万妖皇","白骨精"),
    # T2
    ("武神主角","齐天大圣","刑天","白骨精","嫦娥"),
    ("武神主角","齐天大圣","小白龙","万妖皇","黑山老妖"),
    ("武神主角","万妖皇","白骨精","黑山老妖","嫦娥"),
    # T3
    ("武神主角","齐天大圣","赵子龙","杨戬","万妖皇"),
    ("武神主角","赵子龙","吕奉先","杨戬","岳飞"),
    ("武神主角","齐天大圣","孙悟空","万妖皇","白骨精"),
    # T4
    ("武神主角","杨戬","万妖皇","白骨精","黑山老妖"),
    ("武神主角","刑天","万妖皇","白骨精","嫦娥"),
    ("武神主角","赵子龙","万妖皇","白骨精","黑山老妖"),
    ("武神主角","齐天大圣","哪吒","万妖皇","白骨精"),
    # T5
    ("武神主角","赵子龙","杨戬","岳飞","白骨精"),
    ("武神主角","吕奉先","杨戬","岳飞","黑山老妖"),
    ("武神主角","刑天","岳飞","万妖皇","白骨精"),
    ("武神主角","齐天大圣","巨灵神","万妖皇","白骨精"),
    # T6
    ("武神主角","孙悟空","小白龙","万妖皇","黑山老妖"),
    ("武神主角","赵子龙","关羽","万妖皇","白骨精"),
    ("武神主角","杨戬","牛魔王","万妖皇","白骨精"),
    # T7
    ("武神主角","阎罗王","牛魔王","万妖皇","白骨精"),
    ("武神主角","巨灵神","刑天","万妖皇","白骨精"),
    ("武神主角","哪吒","金龙","万妖皇","白骨精"),
    # T8
    ("武神主角","小白龙","哪吒","金龙","万妖皇"),
    ("武神主角","孙悟空","嫦娥","白骨精","黑山老妖"),
    ("武神主角","吕奉先","白骨精","嫦娥","妲己"),
    # T9
    ("武神主角","赵子龙","吕奉先","岳飞","白骨精"),
    ("武神主角","杨戬","岳飞","刑天","白骨精"),
    ("武神主角","刑天","巨灵神","阎罗王","万妖皇"),
]

def main():
    saves = {}
    for acc in range(1, 100):
        team = TEAMS[(acc - 1) % len(TEAMS)]
        roster = list(zip(team, POSITIONS))
        xq = XQ_HEAL if ("黑山老妖" in team or "唐僧" in team) else XQ_TOP
        player = "账号%02d" % acc
        saves["tianchaoxiaojiang_save_v3_%d" % acc] = build_save(player, roster, xq)
    io.open(OUT, "w", encoding="utf-8").write(json.dumps(saves, ensure_ascii=False))
    print("已生成 %d 个存档 → %s" % (len(saves), OUT))
    t0 = saves["tianchaoxiaojiang_save_v3_1"]["heroList"]
    print("账号1（T0 冠军）: %s" % "、".join(h["name"] for h in t0))
    t9 = saves["tianchaoxiaojiang_save_v3_99"]["heroList"]
    print("账号99（T9）: %s" % "、".join(h["name"] for h in t9))

if __name__ == "__main__":
    main()
