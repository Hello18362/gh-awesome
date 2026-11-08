#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fetch top-starred GitHub repos by category."""
import json, time, urllib.request, urllib.parse, sys

def fetch(query, pages=3):
    items = []
    for page in range(1, pages+1):
        url = ("https://api.github.com/search/repositories?q=" + urllib.parse.quote(query)
               + f"&sort=stars&order=desc&per_page=100&page={page}")
        req = urllib.request.Request(url, headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "repo-collector",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode())
            items.extend(data.get("items", []))
        except Exception as e:
            print(f"  ! error on {query} p{page}: {e}", file=sys.stderr)
            break
        if len(data.get("items", [])) < 100:
            break
    return items

def simplify(items):
    out = []
    for it in items:
        out.append({
            "full_name": it["full_name"],
            "name": it["name"],
            "owner": it["owner"]["login"],
            "avatar": it["owner"]["avatar_url"],
            "url": it["html_url"],
            "desc": (it.get("description") or "").strip(),
            "stars": it["stargazers_count"],
            "forks": it["forks_count"],
            "lang": it.get("language"),
            "topics": (it.get("topics") or [])[:6],
            "updated": (it.get("pushed_at") or "")[:10],
        })
    return out

def dedupe_merge(queries, pages=2):
    pool = {}
    for q in queries:
        print(f"query: {q}", file=sys.stderr)
        for it in simplify(fetch(q, pages=pages)):
            pool[it["full_name"]] = it
        time.sleep(2)
    return sorted(pool.values(), key=lambda x: -x["stars"])

result = {}

# ---- AI 工具类 (目标 80) ----
ai_queries = [
    "topic:ai stars:>20000",
    "topic:llm stars:>15000",
    "topic:ai-agent stars:>3000",
    "topic:chatgpt stars:>10000",
    "topic:stable-diffusion stars:>5000",
    "topic:artificial-intelligence stars:>20000",
    "topic:ai-tools stars:>2000",
    "topic:prompt stars:>3000",
    "topic:langchain stars:>3000",
    "topic:generative-ai stars:>8000",
]
ai = dedupe_merge(ai_queries, pages=2)
result["ai"] = ai[:80]

# ---- 效率办公类 (目标 20) ----
prod_queries = [
    "topic:productivity stars:>5000",
    "topic:note-taking stars:>3000",
    "topic:markdown stars:>5000",
    "topic:knowledge-base stars:>2000",
    "topic:todo stars:>2000",
    "topic:office stars:>1000",
    "topic:notes stars:>5000",
    "topic:wiki stars:>3000",
]
prod = dedupe_merge(prod_queries, pages=2)
result["productivity"] = prod[:20]

# ---- 休闲娱乐类 (目标 30) ----
fun_queries = [
    "topic:game stars:>10000",
    "topic:game-2d stars:>2000",
    "topic:emulator stars:>3000",
    "topic:music stars:>5000",
    "topic:video stars:>5000",
    "topic:minecraft stars:>3000",
    "topic:retrogaming stars:>1000",
    "topic:entertainment stars:>500",
]
fun = dedupe_merge(fun_queries, pages=2)
result["fun"] = fun[:30]

# ---- 其他/更多分类 ----
other_queries = {
    "devtools": [
        "topic:developer-tools stars:>8000",
        "topic:cli stars:>10000",
    ],
    "frontend": [
        "topic:frontend stars:>10000",
        "topic:react stars:>15000",
    ],
    "selfhosted": [
        "topic:self-hosted stars:>5000",
    ],
}
for cat, qs in other_queries.items():
    result[cat] = dedupe_merge(qs, pages=2)[:20]

with open("data/repos.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=1)

for cat, arr in result.items():
    print(f"{cat}: {len(arr)} repos, top star {arr[0]['stars'] if arr else 0}")
