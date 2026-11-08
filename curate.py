#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json

d = json.load(open("data/repos.json"))

AI_EXCL = {"Snailclimb/JavaGuide", "supabase/supabase", "netdata/netdata", "shadcn-ui/ui"}
FUN_EXCL = {"dkhamsing/open-source-ios-apps","Igglybuff/awesome-piracy","leereilly/games",
            "cat-milk/Anime-Girls-Holding-Programming-Books","you-dont-need/You-Dont-Need-JavaScript",
            "hypit-ai/hypit","charmbracelet/vhs","livekit/livekit","jitsi/jitsi-meet","CarGuo/GSYVideoPlayer"}
PROD_KEEP = ["excalidraw/excalidraw","AppFlowy-IO/AppFlowy","usememos/memos","laurent22/joplin",
             "siyuan-note/siyuan","files-community/Files","logseq/logseq","lfnovo/open-notebook",
             "CorentinTh/it-tools","ShareX/ShareX","TriliumNext/Trilium","khoj-ai/khoj",
             "Wox-launcher/Wox","lissy93/dashy","super-productivity/super-productivity","jarun/nnn",
             "fullcalendar/fullcalendar","ActivityWatch/activitywatch","wulkano/Kap","foambubble/foam"]
SELFHOST_EXCL = {"n8n-io/n8n","unslothai/unsloth","ClickHouse/ClickHouse","HKUDS/nanobot","pathwaycom/serviette"}

prod_by_name = {r["full_name"]: r for r in d["productivity"]}
pool = json.load(open("data/productivity_pool.json"))
for r in pool:
    prod_by_name.setdefault(r["full_name"], r)

final = {}
final["ai"] = [r for r in d["ai"] if r["full_name"] not in AI_EXCL]
final["productivity"] = [prod_by_name[n] for n in PROD_KEEP if n in prod_by_name]
final["fun"] = [r for r in d["fun"] if r["full_name"] not in FUN_EXCL]

seen = set()
for cat in final:
    ded = []
    for r in final[cat]:
        if r["full_name"] in seen:
            continue
        seen.add(r["full_name"])
        ded.append(r)
    final[cat] = ded

for cat in ["devtools", "frontend", "selfhosted"]:
    arr = []
    for r in d.get(cat, []):
        if cat == "selfhosted" and r["full_name"] in SELFHOST_EXCL:
            continue
        if r["full_name"] in seen:
            continue
        seen.add(r["full_name"])
        arr.append(r)
    final[cat] = arr

json.dump(final, open("data/curated.json", "w"), ensure_ascii=False, indent=1)
for cat, arr in final.items():
    print(f"\n===== {cat} ({len(arr)}) =====")
    for r in arr:
        print(f"{r['stars']:>7} | {r['full_name']} | {(r['desc'] or '(no desc)')[:90]} | {r['lang']}")
