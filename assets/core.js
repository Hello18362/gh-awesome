/* ================= 通用工具 ================= */
function pad2(n) { return n < 10 ? "0" + n : String(n); }
function medalCls(n) { return n === 1 ? "g1" : n === 2 ? "g2" : n === 3 ? "g3" : ""; }
function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : "" + n; }
function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function searchText(r) {
  return (r.full_name + " " + r.desc + " " + r.tag + " " + (r.topics || []).join(" ") + " " + (r.lang || "")).toLowerCase();
}
/* 注意：CATS 是用 const 声明的，不会挂到 window 上，必须直接按标识符取 */
function catMeta(id) {
  const map = (typeof CATS !== "undefined" && CATS) ? CATS : {};
  return map[id] || { code: "", name: "", icon: "", grad: "linear-gradient(135deg,#6366f1,#a855f7)" };
}

/* ================= 字段索引：full_name -> repo ================= */
const REPO_MAP = {};
function setRepos(arr) { (arr || []).forEach(r => { REPO_MAP[r.full_name] = r; }); }

/* ================= 收藏（本机保存） ================= */
const FAV_KEY = "ghfav.v1";

/* 存储适配：localStorage → sessionStorage → 内存
   预览窗口、隐私模式、sandbox iframe 里 localStorage 会直接抛错。
   老实现把异常 catch 掉了，结果是「点收藏有反应，但其实没存」，
   所以这里先显式探测能不能写，再决定用哪一层，并把结论暴露给用户。 */
const STORE = (function () {
  function probe(s) {
    try {
      const k = "__ghfav_probe__";
      s.setItem(k, "1");
      const ok = s.getItem(k) === "1";
      s.removeItem(k);
      return ok;
    } catch (e) { return false; }
  }
  try {
    if (window.localStorage && probe(window.localStorage)) return { kind: "local", api: window.localStorage };
  } catch (e) { /* 某些环境连访问属性都会抛 */ }
  try {
    if (window.sessionStorage && probe(window.sessionStorage)) return { kind: "session", api: window.sessionStorage };
  } catch (e) { /* 同上 */ }
  return { kind: "memory", api: null };
})();

let FAV = (function () {
  if (!STORE.api) return {};
  try {
    const o = JSON.parse(STORE.api.getItem(FAV_KEY) || "{}");
    if (o && typeof o === "object" && !Array.isArray(o)) return o;
  } catch (e) { /* 数据损坏 */ }
  return {};
})();

let SAVE_FAILED = false;

/* ---------- 本地收藏服务（预览窗口不让写 localStorage 时的唯一出路） ----------
   tools/fav_server.py 在 127.0.0.1:8765 起一个服务，收藏存成 data/favorites.json。
   页面通过 HTTP 读写，绕开浏览器的存储限制。探测到就用它，探测不到才退回内存。 */
const REMOTE_PORTS = [8765, 8766, 8767, 8768, 8769, 8770, 8771, 8772, 8773, 8774, 8775];
let REMOTE_BASE = null;
let STORE_PROBING = false;

/* 只有在本机打开时才去找本地收藏服务。发布到公网后，访客打开的是线上页面，
   收藏归各自浏览器所有——这时候去打 127.0.0.1 只会得到一串失败请求。 */
const IS_LOCAL_PAGE =
  location.protocol === "file:" ||
  /^(127\.0\.0\.1|localhost|::1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);

function healthOf(port) {
  return fetch("http://127.0.0.1:" + port + "/api/health", { cache: "no-store", mode: "cors" })
    .then(r => (r.ok ? r.json() : null))
    .then(j => (j && j.app === "gh-awesome" ? "http://127.0.0.1:" + port : null))
    .catch(() => null);
}
/* 先试最可能的 8765，没中再扫后面几个，避免每次开页都打 11 个请求 */
function probeRemote() {
  return healthOf(REMOTE_PORTS[0]).then(base => {
    if (base) return base;
    return Promise.all(REMOTE_PORTS.slice(1).map(healthOf)).then(l => l.filter(Boolean)[0] || null);
  });
}

/* 只提交「变了什么」，绝不整份覆盖——否则一个空页面就能把服务端数据冲掉 */
const PENDING = { set: {}, del: [] };

