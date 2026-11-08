/* ================= 分类页：卡片 / 列表 + 搜索 ================= */
const cat = PAGE.cat;
const repos = REPOS;
setRepos(repos);
let view = "grid";

function paintGrid(box) {
  box.innerHTML = '<div class="grid">' + repos.map(r => cardHTML(r)).join("") + "</div>";
  bindCards(box);
}

function paintRows(box) {
  let html = '<div class="rows"><div class="rhead">' +
    "<span>编号</span><span>项目</span><span>一句话介绍</span>" +
    '<span style="text-align:right">Stars</span><span style="text-align:right">语言</span><span class="rh-fav">☆</span></div>';
  repos.forEach(r => {
    html += '<div class="row ' + (r.rank <= 3 ? "top3" : "") + '" data-full="' + esc(r.full_name) +
      '" data-search="' + esc(searchText(r)) + '">' +
      '<span class="rn"><i style="background:' + cat.grad + '"></i>' + pad2(r.rank) + "</span>" +
      '<span class="rname" title="' + esc(r.full_name) + '">' + esc(r.full_name) + "</span>" +
      '<span class="rtag">' + esc(r.tag) + "</span>" +
      '<span class="rstars">★ ' + fmtK(r.stars) + "</span>" +
      '<span class="rlang"><i style="background:' + r.langColor + '"></i>' + esc(r.lang || "—") + "</span>" +
      '<button class="favbtn rowfav" data-fav="' + esc(r.full_name) + '" aria-label="收藏"></button>' +
      "</div>";
  });
  html += "</div>";
  box.innerHTML = html;
  bindCards(box);
}

function render() {
  const box = document.getElementById("listwrap");
  if (view === "grid") paintGrid(box); else paintRows(box);
  syncFavUI();
  applyFilter();
}

/* ---------- 搜索 ---------- */
const q = document.getElementById("q"), empty = document.getElementById("empty");
function applyFilter() {
  const kw = q.value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll("#listwrap [data-search]").forEach(el => {
    const hit = !kw || el.dataset.search.indexOf(kw) >= 0;
    el.style.display = hit ? "" : "none";
    if (hit) shown++;
  });
  empty.style.display = shown ? "none" : "block";
}
q.addEventListener("input", applyFilter);

/* ---------- 视图切换 ---------- */
document.querySelectorAll(".viewtog button").forEach(b => {
  b.addEventListener("click", () => {
    if (b.dataset.v === view) return;
    view = b.dataset.v;
    document.querySelectorAll(".viewtog button").forEach(x => x.classList.toggle("on", x.dataset.v === view));
    render();
  });
});

/* 首屏渲染 */
render();
