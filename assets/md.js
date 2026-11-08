/* ------------------------------------------------------------------
 * md.js — 轻量 Markdown 渲染器 + README 摘要提炼（零依赖）
 * 浏览器挂到 window.MD；Node 下 module.exports，便于离线测试
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var API = factory();
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MD = API;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CJK = /[\u2e80-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function stripTags(s) { return String(s).replace(/<[^>]*>/g, ''); }
  function isCJK(ch) { return !!ch && CJK.test(ch); }

  /* ---------------- 1. 预处理：把 HTML 风格 README 归一化成 Markdown ---------------- */

  var LANG_NAMES = /(english|中文|简体中文|正體中文|繁體中文|日本語|日本语|한국어|deutsch|français|francais|español|espanol|italiano|português|portugues|русский|українська|polski|nederlands|svenska|türkçe|turkce|tiếng việt|ภาษาไทย|العربية|עברית|bahasa indonesia|malayalam|മലയാളം|bengali|हिन्दी|हिंदी)/gi;

  function prep(src) {
    var s = String(src || '')
      .replace(/\r\n?/g, '\n')
      .replace(/^\uFEFF/, '');

    s = s.replace(/<!--[\s\S]*?-->/g, '');                       // HTML 注释
    s = s.replace(/^---\n[\s\S]{0,600}?\n---\n/, '');            // YAML front matter
    s = s.replace(/<details[\s\S]*?<\/details>/gi, '\n');        // 折叠块（目录/语言切换/FAQ）
    s = s.replace(/<\/?(picture|source|video|audio|iframe)[^>]*>/gi, '');

    // 块级 HTML → Markdown
    s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, function (m, lv, t) {
      return '\n' + new Array(+lv + 1).join('#') + ' ' + stripTags(t).replace(/\s+/g, ' ').trim() + '\n';
    });
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<a\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, function (m, href, txt) {
      var t = stripTags(txt).replace(/\s+/g, ' ').trim();
      return t ? '[' + t.replace(/\]/g, '') + '](' + href + ')' : '';
    });
    s = s.replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**');
    s = s.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '*$2*');
    s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
    s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');
    s = s.replace(/<\/p>|<p[^>]*>/gi, '\n\n');
    s = s.replace(/<hr[^>]*>/gi, '\n\n---\n\n');
    s = s.replace(/<img[^>]*>/gi, '');                           // 图片一律丢弃（徽章是噪音，截图走外链太慢）
    s = s.replace(/<\/?(div|span|center|summary|table|thead|tbody|tfoot|tr|td|th|ul|ol|dl|dt|dd|section|article|header|footer|main|aside|nav|font|sup|sub|mark|kbd|small|big|figure|figcaption|blockquote|pre)[^>]*>/gi, '');

    // 行内图片 / 空链接 / 徽章残渣
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    s = s.replace(/\[\s*\]\([^)]*\)/g, '');

    // 目录块（连续 >=3 行纯锚点链接）整块删除
    var lines = s.split('\n');
    var out = [], run = [];
    var isToc = function (l) { return /^\s*[-*+]?\s*\[[^\]]{1,60}\]\(#[^)]*\)\s*$/.test(l); };
    var flush = function () {
      if (run.length && run.length >= 3) { out.push(''); }
      else { out.push.apply(out, run); }
      run = [];
    };
    for (var i = 0; i < lines.length; i++) {
      if (isToc(lines[i])) run.push(lines[i]);
      else { if (run.length) flush(); out.push(lines[i]); }
    }
    if (run.length) flush();
    s = out.join('\n');

    // 参考式链接定义：[id]: https://... （正文里只留引用，定义单独存）
    var refs = {};
    s = s.replace(/^ {0,3}\[([^\]\n]{1,80})\]:\s*<?([^\s>]+)>?(?:\s+["'(][^\n]*)?$/gm, function (m, id, url) {
      var key = id.trim().toLowerCase();
      if (!refs[key]) refs[key] = url.trim();
      return '';
    });

    // 导航行 / 语言切换行过滤（段落级在 parse 里做，这里只处理明显的链接串）
    s = s.split('\n').filter(function (l) { return !isNavLine(l); }).join('\n');

    // 清理空行堆积与行尾空白
    s = s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trim();
    return { text: s, refs: refs };
  }

  function isNavLine(l) {
    if (!l.trim()) return false;
    if (/^\s{0,3}([-*+]|\d{1,2}[.)])\s/.test(l)) return false;   // 列表项保留
    if (l.indexOf('|') >= 0 && !/\]\(/.test(l)) return false;      // 表格行保留（无链接）
    if (/^\s{0,3}#{1,6}\s/.test(l)) return false;                 // 标题保留
    return isNavText(l);
  }

  // 整段都是链接/语言项 → 导航条，丢弃
  function isNavText(t) {
    var links = t.match(/!?\[[^\]]*\]\([^)]*\)/g) || [];
    if (!links.length) {
      return t.length < 80 && (t.match(/[·•|]/g) || []).length >= 2 && !/[.!?。！？]/.test(t);
    }
    var rest = t.replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
                .replace(/[\[\]()<>·|/\\–—•*_,.;:+\-]+/g, ' ')
                .trim();
    var langs = t.match(LANG_NAMES) || [];
    if (links.length >= 2 && rest.length < 14) return true;
    if (links.length === 1 && rest.length < 4 && t.length < 100) return true;   // 单一 CTA 按钮
    if (langs.length >= 3 && links.length >= 2 && rest.length < 40) return true;
    if (links.length >= 2 && rest.length < 60 && !/[.!?。！？]/.test(rest) && rest.split(/\s+/).filter(Boolean).length <= 6) return true;
    return false;
  }

  /* ---------------- 2. 块级解析 ---------------- */

  var RE_FENCE = /^\s{0,3}(```+|~~~+)\s*([\w+#.\-]*)/;
  var RE_HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  var RE_HR = /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;
  var RE_UL = /^([ \t]*)([-*+])\s+(.*)$/;
  var RE_OL = /^([ \t]*)(\d{1,2})[.)]\s+(.*)$/;
  var RE_QUOTE = /^\s{0,3}>\s?/;
  var RE_TSEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/;

  function splitRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return s.split('|').map(function (c) { return c.trim().replace(/\\\|/g, '|'); });
  }

  function joinLines(arr) {
    var s = '';
    for (var i = 0; i < arr.length; i++) {
      if (!i) { s = arr[i]; continue; }
      var prev = s.charAt(s.length - 1), next = arr[i].charAt(0);
      s += (isCJK(prev) || isCJK(next) ? '' : ' ') + arr[i];
    }
    return s;
  }

  function blockStart(lines, i) {
    var l = lines[i];
    if (!l.trim()) return true;
    if (RE_FENCE.test(l) || RE_HEAD.test(l) || RE_HR.test(l) || RE_QUOTE.test(l)) return true;
    if (RE_UL.test(l) || RE_OL.test(l)) return true;
    if (l.indexOf('|') >= 0 && lines[i + 1] && RE_TSEP.test(lines[i + 1])) return true;
    return false;
  }

  function parse(md) {
    var lines = md.split('\n'), out = [], i = 0, n = lines.length, m;
    while (i < n) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }

      // 围栏代码
      if ((m = line.match(RE_FENCE))) {
        var mark = m[1].charAt(0) === '`' ? '```' : '~~~';
        var lang = (m[2] || '').toLowerCase(), buf = [];
        i++;
        while (i < n && lines[i].indexOf(mark) !== 0 && !new RegExp('^\\s{0,3}' + mark).test(lines[i])) {
          buf.push(lines[i]); i++;
        }
        if (i < n) i++;
        out.push({ type: 'code', lang: lang, text: buf.join('\n') });
        continue;
      }

      // 标题
      if ((m = line.match(RE_HEAD))) {
        out.push({ type: 'heading', level: m[1].length, text: m[2].trim() });
        i++; continue;
      }

      // 分隔线
      if (RE_HR.test(line)) { out.push({ type: 'hr' }); i++; continue; }

      // 表格
      if (line.indexOf('|') >= 0 && lines[i + 1] && RE_TSEP.test(lines[i + 1])) {
        var head = splitRow(line), rows = [];
        i += 2;
        while (i < n && lines[i].trim() && lines[i].indexOf('|') >= 0) {
          rows.push(splitRow(lines[i])); i++;
        }
        out.push({ type: 'table', head: head, rows: rows });
        continue;
      }

      // 引用
      if (RE_QUOTE.test(line)) {
        var q = [];
        while (i < n && RE_QUOTE.test(lines[i])) { q.push(lines[i].replace(RE_QUOTE, '')); i++; }
        out.push({ type: 'quote', text: q.join(' ') });
        continue;
      }

      // 列表
      if (RE_UL.test(line) || RE_OL.test(line)) {
        var ordered = !RE_UL.test(line), items = [], base = null;
        while (i < n && (RE_UL.test(lines[i]) || RE_OL.test(lines[i]))) {
          var lm = lines[i].match(RE_UL);
          var om = lm ? null : lines[i].match(RE_OL);
          var indent = (lm ? lm[1] : om[1]).replace(/\t/g, '    ').length;
          var text = lm ? lm[3] : om[3];
          if (base === null) base = indent;
          var lvl = Math.min(2, Math.max(0, Math.round((indent - base) / 2)));
          var checked = null;
          var cm = text.match(/^\[([ xX])\]\s+(.*)$/);
          if (cm) { checked = cm[1].toLowerCase() === 'x'; text = cm[2]; }
          items.push({ level: lvl, text: text, checked: checked });
          i++;
          while (i < n && lines[i].trim() && !RE_UL.test(lines[i]) && !RE_OL.test(lines[i]) &&
                 !RE_HEAD.test(lines[i]) && !RE_FENCE.test(lines[i]) && /^\s{2,}/.test(lines[i])) {
            items[items.length - 1].text += ' ' + lines[i].trim();
            i++;
          }
        }
        var pureLinks = items.length >= 3 && items.every(function (it) {
          return /^\[[^\]]+\]\([^)]*\)$/.test(it.text.trim());
        });
        if (!pureLinks) out.push({ type: 'list', ordered: ordered, items: items });
        continue;
      }

      // 段落
      var para = [line.trim()];
      i++;
      while (i < n && !blockStart(lines, i)) { para.push(lines[i].trim()); i++; }
      var ptext = joinLines(para);
      if (isNavText(ptext)) continue;                            // 合并后才成形的导航条
      out.push({ type: 'para', text: ptext });
    }
    return out;
  }

  /* ---------------- 3. 行内渲染 ---------------- */

  function resolveUrl(url, ctx) {
    var u = String(url || '').trim().replace(/^<|>$/g, '');
    if (!u) return '';
    if (/^(https?:|mailto:|#|\/\/)/i.test(u)) return u;
    u = u.replace(/^\.\//, '').replace(/^\//, '');
    var base = 'https://github.com/' + (ctx.full || '') + '/blob/' + (ctx.branch || 'main') + '/';
    return base + u.replace(/^\.\.\//, '');
  }

  function inline(text, ctx) {
    var s = String(text == null ? '' : text);
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function (m, c) {
      codes.push(c);
      return '\u0001C' + (codes.length - 1) + '\u0001';
    });

    s = esc(s);
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

    // 参考式链接 [text][id] 与快捷引用 [id]
    s = s.replace(/\[([^\]]{0,200})\]\[([^\]]{0,80})\]/g, function (m, label, id) {
      var u = ctx.refs && ctx.refs[(id || label).trim().toLowerCase()];
      if (!u) return label;
      return '<a href="' + esc(resolveUrl(u, ctx)) + '" target="_blank" rel="noopener nofollow">' + label + '</a>';
    });
    s = s.replace(/\[([^\]\n]{1,80})\](?!\()/g, function (m, id) {
      var u = ctx.refs && ctx.refs[id.trim().toLowerCase()];
      return u ? '<a href="' + esc(resolveUrl(u, ctx)) + '" target="_blank" rel="noopener nofollow">' + id + '</a>' : m;
    });

    // 链接
    s = s.replace(/\[([^\]]{0,200})\]\(\s*([^)\s]{1,400})(?:\s+&quot;[^&]*&quot;)?\s*\)/g, function (m, label, url) {
      var href = resolveUrl(url, ctx);
      if (!href) return label;
      return '<a href="' + esc(href) + '" target="_blank" rel="noopener nofollow">' + label + '</a>';
    });

    // <autolink>
    s = s.replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]+)&gt;/g, function (m, u) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener nofollow">' + u.replace(/^mailto:/, '') + '</a>';
    });

    // 强调
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[\s(（])\*([^*\n]+)\*(?=[\s)）,.!?;:，。！？；：]|$)/g, '$1<em>$2</em>');

    // 还原行内代码
    s = s.replace(/\u0001C(\d+)\u0001/g, function (m, idx) {
      return '<code>' + esc(codes[+idx]) + '</code>';
    });
    return s;
  }

  /* ---------------- 4. 块级渲染 ---------------- */

  function renderList(b, ctx) {
    var open = b.ordered ? '<ol>' : '<ul>', close = b.ordered ? '</ol>' : '</ul>';
    var html = '', depth = 0;
    b.items.forEach(function (it) {
      while (depth < it.level) { html += b.ordered ? '<ol>' : '<ul>'; depth++; }
      while (depth > it.level) { html += close; depth--; }
      var box = '';
      if (it.checked === true) box = '<span class="cb on"></span>';
      else if (it.checked === false) box = '<span class="cb"></span>';
      html += '<li' + (it.checked !== null ? ' class="task"' : '') + '>' + box + inline(it.text, ctx) + '</li>';
    });
    while (depth >= 0) { if (depth === 0) break; html += close; depth--; }
    return open + html + close;
  }

  function renderTable(b, ctx) {
    var h = '<div class="md-table"><table><thead><tr>';
    b.head.forEach(function (c) { h += '<th>' + inline(c, ctx) + '</th>'; });
    h += '</tr></thead><tbody>';
    b.rows.forEach(function (row) {
      h += '<tr>';
      for (var c = 0; c < b.head.length; c++) h += '<td>' + inline(row[c] || '', ctx) + '</td>';
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  function toHtml(blocks, ctx) {
    var h = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === 'heading') {
        var lv = Math.min(Math.max(b.level, 2), 5);
        h.push('<h' + lv + '>' + inline(b.text, ctx) + '</h' + lv + '>');
      } else if (b.type === 'para') {
        h.push('<p>' + inline(b.text, ctx) + '</p>');
      } else if (b.type === 'code') {
        h.push('<pre' + (b.lang ? ' data-lang="' + esc(b.lang) + '"' : '') + '><code>' + esc(b.text) + '</code></pre>');
      } else if (b.type === 'quote') {
        h.push('<blockquote>' + inline(b.text, ctx) + '</blockquote>');
      } else if (b.type === 'hr') {
        h.push('<hr>');
      } else if (b.type === 'list') {
        h.push(renderList(b, ctx));
      } else if (b.type === 'table') {
        h.push(renderTable(b, ctx));
      }
    }
    return h.join('\n');
  }

  /* ---------------- 5. 摘要提炼 ---------------- */

  // 到了这些章节说明「介绍」部分结束了
  var STOP = /^(table of contents?|contents?|目录|安装|安装指南|install(ation)?|how to|quick ?start|getting started|使用|使用方法|用法|快速开始|快速上手|快速入门|documentation|docs?|文档|配置|configuration|setup|deploy(ment)?|部署|api( reference)?|license|licen[cs]e|许可|许可证|开源协议|contribut\w*|贡献|acknowledg\w*|致谢|sponsor\w*|赞助|star history|changelog|更新日志|release notes|faq|常见问题|roadmap|development|develop|开发|build|构建|credits|related|相关|disclaimer|免责声明|screenshots?|截图|demo|预览)/i;

  // 纯导航性质的标题，直接丢弃
  var NAV_HEAD = /^(external links?|links?|link list|badges?|navigation|menu|languages?|语言|目录|table of contents?|contents?|community|社区|social|关注我们|backers?|sponsors?)$/i;

  function textLen(b) {
    if (b.type === 'list') return b.items.reduce(function (a, i) { return a + i.text.length; }, 0);
    return (b.text || '').length;
  }

  function isNoise(b) {
    if (b.type === 'hr' || b.type === 'code' || b.type === 'table') return true;
    if (b.type === 'quote') return true;
    var t = (b.text || '').trim();
    if (t.length < 2) return true;
    if (/^[\s\-–—|·•*]+$/.test(t)) return true;
    if (/(free credits?|become a sponsor|buy me a coffee|ko-fi\.com|patreon\.com|open collective|sponsors? us)/i.test(t)) return true;
    if (/^(loved|trusted|used|chosen|adopted) by\b/i.test(t) && t.length < 100) return true;
    if (/^(access|see|read|check|visit|click|try|view|explore|find|learn)\b[\s\S]{0,120}\b(here|demo|docs?|documentation|more|website|details?)\b/i.test(t) && t.length < 140) return true;
    if (/^(english|中文|简体中文|繁體中文|日本語|한국어|english\s*\|.*)$/i.test(t)) return true;
    if (/^(english|中文|简体中文|繁體中文|日本語|한국어)(\s*[|/·]\s*(english|中文|简体中文|繁體中文|日本語|한국어))+$/i.test(t)) return true;
    return false;
  }

  // 后面紧跟另一个标题（或直接结束）的标题 = 空章节
  function isEmptyHeading(blocks, i) {
    for (var j = i + 1; j < blocks.length; j++) {
      if (blocks[j].type === 'heading') return true;
      if (isNoise(blocks[j])) continue;
      return false;
    }
    return true;
  }

  // 属于「介绍区」的章节名，可以继续读下去
  var ALLOW_HEAD = /^(overview|about|introduction|intro|what'?s? (this|inside|new)|what is|features?|highlights?|key features|core features|main features|why\b|capabilities|简介|概述|介绍|项目简介|核心特性|主要特性|功能特性|特性|功能|亮点|优势|为什么)/i;

  function buildSummary(blocks, budget) {
    var picked = [], chars = 0, started = false, contentBlocks = 0;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === 'heading') {
        if (NAV_HEAD.test(b.text.trim())) continue;
        if (isEmptyHeading(blocks, i)) continue;
        if (b.level === 1 && !started && !contentBlocks) continue;   // 标题与弹窗头部重复
        if (STOP.test(b.text.trim())) break;
        if (contentBlocks && !ALLOW_HEAD.test(b.text.trim())) break; // 介绍区结束
        if (chars >= 600) break;
        picked.push(b);
        continue;
      }
      if (isNoise(b)) continue;
      if (b.type === 'para' && b.text.length < 90 &&
          /^(npx|npm|pnpm|yarn|pip3?|docker|brew|git|curl|wget|cargo|go|apt|sudo|make|chmod|export)\b/i.test(b.text.replace(/`/g, ''))) continue;  // 命令行
      if (!started) started = true;
      var len = textLen(b);
      if (chars + len > budget) {
        if (b.type === 'list' && b.items && chars < budget * 0.85) {
          var fit = [], acc = 0;
          for (var j = 0; j < b.items.length; j++) {
            var it = b.items[j];
            if (acc + it.text.length > budget - chars && fit.length >= 2) break;
            fit.push(it); acc += it.text.length;
          }
          if (fit.length >= 2) { picked.push({ type: 'list', ordered: b.ordered, items: fit }); chars += acc; contentBlocks++; }
        }
        if (chars > budget * 0.5) break;
      }
      picked.push(b);
      chars += len;
      contentBlocks++;
      if (chars >= budget) break;
    }
    while (picked.length && (picked[picked.length - 1].type === 'heading' || isNoise(picked[picked.length - 1]))) picked.pop();
    var tail = picked[picked.length - 1];
    if (tail && tail.type === 'para' && /[:：]\s*$/.test(tail.text)) {
      var m2 = tail.text.match(/^([\s\S]*[.!?。！？])\s+[^.!?。！？]{0,160}[:：]\s*$/);
      if (m2 && m2[1].length >= 60) picked[picked.length - 1] = { type: 'para', text: m2[1] };
      else picked.pop();                                        // 只留一句「下面列出了…」没有意义
    }
    while (picked.length && (picked[picked.length - 1].type === 'heading' || isNoise(picked[picked.length - 1]))) picked.pop();
    if (!picked.length) {
      // 兜底：取前两段有实际文字的内容
      for (var k = 0; k < blocks.length && picked.length < 2; k++) {
        if (blocks[k].type === 'para' && blocks[k].text.length > 30) picked.push(blocks[k]);
      }
    }
    return picked;
  }

  /* ---------------- 6. 对外接口 ---------------- */

  function render(src, opts) {
    opts = opts || {};
    var p = prep(src);
    var blocks = parse(p.text);
    var ctx = { full: opts.full || '', branch: opts.branch || 'main', refs: p.refs || {} };
    var budget = opts.budget || 700;
    var cjk = (p.text.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjk / Math.max(1, p.text.length) > 0.22) budget = Math.round(budget * 0.55);  // 中文信息密度更高
    var sum = buildSummary(blocks, budget);
    var summaryHtml = toHtml(sum, ctx);
    var fullHtml = toHtml(blocks, ctx);
    var chars = 0;
    blocks.forEach(function (b) { chars += textLen(b); });
    var sumChars = 0;
    sum.forEach(function (b) { sumChars += textLen(b); });
    var hasProse = sum.some(function (b) {
      if (b.type === 'para') return b.text.length >= 120;
      if (b.type === 'list') return b.items.length >= 2 && b.items.some(function (i) { return i.text.length >= 40; });
      return false;
    });
    return {
      summary: summaryHtml,
      full: fullHtml,
      chars: chars,
      summaryChars: sumChars,
      hasMore: chars > sumChars * 1.15 && blocks.length > sum.length,
      thin: !hasProse && sumChars < 150,
      blockCount: blocks.length
    };
  }

  return {
    render: render,
    prep: prep,
    parse: parse,
    inline: inline,
    toHtml: toHtml,
    esc: esc
  };
});
