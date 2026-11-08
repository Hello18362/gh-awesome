#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""直接从浏览器 localStorage 里读出本站收藏（键名 ghfav.v1）。

用法：
    python3 tools/read_favs.py            # 打印清单
    python3 tools/read_favs.py --json     # 只输出 JSON
    python3 tools/read_favs.py --all      # 连空的 profile 也列出来（排查用）

Chrome 系的 localStorage 存在 <profile>/Local Storage/leveldb 里，键格式是
    _<origin>\x00\x01<key>
其中 key 可能是 UTF-8，也可能是 UTF-16LE（Chrome 对非 ASCII 值会这么存），
值同理。所以这里对两种编码都做匹配，取最后一次出现的那条。
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CURATED = os.path.join(ROOT, "data", "curated.json")

FAV_KEY = "ghfav.v1"

BROWSERS = [
    ("Chrome", "~/Library/Application Support/Google/Chrome"),
    ("Edge", "~/Library/Application Support/Microsoft Edge"),
    ("Brave", "~/Library/Application Support/BraveSoftware/Brave-Browser"),
    ("Vivaldi", "~/Library/Application Support/Vivaldi"),
    ("Chromium", "~/Library/Application Support/Chromium"),
    ("WorkBuddy", "~/.workbuddy/app/session"),
]


def key_patterns(key):
    """返回 (字节模式, 该模式下 key 的编码)"""
    pats = [(key.encode("ascii"), "utf8")]
    pats.append((b"" .join(c.encode("ascii") + b"\x00" for c in key), "utf16"))
    return pats


def decode_json_at(buf, start, enc):
    """从 start 开始找一个完整的 JSON 对象文本"""
    if enc == "utf16":
        text = buf[start:start + 400000].decode("utf-16-le", "replace")
    else:
        text = buf[start:start + 400000].decode("utf-8", "replace")
    i = text.find("{")
    if i < 0:
        return None
    depth, end = 0, None
    in_str, esc = False, False
    for j in range(i, len(text)):
        ch = text[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    if not end:
        return None
    try:
        return json.loads(text[i:end])
    except Exception:
        return None


def scan_db(dbdir):
    """扫一个 leveldb 目录，返回 [(origin, dict)]"""
    out = []
    files = sorted(glob.glob(os.path.join(dbdir, "*")), key=lambda p: os.path.getmtime(p))
    for f in files:
        if not os.path.isfile(f) or f.endswith(("LOCK", "CURRENT", "LOG", "LOG.old")):
            continue
        try:
            buf = open(f, "rb").read()
        except Exception:
            continue
        for pat, enc in key_patterns(FAV_KEY):
            pos = 0
            while True:
                i = buf.find(pat, pos)
                if i < 0:
                    break
                pos = i + 1
                # origin 就在 key 前面，形如 _http://127.0.0.1:8765\x00\x01
                head = buf[max(0, i - 200):i + 8].decode("latin-1", "replace")
                cands = re.findall(r"(_(?:https?|file)://[^\x00-\x1f]+)", head)
                origin = cands[-1][1:] if cands else "?"
                data = decode_json_at(buf, i + len(pat), enc)
                if isinstance(data, dict):
                    out.append((origin, data, os.path.basename(f)))
    return out


def load_meta():
    try:
        raw = json.load(open(CURATED, encoding="utf-8"))
    except Exception:
        return {}
    meta = {}
    for cid, arr in raw.items():
        for i, r in enumerate(arr):
            meta[r["full_name"]] = {"rank": i + 1, "cat": cid, "stars": r.get("stars"), "lang": r.get("lang")}
    return meta


def main():
    as_json = "--json" in sys.argv
    show_all = "--all" in sys.argv
    meta = load_meta()
    found = []

    # --profile 指向任意 Chromium 系 profile 目录（调试/验证用）
    extra = []
    if "--profile" in sys.argv:
        p = sys.argv[sys.argv.index("--profile") + 1]
        extra.append(("自定义", p))

    for name, path in BROWSERS + extra:
        base = os.path.expanduser(path)
        if not os.path.isdir(base):
            continue
        for dbdir in glob.glob(os.path.join(base, "**", "Local Storage", "leveldb"), recursive=True):
            hits = scan_db(dbdir)
            for origin, data, src in hits:
                found.append({
                    "browser": name,
                    "origin": origin,
                    "count": len(data),
                    "items": data,
                    "db": dbdir,
                    "file": src,
                })
            if show_all:
                print(f"[{name}] {dbdir}: {len(hits)} 条命中", file=sys.stderr)

    # 同一份数据可能在 .log 和 .ldb 里各出现一次，按 (browser, origin) 取条数最多的
    best = {}
    for f in found:
        k = (f["browser"], f["origin"])
        if k not in best or f["count"] > best[k]["count"]:
            best[k] = f

    if as_json:
        print(json.dumps(list(best.values()), ensure_ascii=False, indent=2))
        return

    if not best:
        print("没有在任何浏览器里找到收藏数据（ghfav.v1）。")
        print("常见原因：收藏是在 WorkBuddy 预览窗口里点的，那个环境不允许网页写本地存储。")
        print("解决：用 Chrome 打开 index.html 收藏，或点收藏页的「导出 / 复制」。")
        return

    total = 0
    for (browser, origin), f in best.items():
        print(f"\n== {browser} · {origin} ==  {f['count']} 个")
        groups = {}
        for full, ts in f["items"].items():
            m = meta.get(full, {})
            groups.setdefault(m.get("cat", "其他"), []).append((m.get("rank", 999), full, m))
        for cat, rows in groups.items():
            rows.sort()
            print(f"  [{cat}] {len(rows)} 个")
            for rank, full, m in rows:
                stars = m.get("stars")
                s = f"{stars/1000:.1f}k" if stars else "—"
                code = {"ai": "AI", "productivity": "WORK", "fun": "FUN",
                        "devtools": "DEV", "frontend": "WEB", "selfhosted": "SELF"}.get(cat, "?")
                tag = f"{code}-{rank:02d}" if rank != 999 else "??"
                print(f"    {tag:<9} {full:<48} ★{s}")
                total += 1
    print(f"\n合计 {total} 个")


if __name__ == "__main__":
    main()
