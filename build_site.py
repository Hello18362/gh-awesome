#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a multi-page site: index (category portals) + one page per category.

每页内部按 Star 降序编号 #01..#N，编号即"第几个"，页面之间共享样式与交互。
"""
import json
import os

ZH = json.load(open("data/zh_long.json"))
DETAIL = json.load(open("data/zh_detail.json"))

CATS = [
    {"id": "ai", "code": "AI", "name": "AI 工具", "icon": "🤖",
     "desc": "智能体、大模型、图像语音、提示词工程——当下最火的 AI 开源项目",
     "grad": "linear-gradient(135deg,#6366f1,#a855f7)"},
    {"id": "productivity", "code": "WORK", "name": "效率办公", "icon": "⚡",
     "desc": "笔记、白板、文件管理、时间追踪，让工作事半功倍",
     "grad": "linear-gradient(135deg,#f59e0b,#f97316)"},
    {"id": "fun", "code": "FUN", "name": "休闲娱乐", "icon": "🎮",
     "desc": "音乐、视频、游戏、追番，开源世界也很好玩",
     "grad": "linear-gradient(135deg,#ec4899,#f43f5e)"},
    {"id": "devtools", "code": "DEV", "name": "开发者工具", "icon": "🛠️",
     "desc": "终端神器、命令行工具与编程学习资源，程序员的兵器库",
     "grad": "linear-gradient(135deg,#0ea5e9,#06b6d4)"},
    {"id": "frontend", "code": "WEB", "name": "前端框架", "icon": "🎨",
     "desc": "框架、组件库与构建工具，现代前端的基石",
     "grad": "linear-gradient(135deg,#10b981,#14b8a6)"},
    {"id": "selfhosted", "code": "SELF", "name": "自托管服务", "icon": "🏠",
     "desc": "网盘、监控、Git 服务……把云服务搬回自己家",
     "grad": "linear-gradient(135deg,#8b5cf6,#6366f1)"},
]
for c in CATS:
    c["file"] = c["id"] + ".html"

LANG_COLORS = {
    "TypeScript": "#3178c6", "JavaScript": "#f1e05a", "Python": "#3572A5", "Java": "#b07219", "Go": "#00ADD8",
    "Rust": "#dea584", "C": "#555555", "C++": "#f34b7d", "C#": "#178600", "Swift": "#F05138", "Kotlin": "#A97BFF",
    "Dart": "#00B4AB", "Vue": "#41b883", "Svelte": "#ff3e00", "Shell": "#89e051", "Ruby": "#701516", "PHP": "#4F5D95",
    "Scala": "#c22d40", "Crystal": "#000100", "Clojure": "#db5855", "Markdown": "#083fa1", "MDX": "#fcb32c",
    "Jupyter Notebook": "#DA5B0B", "PowerShell": "#012456", "HTML": "#e34c26", "CSS": "#563d7c", "Lua": "#000080",
    "None": "#8b949e",
}


def fmt_stars(n):
    if n >= 1_000_000:
        return f"{n/1_000_000:.2f}".rstrip("0").rstrip(".") + "M"
    return f"{n/1000:.1f}k".replace(".0k", "k") if n >= 1000 else str(n)


def fmt_full(n):
    return f"{n:,}"


def esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


data = json.load(open("data/curated.json"))
cat_by_id = {c["id"]: c for c in CATS}

for cat, arr in data.items():
    meta = cat_by_id[cat]
    for i, r in enumerate(arr):
        d = DETAIL.get(r["full_name"], {})
        r["tag"] = d.get("tag") or ZH.get(r["full_name"], r["desc"])
        r["body"] = d.get("body") or []
        r["feats"] = d.get("feats") or []
        r["fit"] = d.get("fit") or ""
        r["rank"] = i + 1
        r["cat"] = meta["name"]
        r["catId"] = cat
        r["code"] = meta["code"]
        r["langColor"] = LANG_COLORS.get(r["lang"], "#8b949e")

TOTAL = sum(len(v) for v in data.values())
TOTAL_STARS = sum(r["stars"] for v in data.values() for r in v)

CSS = open("assets/site.css", encoding="utf-8").read()
MD_JS = open("assets/md.js", encoding="utf-8").read()
LOADER_JS = open("assets/readme-loader.js", encoding="utf-8").read()
CORE_JS = open("assets/core.js", encoding="utf-8").read()
CAT_JS = open("assets/cat.js", encoding="utf-8").read()
FAV_JS = open("assets/fav.js", encoding="utf-8").read()

# 各页共用的分类元数据（编号前缀、名称、图标、渐变）
CATS_JS = json.dumps({c["id"]: {"id": c["id"], "code": c["code"], "name": c["name"],
                                "icon": c["icon"], "grad": c["grad"]} for c in CATS},
                     ensure_ascii=False, separators=(",", ":"))

BOOK_SVG = ('<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
            'stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'
            '<path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4.4L5 21V4.5A1.5 1.5 0 0 1 6.5 3z"/></svg>')

PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<link id="siteCss" rel="stylesheet" href="assets/site.css">
<script>
/* 分享链接靠 ?sharecode= 放行。站内跳转一旦丢掉这个参数，在没有 cookie 的环境
   （内嵌 webview、隐私模式、聊天工具转发截断）就会直接 403「链接不完整」。
   这里把参数补回当前地址、样式表和所有站内链接；拿不到参数时什么也不做。 */
(function () {
  var sc = "";
  try {
    var m = location.search.match(/[?&]sharecode=([^&]+)/);
    if (m) sc = decodeURIComponent(m[1]);
    if (!sc) {
      var m2 = (document.referrer || "").match(/[?&]sharecode=([^&]+)/);
      if (m2) sc = decodeURIComponent(m2[1]);
    }
  } catch (e) { return; }
  if (!sc) return;
  window.__SHARECODE = sc;
  if (!/[?&]sharecode=/.test(location.search)) {
    try { history.replaceState(null, "", location.pathname + "?sharecode=" + encodeURIComponent(sc) + location.hash); } catch (e) {}
  }
  /* 样式表也是被同一道网关拦的：不补参数会出现「页面能开但没样式」 */
  var css = document.getElementById("siteCss");
  if (css) css.href = "assets/site.css?sharecode=" + encodeURIComponent(sc);
  function fix(h) {
    if (!h) return null;
    if (h.charAt(0) === "#") return null;
    if (h.indexOf("//") === 0) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return null;
    if (/[?&]sharecode=/.test(h)) return null;
    return h + (h.indexOf("?") >= 0 ? "&" : "?") + "sharecode=" + encodeURIComponent(sc);
  }
  function patch() {
    var as = document.querySelectorAll("a[href]");
    for (var i = 0; i < as.length; i++) {
      var n = fix(as[i].getAttribute("href"));
      if (n) as[i].setAttribute("href", n);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", patch);
  else patch();
  /* 卡片重绘、视图切换会换掉节点，点之前再兜一次 */
  document.addEventListener("click", function (e) {
    var t = e.target;
    while (t && t !== document && (!t.tagName || t.tagName.toLowerCase() !== "a")) t = t.parentNode;
    if (!t || t === document) return;
    var n = fix(t.getAttribute("href"));
    if (n) t.setAttribute("href", n);
  }, true);
})();
</script>
</head>
<body>
__BODY__
__SCRIPTS__
</body>
</html>
"""


