# -*- coding: utf-8 -*-
"""
天朝小将 · 纯本地化脚本
=================================================
输入：tianX 的 decrypted_inner.html（GB18030 编码的最新游戏本体）
输出：本目录 game.html（纯本地版，无任何远程服务器请求）

原理：decrypted_inner.html 与已知可用的本地版 game.html 之间，
差异仅是一组「本地化补丁」。补丁以【行级差异操作】记录在
localize_patch.json（src_lines + ops，57 个 replace/insert/delete 操作），
本脚本把这些操作按逆序应用到最新源上（保证行号不漂移），得到
最新版本的本地化 game.html，并可与 git HEAD 中已验证的 game.html
逐字节比对（可选）。

用法：
  python tools/localize_game.py [源decrypted_inner.html] [输出game.html]

说明：
  - 补丁内容：把 audio/images 静态资源改写为相对路径、注入
    local-adapter.js、登录/云存档/账号 UI 与逻辑改本地版等。
  - API 硬编码 URL（DS_API/AUTH_API 等 21 处）保留不动，
    由 local-adapter.js 运行时拦截模拟，不产生任何外网请求。
"""
import io
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DEFAULT = os.path.join(BASE, "decrypted_inner.html")
OUT_DEFAULT = os.path.join(BASE, "game.html")
PATCH_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "localize_patch.json")
REF_FILE = os.path.join(BASE, "game.html.verified")


def apply_patch(src_lines, patch):
    lines = list(src_lines)
    # 逆序应用，保证行号不漂移
    for op in reversed(patch["ops"]):
        tag, i1, i2, j1, j2 = op["tag"], op["i1"], op["i2"], op["j1"], op["j2"]
        if tag in ('replace', 'insert'):
            lines[i1:i2] = patch["tgt_lines"][j1:j2]
        elif tag == 'delete':
            del lines[i1:i2]
    return '\n'.join(lines)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else SRC_DEFAULT
    out = sys.argv[2] if len(sys.argv) > 2 else OUT_DEFAULT
    src = os.path.abspath(src)
    out = os.path.abspath(out)

    if not os.path.exists(src):
        print("!! 源文件不存在: %s" % src)
        sys.exit(1)

    # 重要：decrypted_inner.html 是 UTF-8 编码（已验证），不要当 GB18030 读！
    with io.open(src, "r", encoding="utf-8") as f:
        src_text = f.read()
    print("读取源: %s (%d 字符)" % (src, len(src_text)))

    with io.open(PATCH_FILE, "r", encoding="utf-8") as f:
        patch = json.load(f)
    ops = patch["ops"]
    print("加载补丁: %d 个行级操作" % len(ops))
    for op in ops:
        print("  %-7s 行 %d..%d -> %d..%d" % (op["tag"], op["i1"], op["i2"], op["j1"], op["j2"]))

    # 关键：用【当前源】的行，而不是补丁里存储的旧 src_lines
    # 补丁 tgt_lines 保持不变，i1/i2 基于旧源；若当前源行号与旧源一致则可直接应用。
    result = apply_patch(src_text.split('\n'), patch)

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with io.open(out, "w", encoding="utf-8", newline="") as f:
        f.write(result)
    print("已输出: %s (%d 字符)" % (out, len(result)))

    if os.path.exists(REF_FILE):
        with io.open(REF_FILE, "r", encoding="utf-8") as f:
            ref = f.read()
        if ref == result:
            print("[OK] 与已验证 game.html 逐字节一致")
        else:
            n = 0
            for a, b in zip(ref, result):
                if a != b:
                    break
                n += 1
            print("[!!] 与已验证 game.html 不一致（首个差异在第 %d 字符）" % n)
            sys.exit(2)


if __name__ == "__main__":
    main()
