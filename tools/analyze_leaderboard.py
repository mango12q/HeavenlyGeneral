# -*- coding: utf-8 -*-
# 排行榜数据分析（纯本地，零联网）
import json
import statistics

DATA = "leaderboard_data.json"


def main():
    with open(DATA, encoding="utf-8") as f:
        players = json.load(f)
    print("玩家总数: %d" % len(players))

    # 排序
    by_power = sorted(players, key=lambda p: p.get("totalPower", 0), reverse=True)
    by_score = sorted(players, key=lambda p: p.get("rankScore", 0), reverse=True)

    print("\n== 战力 TOP 10 ==")
    for i, p in enumerate(by_power[:10], 1):
        print("  %2d. %-14s 战力=%-9d 胜/负=%d/%d 积分=%d 主将=%s" % (
            i, p.get("playerName"), p.get("totalPower", 0),
            p.get("wins", 0), p.get("losses", 0), p.get("rankScore", 0), p.get("mainHeroName", "")))

    print("\n== 战力分布 ==")
    powers = [p.get("totalPower", 0) for p in players]
    buckets = [(0, 50000), (50000, 200000), (200000, 500000), (500000, 1000000), (1000000, None)]
    for lo, hi in buckets:
        n = sum(1 for v in powers if v >= lo and (hi is None or v < hi))
        label = "%d~%d" % (lo, hi) if hi else ">=%d" % lo
        bar = "#" * n
        print("  %-14s %3d %s" % (label, n, bar))

    print("\n== 胜率统计（样本=%d）==" % len(players))
    winrates = []
    for p in players:
        w, l = p.get("wins", 0), p.get("losses", 0)
        if w + l > 0:
            winrates.append(w / (w + l))
    if winrates:
        print("  平均胜率: %.1f%%  最高: %.1f%%  最低: %.1f%%" % (
            statistics.mean(winrates) * 100, max(winrates) * 100, min(winrates) * 100))

    print("\n== 战力 vs 积分（相关系数）==")
    pairs = [(p.get("totalPower", 0), p.get("rankScore", 0)) for p in players]
    if len(pairs) > 2:
        xs = [a for a, _ in pairs]
        ys = [b for _, b in pairs]
        mx, my = statistics.mean(xs), statistics.mean(ys)
        cov = sum((x - mx) * (y - my) for x, y in pairs) / len(pairs)
        sx = statistics.pstdev(xs)
        sy = statistics.pstdev(ys)
        print("  相关系数 r = %.3f" % (cov / (sx * sy) if sx and sy else 0))

    print("\n== 疑似异常（按 SECURITY 漏洞角度观察）==")
    # 战力极高但胜场很少 / 或总胜场异常多（刷场）
    for p in by_power[:5]:
        w, l = p.get("wins", 0), p.get("losses", 0)
        if w + l < 30:
            print("  ⚠ %-14s 战力=%-9d 但胜场仅 %d 场（可能刚同步/虚高）" % (p.get("playerName"), p.get("totalPower", 0), w))
    top_wins = sorted(players, key=lambda p: p.get("wins", 0), reverse=True)[:3]
    print("  最多胜场 TOP3:")
    for p in top_wins:
        print("    %-14s 胜=%d 负=%d 战力=%d" % (p.get("playerName"), p.get("wins", 0), p.get("losses", 0), p.get("totalPower", 0)))

    print("\n== 主将分布 TOP10 ==")
    heroes = {}
    for p in players:
        h = p.get("mainHeroName") or "未知"
        heroes[h] = heroes.get(h, 0) + 1
    for h, c in sorted(heroes.items(), key=lambda kv: -kv[1])[:10]:
        print("  %-12s %d 人" % (h, c))


if __name__ == "__main__":
    main()