function queuePending(payload) {
  if (payload.set) {
    Object.keys(payload.set).forEach(k => {
      PENDING.set[k] = payload.set[k];
      const i = PENDING.del.indexOf(k);
      if (i >= 0) PENDING.del.splice(i, 1);
    });
  }
  (payload.del || []).forEach(k => {
    delete PENDING.set[k];
    if (PENDING.del.indexOf(k) < 0) PENDING.del.push(k);
  });
}

function flushPending() {
  if (!REMOTE_BASE) return;
  const set = PENDING.set, del = PENDING.del;
  if (!Object.keys(set).length && !del.length) return;
  PENDING.set = {};
  PENDING.del = [];
  postRemote({ set: set, del: del });
}

function postRemote(payload) {
  if (!REMOTE_BASE) { queuePending(payload); return Promise.resolve(false); }
  return fetch(REMOTE_BASE + "/api/fav", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      SAVE_FAILED = !(j && j.ok);
      if (SAVE_FAILED) mountStoreWarn();
      return !SAVE_FAILED;
    })
    .catch(() => { SAVE_FAILED = true; mountStoreWarn(); return false; });
}

function pullRemote() {
  return fetch(REMOTE_BASE + "/api/fav", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(o => {
      if (!o || typeof o !== "object" || Array.isArray(o)) return;
      let changed = false;
      Object.keys(o).forEach(k => { if (!isFav(k)) { FAV[k] = o[k]; changed = true; } });
      if (changed) {
        syncFavUI();
        document.dispatchEvent(new CustomEvent("favchange", { detail: { full: "", on: false } }));
      }
    })
    .catch(() => {});
}

/* 有本地服务就优先用它（数据落在工程目录里，随时可读、可备份）；
   没有服务时退回浏览器存储；再不行才是内存 + 告警 */
function initStorage() {
  // 线上分享链接：收藏存各自浏览器，不碰本机服务
  if (!IS_LOCAL_PAGE) {
    STORE_PROBING = false;
    if (!STORE.api) mountStoreWarn();
    return;
  }
  STORE_PROBING = true;
  const before = Object.assign({}, FAV);        // 本地已经有的（可能来自浏览器存储）
  probeRemote().then(base => {
    STORE_PROBING = false;
    if (!base) { mountStoreWarn(); return; }
    REMOTE_BASE = base;
    SAVE_FAILED = false;
    return fetch(base + "/api/fav", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(server => {
        server = (server && typeof server === "object" && !Array.isArray(server)) ? server : {};
        let changed = false;
        Object.keys(server).forEach(k => { if (!isFav(k)) { FAV[k] = server[k]; changed = true; } });
        if (changed) {
          syncFavUI();
          document.dispatchEvent(new CustomEvent("favchange", { detail: { full: "", on: false } }));
        }
        // 本地有、服务端没有的 → 只补这些，绝不整份覆盖
        const add = {};
        Object.keys(before).forEach(k => { if (!(k in server)) add[k] = before[k]; });
        if (Object.keys(add).length) postRemote({ set: add });
        flushPending();          // 探测期间点过的收藏，这时候补发
      })
      .catch(() => {})
      .then(() => {
        if (STORE.api) {
          try { STORE.api.setItem(FAV_KEY, JSON.stringify(FAV)); } catch (e) { /* 无所谓 */ }
        }
      });
  }).catch(() => {
    STORE_PROBING = false;
    mountStoreWarn();
  });
}

/* 当前收藏是否真的存到了磁盘上 */
function storageOK() {
  if (SAVE_FAILED) return false;
  return STORE.kind === "local" || !!REMOTE_BASE;
}
function storageMsg() {
  if (SAVE_FAILED) return "写入失败了，这次收藏可能没保存";
  if (!IS_LOCAL_PAGE) return "浏览器禁用了本地存储（可能开了无痕模式），收藏关掉页面就没了";
  if (STORE.kind === "session") return "浏览器禁用了本地存储，收藏只在本次标签页有效，关掉就没了";
  return "存不住：预览窗口禁止网页写存储，本地收藏服务也没启动。双击「打开网站.command」可解决";
}

function isFav(full) { return !!full && Object.prototype.hasOwnProperty.call(FAV, full); }
function favCount() { return Object.keys(FAV).length; }
function favIcon(on) {
  return '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="' + (on ? "currentColor" : "none") +
    '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4.4L5 21V4.5A1.5 1.5 0 0 1 6.5 3z"/></svg>';
}
function paintFavBtn(el) {
  const full = el.dataset.fav;
  if (!full) return;
  const on = isFav(full);
  el.classList.toggle("on", on);
  el.title = on ? "取消收藏" : "收藏到我的清单";
  el.setAttribute("aria-pressed", on ? "true" : "false");
  el.innerHTML = favIcon(on) + (el.classList.contains("with-label") ? "<span>" + (on ? "已收藏" : "收藏") + "</span>" : "");
}
function syncFavUI() {
  document.querySelectorAll("[data-fav]").forEach(paintFavBtn);
  const n = favCount();
  document.querySelectorAll(".fav-count").forEach(el => { el.textContent = n; });
  document.querySelectorAll(".fav-link").forEach(a => a.classList.toggle("has", n > 0));
}
function persistFav() {
  if (!STORE.api) return false;
  try {
    STORE.api.setItem(FAV_KEY, JSON.stringify(FAV));
    SAVE_FAILED = false;
    return true;
  } catch (e) {
    SAVE_FAILED = true;
    return false;
  }
}

/* 传变化的那个项目给服务端：加就 set，删就 del */
function syncOne(full, on) {
  if (!REMOTE_BASE) return;
  if (on) postRemote({ set: (function () { const o = {}; o[full] = FAV[full]; return o; })() });
  else postRemote({ del: [full] });
}

/* 存不住的时候，页面底部必须说出来，并且给一条能立刻把数据带走的路 */
function mountStoreWarn() {
  if (storageOK() || STORE_PROBING || document.getElementById("storewarn")) return;
  const bar = document.createElement("div");
  bar.id = "storewarn";
  bar.className = "storewarn";
  bar.innerHTML =
    '<span class="sw-ico">⚠️</span>' +
    '<span class="sw-txt">' + esc(storageMsg()) + "</span>" +
    '<a class="sw-btn" href="favorites.html">导出备份</a>';
  document.body.appendChild(bar);
  document.body.classList.add("has-storewarn");
}
window.addEventListener("DOMContentLoaded", () => {
  initStorage();
  // 线上版的收藏属于访客自己，说明文字要跟着改
  if (!IS_LOCAL_PAGE) {
    const note = document.querySelector(".favnote");
    if (note) {
      note.innerHTML = "收藏保存在 <b>你自己这台设备的浏览器</b>里，只属于你，别人看不到。" +
        "换设备或清理浏览器数据会丢失，建议偶尔点一下「备份 .json」。";
    }
  }
});
window.addEventListener("load", () => { setTimeout(mountStoreWarn, 1200); });
function toggleFav(full) {
  if (!full) return false;
  if (isFav(full)) delete FAV[full];
  else FAV[full] = Date.now();
  const on = isFav(full);
  const saved = persistFav();
  syncOne(full, on);
  if (!saved && !REMOTE_BASE) mountStoreWarn();
  syncFavUI();
  document.dispatchEvent(new CustomEvent("favchange", { detail: { full: full, on: on } }));
  return on;
}
function removeFav(full) {
  if (!isFav(full)) return;
  delete FAV[full];
  const saved = persistFav();
  syncOne(full, false);
  if (!saved && !REMOTE_BASE) mountStoreWarn();
  syncFavUI();
  document.dispatchEvent(new CustomEvent("favchange", { detail: { full: full, on: false } }));
}

/* 捕获阶段统一接管收藏点击：既保证卡片重建后依然有效，也避免误触卡片的"打开详情" */
document.addEventListener("click", e => {
  const btn = e.target.closest && e.target.closest("[data-fav]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  toggleFav(btn.dataset.fav);
}, true);

/* 多个标签页同时开着时保持同步 */
window.addEventListener("storage", e => {
  if (e.key !== FAV_KEY) return;
  try {
    const o = JSON.parse(e.newValue || "{}");
    FAV = (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
  } catch (err) { FAV = {}; }
  syncFavUI();
  document.dispatchEvent(new CustomEvent("favchange", { detail: { full: "", on: false } }));
});

/* ================= 卡片模板 ================= */
function cardHTML(r, opts) {
  opts = opts || {};
  const cm = catMeta(r.catId);
  const label = opts.code ? (r.code || cm.code) + "-" + pad2(r.rank) : "#" + pad2(r.rank);
  return '<article class="card" style="--cgrad:' + cm.grad + '" data-full="' + esc(r.full_name) +
    '" data-search="' + esc(searchText(r)) + '">' +
    '<button class="favbtn" data-fav="' + esc(r.full_name) + '" aria-label="收藏"></button>' +
    '<div class="c-top">' +
      '<span class="num ' + medalCls(r.rank) + '" title="编号 ' + (r.code || cm.code) + "-" + pad2(r.rank) + '">' + label + "</span>" +
      '<img class="avatar" loading="lazy" src="' + r.avatar + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<span class="c-name"><span class="repo" title="' + esc(r.full_name) + '">' + esc(r.full_name) + "</span></span>" +
    "</div>" +
    '<p class="c-zh">' + esc(r.tag) + "</p>" +
    '<p class="c-en">' + esc(r.desc) + "</p>" +
    '<div class="c-foot">' +
      '<span class="stars">★ ' + fmtK(r.stars) + "</span>" +
      '<span class="lang"><i style="background:' + r.langColor + '"></i>' + esc(r.lang || "—") + "</span>" +
      '<span class="more-hint">详情 ›</span>' +
    "</div></article>";
}

/* 给新渲染出来的卡片/行绑定打开详情 + 悬停预取 */
function bindCards(root) {
  (root || document).querySelectorAll("[data-full]:not([data-bound])").forEach(el => {
    el.dataset.bound = "1";
    const r = REPO_MAP[el.dataset.full];
    if (!r) return;
    el.addEventListener("click", () => openRepo(r));
    el.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => prefetchReadme(r.full_name), 120);
    });
    el.addEventListener("mouseleave", () => clearTimeout(hoverTimer));
  });
}

/* ================= 详情弹窗 ================= */
const overlay = document.getElementById("overlay");
const mHero = document.getElementById("mHero"),
      mAvatar = document.getElementById("mAvatar"),
      mName = document.getElementById("mName"),
      mId = document.getElementById("mId"),
      mCat = document.getElementById("mCat"),
      mSub = document.getElementById("mSub"),
      mGithub = document.getElementById("mGithub"),
      mStats = document.getElementById("mStats"),
      mIntro = document.getElementById("mIntro"),
      mEn = document.getElementById("mEn"),
      mTopics = document.getElementById("mTopics"),
      mReadmeBox = document.getElementById("mReadmeBox"),
      mFav = document.getElementById("mFav"),
      mDeploy = document.getElementById("mDeploy");
let readmeToken = 0;
let hoverTimer = null;
let currentRepo = null;

function openRepo(r) {
  if (!r || !overlay) return;
  currentRepo = r;
  const cm = catMeta(r.catId);
  const code = r.code || cm.code;
  mHero.style.background = cm.grad;
  mAvatar.src = r.avatar;
  mName.textContent = r.full_name;
  mId.textContent = code + "-" + pad2(r.rank);
  mCat.textContent = (cm.icon || "") + " " + (cm.name || "");
  mSub.textContent = "本榜第 " + r.rank + " 个 · " + (r.owner ? r.owner + " · " : "") + "★ " + fmtK(r.stars);
  mGithub.href = r.url;
  mStats.innerHTML =
    '<div class="m-stat"><b class="st">★ ' + fmtK(r.stars) + "</b><span>Stars</span></div>" +
    '<div class="m-stat"><b>' + fmtK(r.forks) + "</b><span>Forks</span></div>" +
    '<div class="m-stat"><b><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + r.langColor + ';margin-right:5px"></i>' + esc(r.lang || "—") + "</b><span>语言</span></div>" +
    '<div class="m-stat"><b style="font-size:13.5px">' + esc(r.updated || "—") + "</b><span>最近更新</span></div>";
  mIntro.innerHTML =
    (r.tag ? '<div class="m-tag">' + esc(r.tag) + "</div>" : "") +
    (r.body || []).map(p => '<p class="m-p">' + esc(p) + "</p>").join("") +
    ((r.feats && r.feats.length) ? '<div class="m-feats-label">核心能力</div><ul class="m-feats">' +
      r.feats.map(f => "<li>" + esc(f) + "</li>").join("") + "</ul>" : "") +
    (r.fit ? '<div class="m-fit"><b>适合</b>' + esc(r.fit) + "</div>" : "");
  mEn.textContent = r.desc;
  mTopics.innerHTML = (r.topics || []).map(t => '<span class="m-topic">#' + esc(t) + "</span>").join("");
  if (mFav) { mFav.dataset.fav = r.full_name; paintFavBtn(mFav); }
  loadReadme(r.full_name, ++readmeToken);
  overlay.classList.add("open");
  document.body.classList.add("locked");
  overlay.scrollTop = 0;
}
function closeRepo() {
  if (!overlay) return;
  overlay.classList.remove("open");
  document.body.classList.remove("locked");
  readmeToken++;
}
if (overlay) {
  const btnClose = document.getElementById("mClose");
  if (btnClose) btnClose.addEventListener("click", closeRepo);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeRepo(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeRepo(); });
}

