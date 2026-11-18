# AGENTS.md — Melvor Idle 2 离线 Wiki

本文件写给在 `wiki/` 目录工作的开发者与 AI 代理。动手前通读一遍；规则冲突时以本文件为准，其次是 `README.md`。

## 1. 项目定位

- 面向**真实玩家**的离线维基百科，参照 [Melvor Idle Wiki](https://wiki.melvoridle.com/w/Main_Page) 的站点结构与阅读体验。
- 数据**只**来自本机安装包：`unpacked/Data/Packages/MelvorBase.json`（游戏数据）、`unpacked/Locale/zh_CN.po`（中文翻译）、`unpacked/project.binary`（游戏版本号）。
- 交付物是单个 `index.html` + `assets/` 图片目录，双击即用：不联网、不需要服务器、不启动游戏。
- 不复制初代 Wiki 的正文、DLC 数据或平衡数值；不伪造二代不存在的系统（召唤、城镇等）。
- 不做账户、多人编辑、修订历史、讨论区。
- 不修改游戏安装文件、DLL 或存档；不执行游戏代码。

## 2. 目录与构建

| 文件 | 职责 |
| --- | --- |
| `extract.py` | 从 EXE 内 PCK 解包到 `unpacked/`（只支持未加密 PCK v3/v4） |
| `build.py` | 读数据 / 翻译 / 版本，导出图标到 `assets/`，把 CSS 与 JS 内联进 `template.html`，生成 `index.html` |
| `template.html` | 页面骨架：顶栏、左侧导航、正文、右侧目录、页脚 |
| `style.css` | 全部样式 |
| `app.js` | 数据载入、条目索引、反向引用、搜索、通用字段渲染 `showEntry` |
| `player-format.js` | 把原始数据转成玩家可读文字：`playerRender`、`eventText`、`humanWord` |
| `features.js` | 加成（Boosts）、来源 / 用途索引、表格、技能页、参考表、工具、路由 |
| `wiki-ui.js` | 站点外壳：侧栏、导航框、条目页（信息框 + 导语）、首页、搜索 / 索引 / 链入页 |
| `contents.js` | 右侧“本页目录” |
| `verify.cjs` | 在 Node `vm` 中运行生成页的自动验证，写 `verification-report.json` |

**JS 拼接顺序固定**：`app.js → player-format.js → features.js → wiki-ui.js → contents.js`（见 `build.py`）。所有文件共享一个全局作用域；后面的文件可以用前面的函数，函数声明会提升，但**顶层语句**只能依赖已执行的文件。新增文件必须同时加入 `build.py` 的列表。

每次改动后必须执行：

```powershell
python wiki/build.py
node wiki/verify.cjs   # 退出码必须为 0
```

注意：PowerShell 里不要把 `node` 输出接到 `Select-Object -First N`，那会提前截断进程并造成假的 exit 1；改为重定向到文件后再读。

### 发布（GitHub Pages）

- 仓库 <https://github.com/Leager-zju/MelvorIdle2-WIKI>，`wiki/` 目录即仓库根；GitHub Pages 从 `main` 分支根目录发布，站点 <https://leager-zju.github.io/MelvorIdle2-WIKI/>。
- 提交身份：`Leager <1004729740@qq.com>`（只在本仓库 `git config` 设置，不改全局）。
- 发布的是生成好的 `index.html` + `assets/`，所以**改源码后必须先重建并验证，再一起提交 `index.html`**。
- `.gitignore` 排除 `unpacked/`（游戏解包文件，~500 MB）与 `mechanics-il.txt`（DLL 反汇编）——不得把游戏原始文件或反汇编提交到公开仓库。`.nojekyll` 必须保留。
- 页面内只用相对路径（`assets/...`、`#...`），保证本地双击与 `/MelvorIdle2-WIKI/` 子路径下都能用。

## 3. 代码规范

### 3.1 总体原则

- 最小改动完整解决问题；不加没人要的选项、配置或抽象。优先复用已有帮助函数（见 3.3）。
- 不引入任何依赖、框架、构建工具或 CDN。纯 ES2020+ 浏览器 JS、纯 CSS、Python 标准库。
- 保持现有风格：紧凑单行函数、`const` 优先、模板字符串之外用 `'...'+x+'...'` 拼接 HTML（与现有代码一致）。
- 注释只写代码看不出的“为什么”，一行。已知限制用 `// shortcut: <限制>, <何时升级>`。
- 数据中的怪异情况在**共享代码**里一次性修正（例如占位产出在 `addSource` 里过滤），不要在各页面分别打补丁。

### 3.2 安全与正确性

- **所有**插入 HTML 的文本必须经过 `esc()`；链接用 `link()` / `pageLink()` / `eLink()` 生成。`href` 一律用 `href(key)`（内部 `encodeURIComponent`）。
- `build.py` 把数据 JSON 中的 `<` 转义为 `\u003c`，不要改掉。
- 只从 `unpacked/` 内读取资源路径，`build.py` 已做路径越界检查，保持它。
- CSV 导出经过 `csvValue()` 防公式注入；新增导出路径必须复用它。
- 计算器输入要校验（`xpForLevel` / `dropStats` / `production` 的写法），非法输入抛出带中文说明的 `Error`。
- `localStorage` 访问只走 `storage.get/set`（已包 try/catch，键前缀 `melvor2-wiki-`）。

### 3.3 必须复用的帮助函数

| 需求 | 用这个 |
| --- | --- |
| 中文名 / 翻译 | `tr(text, context)`、`name(obj,type)`、`skillName(id)`、`titleOf(type,id)`、`humanWord(id)` |
| 去掉富文本标记 | `plain()` |
| 数字 / 百分比 / 带符号 | `fmt(n,d)`、`pct(p)`、`signed(n)` |
| 条目链接 | `link(e)`、`eLink(e)`（带图标）、`refLink(id,type)`、`skillLink(id)`、`pageLink(key,text)` |
| 图标 | `icon(e,size)`、`skillIcon(id,size)` —— 没有图就返回空串，不要造替代图 |
| 任意数据值渲染 | `render(value, field)`（即 `playerRender`） |
| 条件 / 要求 | `gateText(e)`、`requirementText(list)` |
| 加成效果文字 | `effectText(m)`、`boostValue(m)` |
| 表格 | `dataTable(headers, rows, id?, cls?)` + `cell(sortValue, html)` |
| 多技能分区 | `skillSections(list, skillOf, renderPart, {tag, other})` |
| 归属技能 | `skillOfEntry(e)`、`skillOfItem(e)`、`entityIds(value)` |
| 来源 / 用途 | `sourcesByItem`、`usesByItem`、`relatedTable(e,'sources'|'uses')` |
| 链入 | `reverse`（`MelvorBase:Id → [{key,path}]`） |

### 3.4 数据与条目键

- 条目键为 `Type/Id`（如 `Item/NormalLog`）；游戏引用为 `MelvorBase:Id`，用 `shortId()` 取 Id。同一 Id 可能对应多种类型，解析时用 `resolve(id, field)` 或指定类型。
- 技能页数据取自 `G.EntityConfig['MelvorBase:<Skill>']`，经 `configEntries(skill, field)` 获取。
- 显示前过滤占位数据：概率为 0 或数量为 0 的产出不算来源；"Coming Soon" 类奖励显示为“即将推出”。
- 不对加成做“最终总和”，只列出条目和生效条件。

### 3.5 路由

- 全部为 hash 路由。条目页 `#Type%2FId`；特殊页 `#@<route>/<arg>`：`@skills` `@skill/<Skill>` `@boosts/<Skill>` `@table/<Type>` `@search/<q>` `@links/<Type/Id>` `@index` `@equipment` `@combat` `@tools` `@guides` `@info` `@favorites` `@random`。
- 新页面：写 `xxxPage()` 渲染到 `$('detail')`，在 `routePage()` 中加分支。`routeWiki()` 之后由 `afterRoute()` 统一处理标题、导航框、侧栏高亮、回到顶部——不要在页面函数里重复做。
- 旧链接必须继续可用（例如 `@table/MasteryGuildBonus` 与 `@table/MasteryGuildRank` 都指向合并页）。

### 3.6 测试（`verify.cjs`）

- 新增逻辑（分支、循环、解析、合并 / 拆分规则）必须在 `verify.cjs` 加断言；断言要具体到真实数据（如 `Item/NormalLog`、`Enemy/Golbin`）。
- 已有的全局约束不得削弱：所有对象可渲染、所有条目页无内部字段、Boosts 只在技能详情页有入口、修饰数量与覆盖、来源链、中英文搜索、经验曲线（99 级 = 13,034,427 XP）、CSV 转义。
- 自动生成的表格 id（`t31` 之类）会变，比较两次渲染时先规整掉。
- 视觉改动另用无头 Edge 截图检查（桌面 1500×1000，窄屏 ≈500 宽），截图放系统临时目录，不要放进 `wiki/`；临时探针 HTML 用完即删。

## 4. 前端设计规范

### 4.1 语言与措辞

- 界面全部简体中文；名称优先用 `zh_CN.po` 翻译，缺失时回退英文原名（例：Expert Runner），不要自行编造译名。
- 条目同时显示中文名与英文名（信息框“英文名”、表格名称下方小字、搜索建议）。
- 写给玩家看：说结果、效果、条件、获取途径。**禁止**出现 JSON、字段名、内部 ID、`MelvorBase:`、`LocalContext` / `FromContext` / `StatsType` / `EntityConfig`、组件配置或“字段路径”。`verify.cjs` 的 `rawContent` 正则会检查。
- 时间用秒（毫秒 /1000），概率用百分比，随等级变化的效果写“每级……”。
- 不下没有依据的结论（如“最优路线”“绝对安全挂机”）；数值是基础配置，需要时注明“以游戏内为准”。

### 4.2 站点外壳（参照 MediaWiki）

- **顶栏**（sticky）：游戏 Logo + “离线 Wiki”、圆角搜索框（输入时下拉 10 条建议，精确名优先，同一技能只出现一次；回车：精确命中直达条目，否则进入 `@search`；`/` 聚焦）、随机条目、收藏。
- **左侧导航**（sticky，宽 210px）：导航 / 战斗 / 非战斗 / 被动（游戏自身 `LegacySidebarCategory` 分组，带技能图标）/ 参考表 / 工具。当前页用 `aria-current` 高亮。≤820px 收起为 ☰ 抽屉。
- **右侧本页目录**（sticky，宽 200px）：自动收集正文 `h3`；少于 2 项时隐藏整栏；≤1200px 隐藏。
- **页脚**：数据版本（`project.binary` 读出，如 v0.11.6）、条目数、非官方声明。
- 整页滚动（不要回到“各栏独立滚动”的布局）；锚点 `scroll-margin-top:72px` 以避开顶栏。

### 4.3 页面类型

- **首页**：欢迎段（含版本与统计）、统计卡（可点击）、主导航框、卡片网格（新手入门 / 今日推荐物品 / 其他重要条目 / 最近浏览与收藏）。
- **条目页**：面包屑 → `h2` 标题 → 操作（收藏、链入页面、打印）→ 右浮**信息框**（图标 96px、描述、英文名、类别、种类、来源 / 用途摘要、属性、出售价格）→ 一句**导语**（`<p class="lead">`，例：“X（英文）是一种……可通过……获得。可用于……。”）→ 正文各节 → 相关条目导航框 → 主导航框。信息框已显示的字段不要在正文重复（`showEntry` 的 skip 列表）。
- **技能页**：解锁条件、配方表、精通阶级与奖励（合并为一张表：阶级 / 所需精通进度 / 奖励）、精通任务、宠物等。技能 Boosts **只**从技能详情页进入，导航、首页、列表等处不放 Boosts 链接。
- **参考表 / 搜索 / 索引 / 链入页**：标题 + 一句说明 + 表格或列表；搜索结果可按类别筛选。

### 4.4 标题与区块

- 节标题统一为 `h3`：强调色、下边线。**不要**把标题放进卡片、`<details>` 折叠框或带边框的容器里——所有节标题与“技能解锁条件”同一样式。
- 只有首页卡片（`.home-card`）、信息框、导航框、表单区（`.calcform` / `.boost-controls`）使用带边框面板。
- 表格内的辅助说明（如 Boosts 每行“生效条件与获取途径”）可以用 `<details open>`；默认展开。

### 4.5 表格

- 一律用 `dataTable()`：自带“筛选本表”、导出 CSV、行数、列标题点击排序（`aria-sort`）。排序值放在 `cell(value, html)` 的第一个参数。
- **长表**：超过 `LONG_TABLE_ROWS`（15）行自动变为固定高度（`min(70vh,640px)`）的垂直滚动框，表头 sticky，可 Tab 聚焦，打印时展开。不要另写分页或“显示更多”。
- **跨技能的表必须按技能拆分**：用 `skillSections()`，每个技能一个带图标的标题（“伐木 · 22”），顺序跟游戏技能顺序，无归属的放最后（“其他 / 其他来源 / 其他用途 / 其他物品（非技能产出）”）。拆分后去掉多余的“技能”列。顶层页面用 `h3`，条目页内的子表用 `h4`。只属于一个技能的列表保持单表。
- 相关的两张表如果是一一对应关系（如精通阶级 ↔ 精通奖励），合并为一张表，而不是并列两张。
- 同一条目在一张表里只出现一次（例如用途表按来源条目去重）。

### 4.6 条件与列表文字

- “或”条件与前一条合并到同一行：`A 或 B`（`<b class="or">或</b>`），连续多个依次串接；不要单独成行，也不要出现悬空的“或：”前缀。
- 条件列表用 `<ul>`；单项短文本直接行内。
- 空值显示 `—` 或“无额外要求”，不要留空白格。

### 4.7 视觉

- 暗色主题，变量在 `:root`：`--bg #10151c`、`--panel #19222d`、`--line #2d3c4c`、`--text #e2e9f1`、`--muted #a5b7c9`、`--accent #8bd6b4`。新颜色先考虑复用这些变量。
- 字体 `system-ui, "Microsoft YaHei"`，正文 14px；`h2` 28px，`h3` 18px 强调色。
- 只使用安装包里真实存在的图标；缺图就只显示文字，不生成替代美术。
- 链接为强调色、无下划线，悬停下划线。

### 4.8 可访问性与响应式

- 交互元素用真正的 `<button>` / `<a>`；图标 `alt=""`，Logo 有 `alt`。
- 焦点可见（`outline: 2px solid var(--accent)`）；滚动表格 `tabindex="0"` + `role="region"` + `aria-label`。
- 尊重 `prefers-reduced-motion`。
- 断点：≤1200px 隐藏右侧目录；≤820px 侧栏变抽屉、信息框不再浮动、导航框单列。
- 打印：隐藏顶栏、侧栏、目录、页脚、工具条与导航框；表格完整展开。

## 5. 改动检查清单

1. 读相关代码与数据，列出所有要改的位置（调用方、路由、导航链接、测试）。
2. 用现有帮助函数实现；修共享逻辑而不是单页补丁。
3. 文字全部经过 `esc()` / 链接函数，无内部字段外露。
4. 跨技能表已拆分、长表会滚动、“或”条件已合并、标题不在卡片里。
5. `verify.cjs` 加了针对性断言；`python wiki/build.py` 与 `node wiki/verify.cjs` 均通过。
6. 视觉改动做过无头 Edge 截图检查（桌面 + 窄屏）。
7. 用户可见的行为变化同步到 `README.md`；与参考站点的对应关系同步到 `FEATURES.md`。

## 6. 已知遗留问题

- 敌人参考表中“魔法”等级被解析成同 Id 的物品（显示为“魔法树篝火”）；敌人条目页信息框是对的。
- 部分加成文本（如“-10%躲避值”）作用对象是敌人，现有文字看起来像减益。
- 任务步骤中大量“普通原木 / 橡木 × 1”费用疑似占位数据，暂按原样显示。
- “或”条件只与紧邻的前一项合并，未在游戏内验证其语义。