def topbar(with_search=True, placeholder="搜索项目、描述或标签…", right=None):
    """顶栏；logo 始终返回首页，右侧固定有收藏入口。"""
    search = (f'<div class="search"><span class="ico">🔍</span>'
              f'<input id="q" type="text" placeholder="{placeholder}"></div>') if with_search else ""
    if right is None:
        right = ('<a class="gh-link" href="index.html">全部项目</a>' if with_search
                 else '<a class="gh-link" href="https://github.com/" target="_blank" rel="noopener">GitHub ↗</a>')
    fav = (f'<a class="fav-link" href="favorites.html" title="我的收藏">'
           f'{BOOK_SVG}<span class="fav-txt">收藏</span><span class="fav-count">0</span></a>')
    return f"""<div class="topbar">
  <div class="topbar-inner">
    <a class="logo" href="index.html"><span class="mark">⚡</span><span>GitHub 精选<small>AWESOME REPOS</small></span></a>
    {search}
    {fav}
    {right}
  </div>
</div>"""


FOOTER = f"""<footer>
  <div class="foot-inner">
    <b>GitHub 精选</b> · 优质开源项目集合 · 共 {TOTAL} 个项目 / 6 大分类<br>
    数据来源 GitHub Search API · Star 数截至 2026-11-04 · 每个分类内按 Star 降序编号 #01–#N<br>
    Made with ⚡ by WorkBuddy
  </div>
</footer>"""

