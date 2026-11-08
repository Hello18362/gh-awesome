/* ================= 我的收藏页 ================= */
/* FAV_INDEX 同样是 const 声明，不能通过 window 取 */
const INDEX = (typeof FAV_INDEX !== "undefined" && FAV_INDEX) ? FAV_INDEX : {};
setRepos(Object.keys(INDEX).map(k => INDEX[k]));

const wrap = document.getElementById("favwrap");
const emptyBox = document.getElementById("favEmpty");
const statLine = document.getElementById("favStat");
const CAT_ORDER = ["ai", "productivity", "fun", "devtools", "frontend", "selfhosted"];

/* 取收藏的项目，按分类分组、组内按编号升序 */
function grouped() {
  const out = {};
  Object.keys(FAV).forEach(k => {
    const r = INDEX[k];
    if (!r) return;
    (out[r.catId] = out[r.catId] || []).push(r);
  });
  return CAT_ORDER.filter(id => out[id] && out[id].length)
    .map(id => ({ id: id, list: out[id].sort((a, b) => a.rank - b.rank) }));
}

function renderFav() {
  const gs = grouped();
  const total = gs.reduce((n, g) => n + g.list.length, 0);

  if (!total) {
    wrap.innerHTML = "";
    emptyBox.style.display = "block";
    statLine.textContent = "还没有收藏 · 点卡片右上角的书签即可收进来";
    return;
  }
  emptyBox.style.display = "none";
  statLine.textContent = "共 " + total + " 个 · 分布在 " + gs.length + " 个分类 · 编号与分类页一致";
  if (!storageOK() && !STORE_PROBING) {
    statLine.innerHTML = esc(statLine.textContent) +
      ' <b style="color:#b45309">· 当前环境存不住（' + esc(storageMsg()) + "）</b>";
  }

  wrap.innerHTML = gs.map(g => {
    const cm = CATS[g.id];
    const list = g.list.map(r => cardHTML(r, { code: true })).join("");
    return '<section class="favgroup">' +
      '<div class="fghead">' +
        '<span class="fgicon" style="background:' + cm.grad + '">' + cm.icon + "</span>" +
        '<h2>' + esc(cm.name) + '<span class="code">' + cm.code + "</span></h2>" +
        '<span class="fgcount">' + g.list.length + " 个</span>" +
        '<a class="fgmore" href="' + cm.id + '.html">去' + esc(cm.name) + '页 →</a>' +
      "</div>" +
      '<div class="grid">' + list + "</div>" +
    "</section>";
  }).join("");

  bindCards(wrap);
  syncFavUI();
  applyFavFilter();
}

/* ---------- 搜索 ---------- */
const fq = document.getElementById("q");
function applyFavFilter() {
  const kw = fq.value.trim().toLowerCase();
  let shown = 0;
  wrap.querySelectorAll(".card").forEach(el => {
    const hit = !kw || el.dataset.search.indexOf(kw) >= 0;
    el.style.display = hit ? "" : "none";
    if (hit) shown++;
  });
  // 整组都被过滤掉就收起该组标题
  wrap.querySelectorAll(".favgroup").forEach(g => {
    const any = [...g.querySelectorAll(".card")].some(c => c.style.display !== "none");
    g.style.display = any ? "" : "none";
  });
  if (!fq.value.trim()) return;
  emptyBox.style.display = "none";
}
fq.addEventListener("input", applyFavFilter);

/* 收藏变化（取消、或从别的标签页同步过来）→ 重画 */
document.addEventListener("favchange", renderFav);

/* ---------- 导出 / 导入：把浏览器里的收藏变成可以用别的工具读的文件 ---------- */
const expMd = document.getElementById("expMd");
const expJson = document.getElementById("expJson");
const impBtn = document.getElementById("impBtn");
const impFile = document.getElementById("impFile");
const copyBtn = document.getElementById("copyBtn");

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

function today() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function saveFile(name, text, mime) {
  try {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  } catch (e) {
    toast("导出失败，浏览器可能拦截了下载");
  }
}

