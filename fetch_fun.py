#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, time, urllib.request, urllib.parse, sys

def fetch_one(query):
    url = ("https://api.github.com/search/repositories?q=" + urllib.parse.quote(query)
           + "&sort=stars&order=desc&per_page=100")
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "repo-collector",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode())
    items = []
    for it in data.get("items", []):
        items.append({
            "full_name": it["full_name"], "name": it["name"],
            "owner": it["owner"]["login"], "avatar": it["owner"]["avatar_url"],
            "url": it["html_url"], "desc": (it.get("description") or "").strip(),
            "stars": it["stargazers_count"], "forks": it["forks_count"],
            "lang": it.get("language"), "topics": (it.get("topics") or [])[:6],
            "updated": (it.get("pushed_at") or "")[:10],
        })
    return items

d = json.load(open("data/repos.json"))
pool = {}
for r in d.get("fun", []):
    pool[r["full_name"]] = r

for q in ["topic:game stars:>5000",
          "topic:music stars:>3000",
          "topic:video stars:>4000",
          "topic:emulator stars:>1500",
          "topic:anime stars:>1500"]:
    print("query:", q, file=sys.stderr)
    try:
        for it in fetch_one(q):
            pool.setdefault(it["full_name"], it)
    except Exception as e:
        print("  ! error:", e, file=sys.stderr)
        time.sleep(30)
    time.sleep(8)

fun = sorted(pool.values(), key=lambda x: -x["stars"])[:40]
d["fun"] = fun

# selfhosted 补充
pool2 = {}
for r in d.get("selfhosted", []):
    pool2[r["full_name"]] = r
for q in ["topic:self-hosted stars:>4000"]:
    try:
        for it in fetch_one(q):
            pool2.setdefault(it["full_name"], it)
    except Exception as e:
        print("  ! error:", e, file=sys.stderr)
d["selfhosted"] = sorted(pool2.values(), key=lambda x: -x["stars"])[:20]

json.dump(d, open("data/repos.json", "w"), ensure_ascii=False, indent=1)
for cat in d:
    print(cat, len(d[cat]))