# ---------------- 首页 ----------------
portals = []
for c in CATS:
    arr = data[c["id"]]
    top = arr[:3]
    li = "".join(
        f'<li><span class="pn">#{r["rank"]:02d}</span>'
        f'<span class="pr">{esc(r["full_name"])}</span>'
        f'<span class="ps">★ {fmt_stars(r["stars"])}</span></li>'
        for r in top
    )
    portals.append(f"""  <a class="portal" href="{c['file']}">
    <div class="portal-top" style="background:{c['grad']}">
      <div class="portal-icon">{c['icon']}</div>
      <div style="min-width:0">
        <h2>{c['name']}<span class="code">{c['code']}</span></h2>
        <div class="cnt">{len(arr)} 个项目 · 编号 #{1:02d}–#{len(arr):02d}</div>
      </div>
    </div>
    <div class="portal-body">
      <p class="portal-desc">{c['desc']}</p>
      <ul class="ptop">{li}</ul>
      <div class="portal-go">进入 {c['name']} <span>第 1–{len(arr)} 个 →</span></div>
    </div>
  </a>""")

home_body = f"""{topbar(with_search=False)}
<header class="hero">
  <span class="kicker">✦ 数据抓取于 2026-11-04 · 分 6 个页面 · 每页按 Star 降序编号</span>
  <h1>发现 GitHub 上<span class="grad">最值得收藏</span>的开源项目</h1>
  <p>精选 AI 工具、效率办公、休闲娱乐等 {TOTAL} 个高星优质项目。每个项目在所属分类页里都有一个固定编号，按 Star 数从 #01 往下排。</p>
  <div class="howto">💡 想部署哪个项目，直接说：<code>AI 页第 12 个</code> 或 <code>AI-12</code> 就行</div>
  <div class="stats">
    <div class="stat"><b>{TOTAL}</b><span>精选项目</span></div>
    <div class="stat"><b>{fmt_stars(TOTAL_STARS)}</b><span>累计 Star</span></div>
    <div class="stat"><b>6</b><span>分类页面</span></div>
    <div class="stat"><b>{len(data['ai'])}</b><span>最大榜 AI 页</span></div>
  </div>
</header>
<main>
  <div class="portals">
{chr(10).join(portals)}
  </div>
</main>
{FOOTER}"""

HOME_SCRIPTS = """<script>
/* 首页只读收藏数（完整收藏逻辑在分类页与收藏页） */
(function () {
  try {
    var n = Object.keys(JSON.parse(localStorage.getItem("ghfav.v1") || "{}")).length;
    document.querySelectorAll(".fav-count").forEach(function (e) { e.textContent = n; });
    document.querySelectorAll(".fav-link").forEach(function (a) { a.classList.toggle("has", n > 0); });
  } catch (e) { /* 隐私模式忽略 */ }
})();
</script>"""

home_html = (PAGE.replace("__TITLE__", "GitHub 精选 · 优质开源项目集合")
             .replace("__BODY__", home_body)
             .replace("__SCRIPTS__", HOME_SCRIPTS))