/* Markdown：给人看，也方便直接贴给 AI */
function exportMd() {
  const gs = grouped();
  const n = gs.reduce((s, g) => s + g.list.length, 0);
  if (!n) { toast("还没有收藏，先收藏几个吧"); return; }
  const L = [];
  L.push("# 我的 GitHub 精选收藏");
  L.push("");
  L.push("共 " + n + " 个项目 · 导出时间 " + today() + " · 编号与网站分类页一致");
  L.push("");
  gs.forEach(g => {
    const cm = CATS[g.id] || {};
    L.push("## " + (cm.icon ? cm.icon + " " : "") + (cm.name || g.id) +
           "（" + (cm.code || "") + "）· " + g.list.length + " 个");
    L.push("");
    g.list.forEach((r, i) => {
      L.push((i + 1) + ". **" + (r.code || cm.code) + "-" + pad2(r.rank) + " " + r.full_name +
             "** — ★ " + fmtK(r.stars) + " · " + (r.lang || "—"));
      if (r.tag) L.push("   " + r.tag);
      L.push("   " + r.url);
    });
    L.push("");
  });
  saveFile("收藏清单-" + today() + ".md", L.join("\n"), "text/markdown");
  toast("已导出 " + n + " 个收藏（.md）");
}

/* JSON：可回灌的备份，换设备/清缓存后能恢复 */
function exportJson() {
  const n = favCount();
  if (!n) { toast("还没有收藏，先收藏几个吧"); return; }
  const payload = {
    app: "github-awesome",
    version: 1,
    exported: new Date().toISOString(),
    count: n,
    items: FAV
  };
  saveFile("收藏备份-" + today() + ".json", JSON.stringify(payload, null, 2), "application/json");
  toast("已备份 " + n + " 个收藏（.json）");
}

function doImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { toast("文件不是合法的 JSON"); return; }
  if (obj && obj.items) obj = obj.items;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) { toast("不是本站导出的备份文件"); return; }

  let add = 0, dup = 0, miss = 0;
  const added = {};
  Object.keys(obj).forEach(k => {
    if (!(REPO_MAP[k] || INDEX[k])) { miss++; return; }
    if (isFav(k)) { dup++; return; }
    FAV[k] = Number(obj[k]) || Date.now();
    added[k] = FAV[k];
    add++;
  });

  if (!add) {
    toast("没有新增：已存在 " + dup + " 个" + (miss ? "，不在本榜里 " + miss + " 个" : ""));
    return;
  }
  persistFav();
  if (typeof postRemote === "function" && REMOTE_BASE) postRemote({ set: added });
  renderFav();
  toast("导入完成：新增 " + add + " 个" + (dup ? "，已存在 " + dup + " 个" : "") +
        (miss ? "，不在本榜里 " + miss + " 个" : ""));
}

if (impBtn && impFile) {
  impBtn.addEventListener("click", () => impFile.click());
  impFile.addEventListener("change", () => {
    const f = impFile.files && impFile.files[0];
    if (!f) return;
    if (f.size > 1024 * 1024) { toast("文件太大，不像是收藏备份"); impFile.value = ""; return; }
    const fr = new FileReader();
    fr.onload = () => { doImport(String(fr.result || "")); impFile.value = ""; };
    fr.onerror = () => { toast("读取文件失败"); impFile.value = ""; };
    fr.readAsText(f, "utf-8");
  });
}
/* 复制到剪贴板：下载被拦、或存不进磁盘时，用它把清单当场带走 */
function copyFav() {
  const n = favCount();
  if (!n) { toast("还没有收藏，先收藏几个吧"); return; }
  const text = JSON.stringify(FAV, null, 2);
  const panel = document.getElementById("copyPanel");
  const area = document.getElementById("copyArea");

  function fallback() {
    if (!panel || !area) { toast("复制失败，请手动全选复制"); return; }
    area.value = text;
    panel.classList.add("on");
    area.focus();
    area.select();
    toast("已选中，按 ⌘C 复制");
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("已复制 " + n + " 个收藏到剪贴板"), fallback);
  } else {
    fallback();
  }
}

if (copyBtn) copyBtn.addEventListener("click", copyFav);
if (expMd) expMd.addEventListener("click", exportMd);
if (expJson) expJson.addEventListener("click", exportJson);

renderFav();
