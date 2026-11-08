/* 抓取全部仓库 README，提取摘要纯文本，产出 data/summaries_en.json */
const fs = require('fs');
const path = require('path');
const MD = require('./assets/md.js');

const curated = JSON.parse(fs.readFileSync('data/curated.json', 'utf8'));
const repos = [];
for (const k in curated) {
  for (const r of curated[k]) repos.push({ full: r.full_name, cat: r.cat, name: r.name, desc: r.desc, zh: r.zh });
}

const CACHE = 'data/readme_cache';
fs.mkdirSync(CACHE, { recursive: true });

function cachePath(full) { return path.join(CACHE, full.replace('/', '__') + '.md'); }

async function fetchOne(full) {
  const cp = cachePath(full);
  if (fs.existsSync(cp)) {
    const t = fs.readFileSync(cp, 'utf8');
    if (t && t.length > 80) return t;
  }
  const branches = ['main', 'master'];
  for (const b of branches) {
    for (const u of [
      `https://ghfast.top/https://raw.githubusercontent.com/${full}/${b}/README.md`,
      `https://gcore.jsdelivr.net/gh/${full}@${b}/README.md`,
    ]) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 15000);
        const res = await fetch(u, { signal: ac.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const txt = await res.text();
        const head = txt.slice(0, 300).toLowerCase();
        if (!txt || txt.length < 80) continue;
        if (head.includes('<!doctype html') || head.includes('<html')) continue;
        fs.writeFileSync(cp, txt, 'utf8');
        return txt;
      } catch (e) { /* next */ }
    }
  }
  return null;
}

function plain(html) {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|tr|pre)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function run() {
  const out = [];
  const queue = repos.slice();
  let done = 0;

  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      const txt = await fetchOne(r.full);
      done++;
      if (!txt) { console.log(`✗ ${done}/${repos.length} ${r.full} 拉取失败`); continue; }
      const out2 = MD.render(txt, { full: r.full, branch: 'main' });
      out.push({
        full: r.full, cat: r.cat, name: r.name,
        summary: plain(out2.summary),
        chars: out2.chars,
        thin: out2.thin,
        ok: true,
      });
      if (done % 20 === 0) console.log(`… ${done}/${repos.length}`);
    }
  }

  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  out.sort((a, b) => a.full.localeCompare(b.full));
  fs.writeFileSync('data/summaries_en.json', JSON.stringify(out, null, 1), 'utf8');
  const missing = repos.length - out.length;
  const avg = Math.round(out.reduce((a, b) => a + b.summary.length, 0) / out.length);
  console.log(`完成：${out.length}/${repos.length}（失败 ${missing}），平均摘要 ${avg} 字符`);
}

run();
