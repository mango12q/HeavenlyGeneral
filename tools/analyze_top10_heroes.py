# -*- coding: utf-8 -*-
# 分析排行榜 TOP10 玩家最常使用的武将（阵容）
# 全程走代理，低频（每请求间隔 1.2s）
import json
import time
import urllib.request
from collections import Counter

PROXY = {"http": "http://127.0.0.1:6789", "https": "http://127.0.0.1:6789"}
SERVER = "http://103.236.98.227:3000/api"
DELAY = 1.2

opener = urllib.request.build_opener(urllib.request.ProxyHandler(PROXY))


def get(path):
    req = urllib.request.Request(SERVER + path, headers={
        "x-client-version": "22", "User-Agent": "Mozilla/5.0 (collector)"})
    with opener.open(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    with open("leaderboard_data.json", encoding="utf-8") as f:
        players = json.load(f)
    top = sorted(players, key=lambda p: p.get("totalPower", 0), reverse=True)[:10]

    print("== 排行榜 TOP10 阵容采集 ==")
    hero_counter = Counter()
    hero_job = {}
    teams = []
    for i, p in enumerate(top, 1):
        uid = p.get("userId")
        power = p.get("totalPower", 0)
        try:
            res = get("/player/" + urllib.parse.quote(uid) + "/team")
            units = res.get("teamData") or []
            names = [u.get("heroName") or u.get("name") or "?" for u in units]
            # 玩家姓名字段可能有 totalPower
            for u in units:
                nm = u.get("heroName") or u.get("name")
                if nm:
                    hero_counter[nm] += 1
                    hero_job[nm] = u.get("job", "")
            teams.append((p.get("playerName"), power, names))
            print("  %2d. %-14s 战力=%-9d 阵容=%s" % (i, p.get("playerName"), power, "、".join(names)))
        except Exception as e:
            print("  %2d. %-14s 获取失败: %s" % (i, p.get("playerName"), str(e)[:60]))
        time.sleep(DELAY)

    print("\n== TOP10 阵容最常用武将 ==")
    for hero, cnt in hero_counter.most_common(15):
        print("  %-8s ×%d  职业=%s" % (hero, cnt, hero_job.get(hero, "")))

    with open("leaderboard_top10_teams.json", "w", encoding="utf-8") as f:
        json.dump(teams, f, ensure_ascii=False, indent=1)
    print("\n已保存 leaderboard_top10_teams.json")


if __name__ == "__main__":
    import urllib.parse
    main()