/* ================= 一句话部署 =================
   网站本身不跑任何命令。这里把「这个项目是谁、怎么找到它、要 AI 做什么」
   打包成一段自包含的话，访客复制后粘给自己的 AI（WorkBuddy / Claude / Cursor
   等），由那个 AI 读仓库 README 并决定具体部署方式。这样编号不再依赖本机索引。 */
function deployPrompt(r) {
  if (!r) return "";
  const cm = catMeta(r.catId);
  const code = r.code || cm.code;
  const id = code + "-" + pad2(r.rank);
  const topics = (r.topics || []).slice(0, 6).join(", ");
  return [
    "帮我在本机部署这个 GitHub 项目：",
    "仓库：" + r.full_name + "  " + r.url,
    "榜单编号：" + id + "（" + (cm.name || "") + " · 第 " + r.rank + " 个 · ★" + fmtK(r.stars) + "）",
    "它是做什么的：" + (r.tag || r.desc || "开源项目"),
    "官方简介：" + (r.desc || "—"),
    "技术栈：" + (r.lang || "未知") + (topics ? " · " + topics : ""),
    "",
    "请按这个顺序做：",
    "1. 先读这个仓库的 README 和安装文档，确认它到底用什么方式运行（Docker / npm / pip / go / cargo / 静态站点等），不要凭语言猜。",
    "2. 列出我机器上缺哪些依赖、目标端口有没有被占；需要装东西或改配置先告诉我。",
    "3. 用最稳妥的方式部署，尽量隔离环境（优先 Docker 或虚拟环境），不要污染全局环境。",
    "4. 跑起来后给我：访问地址、启动 / 停止命令、数据存在哪、以及怎么卸载。",
    "",
    "遇到需要 Token / API Key、要拉大镜像、要联网下载大量文件或要改系统配置，先问我再动手；任何一步失败就停下来说明原因，别硬来。"
  ].join("\n");
}

