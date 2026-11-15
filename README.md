# gh-awesome

GitHub 高星开源项目精选站：181 个项目、6 个分类，纯静态页面，点开即用。

**不刷榜单、不追热点**——只挑那些「值得收藏、大概率会真的用上」的项目，每个分类按 Star 降序编号，方便口头指代（「AI 页第 12 个」）。

在线访问：<https://hello18362.github.io/gh-awesome/>

## 分类

| 分类 | 页面 | 数量 |
| --- | --- | --- |
| AI 工具 | `ai.html` | 79 |
| 效率办公 | `productivity.html` | 20 |
| 休闲娱乐 | `fun.html` | 30 |
| 开发者工具 | `devtools.html` | 19 |
| 前端框架 | `frontend.html` | 19 |
| 自托管服务 | `selfhosted.html` | 14 |

## 怎么用

- 首页按分类进入，每张卡片可直接跳到对应 GitHub 仓库。
- 点卡片上的收藏图标，收藏存在浏览器 localStorage，不会上传。
- 分享给他人时带上 `?sharecode=...`，否则页面会提示链接不完整。

## 数据

- 来源：GitHub Search API，抓取于 **2026-11-04**；Star 数为当日快照，会随时间变化。
- 简介由本站整理改写，**著作权归各项目作者**；如权利人认为展示不当，请联系移除。
- Star 数仅用于排序展示，不构成推荐或质量担保。

## 本地预览

```bash
python -m http.server 8000
# 打开 http://localhost:8000/
```

不要直接双击 `index.html`：`file://` 下无法加载 JSON 和分享码校验。

## 重新生成数据

```bash
python fetch_repos.py     # 抓 GitHub Search API
python curate.py          # 筛选与分类
node extract_summaries.js # 提取简介
python build_site.py      # 生成静态页
```

## 许可与免责

本站代码以 [MIT](LICENSE) 许可证开源，版权归 Hello18362 所有。

展示的项目名称、简介、Star 数等数据来自 GitHub 公开 API，抓取时间为 2026-11-04，可能已过时，请以各项目仓库为准。项目简介的著作权归各项目作者所有，本站仅作整理与展示；权利人如认为内容不当，可通过 issue 或邮箱联系，核实后移除。

页面内容不构成任何形式的投资、采购或技术选型建议。

本站按「现状」提供，不附带任何担保。作者不对使用本站内容造成的任何损失负责。