# ---------------- 分类页 ----------------
MODAL = """<div class="overlay" id="overlay">
  <div class="modal" id="modal" role="dialog" aria-modal="true">
    <div class="m-hero" id="mHero">
      <button class="m-close" id="mClose" aria-label="关闭">✕</button>
      <div class="m-top">
        <img class="m-avatar" id="mAvatar" alt="">
        <div class="m-title">
          <h3><span id="mName"></span><span class="m-id" id="mId"></span><span class="cat-tag" id="mCat"></span></h3>
          <div class="sub" id="mSub"></div>
        </div>
      </div>
      <div class="m-btns">
        <button class="m-btn ghost with-label" id="mFav" aria-label="收藏">收藏</button>
        <button class="m-btn deploy" id="mDeploy" type="button" title="复制一段可直接粘给 AI 的部署指令">⚡ 复制部署指令</button>
        <a class="m-btn solid" id="mGithub" target="_blank" rel="noopener">在 GitHub 打开 ↗</a>
      </div>
    </div>
    <div class="m-body">
      <div class="m-stats" id="mStats"></div>
      <div class="m-intro" id="mIntro"></div>
      <details class="m-en-box"><summary>英文原始描述</summary><p class="m-en" id="mEn"></p></details>
      <div class="m-topics" id="mTopics"></div>
      <div class="m-readme">
        <span class="m-sec-label">README 摘要</span>
        <div class="m-readme-box" id="mReadmeBox"></div>
      </div>
    </div>
  </div>
</div>"""

for c in CATS:
    arr = data[c["id"]]
    n = len(arr)
    stars_sum = sum(r["stars"] for r in arr)

    chips = "".join(
        f'<a class="cchip{" active" if k["id"] == c["id"] else ""}" href="{k["file"]}">'
        f'{k["icon"]} {k["name"]} <span class="n">{len(data[k["id"]])}</span></a>'
        for k in CATS
    )

    page_body = f"""{topbar(placeholder="在 " + c['name'] + " 里搜索…")}
<header class="chero">
  <div class="chero-row">
    <div class="chero-icon" style="background:{c['grad']}">{c['icon']}</div>
    <div>
      <h1>{c['name']}<span class="code">{c['code']}</span></h1>
      <p class="desc">{c['desc']}</p>
      <div class="pills">
        <span class="pill">共 <b>{n}</b> 个项目</span>
        <span class="pill">编号 <b>#{1:02d} – #{n:02d}</b></span>
        <span class="pill">累计 <b>★ {fmt_stars(stars_sum)}</b></span>
        <span class="pill">引用格式 <b>{c['code']}-12</b></span>
      </div>
    </div>
  </div>
</header>

<nav class="switchbar"><div class="switchbar-inner">
  {chips}
  <div class="viewtog">
    <button data-v="grid" class="on">卡片</button>
    <button data-v="rows">列表</button>
  </div>
</div></nav>

<main>
  <section class="listwrap" id="listwrap"></section>
  <div class="empty" id="empty">😕 这个分类里没有匹配的项目，换个关键词试试</div>
</main>
{FOOTER}
{MODAL}"""

    payload = json.dumps(arr, ensure_ascii=False, separators=(",", ":"))

    scripts = f"""<script>
const PAGE = {json.dumps({"cat": {"id": c["id"], "code": c["code"], "name": c["name"],
                                  "icon": c["icon"], "grad": c["grad"], "desc": c["desc"],
                                  "count": n}}, ensure_ascii=False)};
const CATS = {CATS_JS};
const REPOS = __PAYLOAD__;
__MD_JS__
__CORE_JS__
__CAT_JS__
__LOADER_JS__
</script>"""
    # 先放占位符再逐段替换，避免 JSON 里出现占位符字样被误替换
    scripts = (scripts.replace("__PAYLOAD__", payload)
               .replace("__MD_JS__", MD_JS)
               .replace("__CORE_JS__", CORE_JS)
               .replace("__CAT_JS__", CAT_JS)
               .replace("__LOADER_JS__", LOADER_JS))

    html = (PAGE.replace("__TITLE__", f"{c['name']}（{n} 个）· GitHub 精选")
                .replace("__BODY__", page_body)
                .replace("__SCRIPTS__", scripts))
    with open(c["file"], "w", encoding="utf-8") as f:
        f.write(html)
    print(f"{c['file']:<20} {n:>3} repos  {len(html)/1024:6.1f} KB")