/* 轻提示：不复用 fav.js 里的同名函数，避免加载顺序互相覆盖 */
let flashTimer = null;
function flash(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:-2000px;left:0;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try { ta.setSelectionRange(0, text.length); } catch (e) { /* 某些浏览器不支持 */ }
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

/* 复制彻底失败时，把话摊开让人手动全选，不给「假成功」 */
function showDeployPanel(text) {
  let box = document.getElementById("deployPanel");
  if (!box) {
    box = document.createElement("div");
    box.id = "deployPanel";
    box.className = "deploy-panel";
    box.innerHTML =
      '<div class="dp-head"><b>手动复制下面这段话</b>' +
      '<button type="button" class="dp-close" aria-label="关闭">✕</button></div>' +
      '<textarea id="dpText" spellcheck="false"></textarea>' +
      '<div class="dp-tip">点一下文本框，按 ⌘A（Windows 用 Ctrl+A）全选，再复制。</div>';
    document.body.appendChild(box);
    box.querySelector(".dp-close").addEventListener("click", () => { box.style.display = "none"; });
  }
  box.style.display = "block";
  const ta = document.getElementById("dpText");
  ta.value = text;
  ta.focus();
  ta.select();
}

function copyDeployPrompt() {
  if (!currentRepo) return;
  const text = deployPrompt(currentRepo);
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => flash("已复制部署指令，粘给你自己的 AI 就行"))
      .catch(() => { if (!legacyCopy(text)) showDeployPanel(text); });
  } else if (!legacyCopy(text)) {
    showDeployPanel(text);
  }
}
if (mDeploy) mDeploy.addEventListener("click", e => {
  e.preventDefault();
  e.stopPropagation();
  copyDeployPrompt();
});
