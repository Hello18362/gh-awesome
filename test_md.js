const fs = require('fs');
const path = require('path');
const MD = require('./assets/md.js');

const repos = process.argv.slice(2);
if (!repos.length) {
  console.error('usage: node test_md.js owner/repo[@branch] ...');
  process.exit(1);
}

const sources = (full, b) => [
  `https://ghfast.top/https://raw.githubusercontent.com/${full}/${b}/README.md`,
  `https://gcore.jsdelivr.net/gh/${full}@${b}/README.md`,
];

async function grab(full, branch) {
  for (const b of [branch || 'main', branch ? null : 'master'].filter(Boolean)) {
    for (const u of sources(full, b)) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 12000);
        const res = await fetch(u, { signal: ac.signal });
        clearTimeout(t);
        if (!res.ok) continue;
        const txt = await res.text();
        if (txt && txt.length > 80) return { txt, b };
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

(async () => {
  for (const spec of repos) {
    const [full, br] = spec.split('@');
    const got = await grab(full, br);
    if (!got) { console.log(`\n===== ${full} 拉取失败 =====`); continue; }
    const t0 = Date.now();
    const out = MD.render(got.txt, { full, branch: got.b });
    const dt = Date.now() - t0;
    console.log(`\n===== ${full} (${got.b}) | 原文 ${got.txt.length}字 | ${dt}ms | blocks=${out.blockCount} | 摘要 ${out.summaryChars}字 | hasMore=${out.hasMore} =====`);
    console.log('--- 摘要 ---');
    console.log(plain(out.summary).slice(0, 700));
    // 质量断言
    const bad = [];
    if (/<img/i.test(out.summary)) bad.push('残留<img>');
    if (/!\[/.test(plain(out.summary))) bad.push('残留图片markdown');
    if (/\|\s*-{3,}/.test(plain(out.summary))) bad.push('残留表格分隔行');
    if (/https?:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[a-z]+\/https?:/.test(out.full)) bad.push('链接解析错误');
    if (/<p>\s*<\/p>/.test(out.summary)) bad.push('空段落');
    console.log('--- 检查 ---', bad.length ? '❌ ' + bad.join(', ') : '✅ 通过');
  }
})();