with open("index.html", "w", encoding="utf-8") as f:
    f.write(home_html)
print(f"{'index.html':<20} home       {len(home_html)/1024:6.1f} KB")

# ---------------- 我的收藏页 ----------------
fav_index = {}
for cid, arr in data.items():
    for r in arr:
        fav_index[r["full_name"]] = {k: r[k] for k in (
            "full_name", "owner", "url", "avatar", "desc", "tag", "body", "feats", "fit",
            "stars", "forks", "lang", "langColor", "updated", "topics", "rank", "catId", "code")}

fav_body = f"""{topbar(placeholder="在收藏里搜索…")}
<header class="favhead">
  <h1><span class="ico">{BOOK_SVG}</span>我的收藏</h1>
  <div class="sub"><span id="favStat">还没有收藏</span></div>
  <div class="favtools">
    <button class="ftool primary" id="expMd" type="button">导出清单 .md</button>
    <button class="ftool" id="expJson" type="button">备份 .json</button>
    <button class="ftool" id="copyBtn" type="button">复制到剪贴板</button>
    <button class="ftool" id="impBtn" type="button">导入备份</button>
    <input type="file" id="impFile" accept=".json,application/json" hidden>
    <span class="ftip">导出后把文件交给我，我就能读到你的收藏</span>
  </div>
  <div class="copybox" id="copyPanel">
    <p>浏览器的剪贴板权限被拒了，下面是收藏数据，全选复制后发给我即可：</p>
    <textarea id="copyArea" readonly spellcheck="false"></textarea>
  </div>
</header>
<main>
  <div id="favwrap"></div>
  <div class="fav-empty" id="favEmpty">
    <div class="fe-ico">{BOOK_SVG}</div>
    <h2>还没有收藏任何项目</h2>
    <p>在任意项目卡片右上角点一下书签，就会收进这里。遇到「挺好但暂时用不上」的项目，先存着，比记在备忘录里靠谱。</p>
    <a class="go" href="index.html">去逛逛 →</a>
  </div>
  <div class="favnote">收藏保存在<b>本机的收藏服务</b>里（data/favorites.json），换浏览器、刷新、重开都还在；只有换电脑才需要手动搬一次。</div>
</main>
{FOOTER}
{MODAL}"""

fav_scripts = """<script>
const CATS = __CATS__;
const FAV_INDEX = __FAV__;
__MD_JS__
__CORE_JS__
__LOADER_JS__
__FAV_JS__
</script>"""
fav_scripts = (fav_scripts.replace("__FAV__", json.dumps(fav_index, ensure_ascii=False, separators=(",", ":")))
                          .replace("__CATS__", CATS_JS)
                          .replace("__MD_JS__", MD_JS)
                          .replace("__CORE_JS__", CORE_JS)
                          .replace("__LOADER_JS__", LOADER_JS)
                          .replace("__FAV_JS__", FAV_JS))

fav_html = (PAGE.replace("__TITLE__", "我的收藏 · GitHub 精选")
                .replace("__BODY__", fav_body)
                .replace("__SCRIPTS__", fav_scripts))
with open("favorites.html", "w", encoding="utf-8") as f:
    f.write(fav_html)
print(f"{'favorites.html':<20} fav        {len(fav_html)/1024:6.1f} KB  ({len(fav_index)} indexed)")

print("total", TOTAL, "repos")
