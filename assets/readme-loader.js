/* ---------- README: 多源并行竞速 + 自动摘要 / 完整全文 ---------- */
const readmeCache = new Map();
const README_TIMEOUT = 6000;

function readmeUrls(full, stage) {
  const out = [];
  const branches = ["main", "master"];
  if (stage === 1) {
    branches.forEach(b => {
      out.push({ u: "https://ghfast.top/https://raw.githubusercontent.com/" + full + "/" + b + "/README.md", b: b });
      out.push({ u: "https://gcore.jsdelivr.net/gh/" + full + "@" + b + "/README.md", b: b });
      out.push({ u: "https://raw.githubusercontent.com/" + full + "/" + b + "/README.md", b: b });
    });
  } else {
    branches.forEach(b => {
      out.push({ u: "https://ghfast.top/https://raw.githubusercontent.com/" + full + "/" + b + "/readme.md", b: b });
      out.push({ u: "https://gcore.jsdelivr.net/gh/" + full + "@" + b + "/readme.md", b: b });
    });
    out.push({ u: "https://ghfast.top/https://raw.githubusercontent.com/" + full + "/HEAD/README.md", b: "HEAD" });
  }
  return out;
}

/* 镜像站偶尔会甩一个 403/限流 HTML 页回来，不能当成 README */
function looksLikeErrorPage(txt) {
  const head = txt.slice(0, 400).toLowerCase();
  return head.indexOf("<!doctype html") >= 0 || head.indexOf("<html") >= 0 ||
         /^\s*(403|404|429|500)\s+forbidden/.test(head) || head.indexOf("rate limit") >= 0;
}

function fetchText(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms || README_TIMEOUT);
  return fetch(url, { signal: ac.signal, cache: "force-cache" })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(t => { if (!t || t.length < 50 || looksLikeErrorPage(t)) throw new Error("bad body"); return t; })
    .finally(() => clearTimeout(timer));
}

function raceStage(full, stage, ms) {
  const list = readmeUrls(full, stage);
  return new Promise((resolve, reject) => {
    let left = list.length, done = false;
    list.forEach(it => {
      fetchText(it.u, ms).then(txt => {
        if (!done) { done = true; resolve({ txt: txt, branch: it.b }); }
      }).catch(() => { if (--left === 0 && !done) reject(new Error("stage fail")); });
    });
  });
}

async function raceReadme(full, ms) {
  try { return await raceStage(full, 1, ms); }
  catch (e) { return await raceStage(full, 2, 4000); }
}

function paintReadme(full, doc, expanded) {
  const meta = doc.chars >= 1000 ? (doc.chars / 1000).toFixed(1) + "k" : String(doc.chars);
  let body;
  if (expanded) {
    body = '<div class="rm-scroll"><div class="md">' + doc.full + "</div></div>";
  } else if (doc.thin || !doc.summary) {
    body = '<div class="rm-empty">这个仓库的 README 以表格、截图和外链为主，能自动提炼的正文很少。展开完整 README 可以看到它的完整排版。</div>';
  } else {
    body = '<div class="md">' + doc.summary + "</div>";
  }
  const canExpand = doc.hasMore || expanded;
  mReadmeBox.innerHTML =
    '<div class="rm-head"><span class="rm-chip">' + (expanded ? "完整 README" : "自动摘要") + "</span>" +
      '<span class="rm-meta">全文约 ' + meta + " 字</span></div>" +
    body +
    '<div class="rm-actions">' +
      (canExpand ? '<button class="rm-btn" data-act="' + (expanded ? "collapse" : "expand") + '">' +
        (expanded ? "收起 ↑" : "展开完整 README ↓") + "</button>" : "") +
      '<a class="rm-btn ghost" href="https://github.com/' + full + '#readme" target="_blank" rel="noopener">去 GitHub 阅读 ↗</a>' +
    "</div>";
  const btn = mReadmeBox.querySelector("[data-act]");
  if (btn) btn.onclick = () => paintReadme(full, doc, btn.getAttribute("data-act") === "expand");
}

async function loadReadme(full, token) {
  const cached = readmeCache.get(full);
  if (cached) {
    if (token === readmeToken) paintReadme(full, cached, false);
    return;
  }
  mReadmeBox.innerHTML = '<div class="m-readme-loading"><span class="spin"></span>正在加载 README…</div>';
  try {
    const got = await raceReadme(full, README_TIMEOUT);
    if (token !== readmeToken) return;
    const doc = MD.render(got.txt, { full: full, branch: got.branch });
    readmeCache.set(full, doc);
    paintReadme(full, doc, false);
  } catch (e) {
    if (token !== readmeToken) return;
    mReadmeBox.innerHTML = '<div class="m-readme-err">README 加载失败（网络受限或仓库没有 README）。' +
      '<button class="rm-retry" id="rmRetry">重试</button>' +
      ' <a class="rm-gh" href="https://github.com/' + full + '" target="_blank" rel="noopener">去 GitHub 看 →</a></div>';
    const b = document.getElementById("rmRetry");
    if (b) b.onclick = () => { readmeCache.delete(full); loadReadme(full, ++readmeToken); };
  }
}

/* 悬停预取：停 120ms 就开始后台拉取，点开时秒开（hoverTimer 在 core.js 里声明） */
function prefetchReadme(full) {
  if (readmeCache.has(full)) return;
  raceReadme(full, 7000).then(got => {
    if (!readmeCache.has(full)) readmeCache.set(full, MD.render(got.txt, { full: full, branch: got.branch }));
  }).catch(() => {});
}
