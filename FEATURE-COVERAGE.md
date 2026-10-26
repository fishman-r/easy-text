# easy text 0.5.0 与本机 Sublime Text Build 3211 功能差距

日期：2026-10-26。独立审查：sublime_inventory。目标是本机发行包的核心行为；本轮只读应用与源码，仅写本报告，没有操作 UI、修改实现、复制原版源码或重跑全套测试。

**本轮增量更新**：已复核 main 接入 editing-extras 的 8 项命令、display-options 的 4 项展示选项、全部保存、撤销关闭与前进历史。本次实际运行 editing-extras/display-options 单测 **17/17 通过**（含新缩进转换纯函数）；主代理已在已安装的 0.5.0 中完成下述窄范围 GUI 验收，见 [验收记录](ACCEPTANCE-0.5.md)。关闭栈恢复有 session-recovery.test.js；全部保存和导航的端到端 UI 行为不能由这些纯函数测试代替。

## 口径与证据

- **已实现**：所列窄范围功能有可追溯的实现和调用入口；不表示本轮 UI 验收通过，也不表示与 Sublime 全部边界行为等价。
- **部分**：有入口与真实实现，但范围、语义或配置存在明确差距。
- **缺失**：在本轮检查的命令注册、菜单、界面和服务中没有找到对应完整产品路径；不能据此断言依赖库不存在相关底层函数。
- **不适用**：原产品许可、商标或外部产品专属入口，不应原样复制。

基线：[静态清单](../research/feature-inventory.md)、[完整 JSON](../research/feature-inventory.json)。94 个 Default ZIP 成员，242 个不同 command 字段值，其中 **238 个非占位符声明命令、4 个动态占位符**；不是 238 个等权功能，也不是运行时命令全集。下表按 13 组业务行为拆分，**不计算命令覆盖率**。逐命令原始引用保留在 JSON 的 `command_references`，本报告没有声称逐一验收全部 238 个声明。

`D!成员:行` 表示 `/Applications/Sublime Text.app/Contents/MacOS/Packages/Default.sublime-package` 内成员。ET 路径均相对此目录，行号为本次源码快照；函数名便于后续定位。未实现项引用 ET 命令全集/相关模块作为搜索边界，不以单个关键词的缺失作为唯一证明。

## 1. 文件、缓冲区与编码

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 新建、打开、保存、另存：D!Default (OSX).sublime-keymap:11–12 | 已实现 | `src/main.js:626` newFile、:734 openFiles、:759 save；`desktop/service.mjs` createFile/saveFile/saveAsPath；桌面磁盘保存，浏览器下载。 |
| 全部保存：D!Main.sublime-menu:127 save_all | 已实现 | **本轮新增** main saveAll/file.saveAll，对当前打开标签中的脏缓冲区逐个调用 save(false,target)，取消/失败停止并报告已保存数，保存目标不依赖活动栏；桌面限定。安装版双文件全部保存及磁盘字节核对通过；不包含隐藏关闭缓冲区。 |
| 关闭/撤销关闭/最近打开：D!Main.sublime-menu:18–20 | 部分 | **本轮新增** main closedTabs/reopenClosedTab/file.reopenClosed，最多保留 50 项关闭顺序和原标签位置，session-state 恢复关闭栈与未保存内容；仍保留缓冲区。最近文件/目录列表仍缺失，撤销关闭及跨重启恢复未保存文本已通过 GUI 验收。 |
| 重读磁盘：D!Main.sublime-menu:133 revert | 已实现 | `src/main.js` file.reload：确认、版本复检、readFile、强制 receiveNative；有放弃未保存内容的明确提示。 |
| 编码/BOM/换行：D!Encoding.sublime-menu:6；D!Preferences.sublime-settings:235、243 | 部分 | `src/preferences.js` 文件格式表单与 `desktop/service.mjs` 编解码支持 UTF-8、UTF-16LE/BE、BOM、LF/CRLF/CR；未实现原版编码列表、按指定旧编码重新解码、十六进制查看。 |
| 原子保存及保存清理：D!Preferences.sublime-settings:224；REA Save 路径见后文 | 部分 | `desktop/service.mjs` saveFile 有临时文件、revision 检查和备份；外部进程在最终检查与 rename 之间仍可能竞争。未见保存时去尾空格/补末尾换行的用户设置与处理路径。 |
| 会话/热退出：D!Preferences.sublime-settings:383 | 部分 | `src/main.js:193` captureSession、`src/session-state.js`、service saveSession/loadSession 保存内容、分栏、选区、滚动；并非完整恢复撤销历史、折叠和全部原产品工作区状态。 |

## 2. 编辑与多重选择

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 撤销/重做与多光标编辑：D!Default (OSX).sublime-keymap:24、164 | 已实现 | `src/main.js:307` createState 使用 display-options baseEditorSetup、多选、CodeMirror undo/redo；编辑进入事务；不是原版撤销分组算法复刻。 |
| 按行拆选区、上下添加光标：D!Default (OSX).sublime-keymap:61 | 已实现 | `src/selection-tools.js:3`、main selection.split/above/below 显式命令路径。矩形选择来自 baseEditorSetup 的 rectangularSelection，不应因没有自定义命令而误判全部缺失。 |
| 专门选择历史/全选相同文本：D!Default (OSX).sublime-keymap:24、212 | 已实现 | **本轮新增** editing-extras selection.undo/redo/allOccurrences，main 接入；真实 CodeMirror 选区历史、主选区文本/单词全匹配，保留反向，超过 1000 匹配拒绝部分提交。单测通过，三处匹配编辑及选区撤销/重做 GUI 通过；不宣称 Sublime 全边界语义相同。 |
| 缩进粘贴、剪贴板历史：D!Main.sublime-menu:160；D!paste_from_history.py:63 | 缺失 | 当前原生菜单是系统 cut/copy/paste；`src/main.js` 没有专门粘贴缩进或历史列表产品路径。 |
| mark / kill ring / yank：D!mark.py:5；D!kill_ring.py:68 | 缺失 | 当前编辑命令和状态没有标记点、交换标记、删除到标记和独立 kill ring 生命周期。 |

## 3. 文本变换

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 行移动、复制、删除、拆行，行注释：D!Default (OSX).sublime-keymap:234；D!Main.sublime-menu 编辑组 | 已实现 | main line.up/down/copyUp/copyDown/delete/split、edit.comment 调用 CodeMirror。 |
| 大小写、排序、去重：D!sort.py:131、166 | 部分 | `src/main.js:1057` transformText 已有 upper/lower/sort/unique；选择处理和排序规则是 ET 定义，非原版多选/空行/区域边界兼容证明。 |
| Title Case、Swap Case、ROT13、反转/随机行：D!Main.sublime-menu:258、261、287；D!Default.sublime-commands:110 | 部分 | **本轮新增** editing-extras titleCase/swapCase/rot13/reverseSelectedLines，main 命令接入；Unicode、多选、单次撤销单测通过；ROT13 及单次撤销 GUI 通过，其余变换本轮仅单测。Title Case 当前按 ASCII 空格分词；随机排列仍缺失。 |
| 合并行、按列重排、算术：D!Main.sublime-menu:175、269；D!arithmetic.py:60 | 部分 | **本轮新增** editing-extras joinSelectedLines/main lines.join，处理多个选区、相邻区域和末尾换行，单测通过；安装版合并相邻行及单次撤销通过。wrap_lines 和 arithmetic 仍缺失；算术应使用受限表达式解析。 |
| 缩进/重新缩进/Tab 转换：D!indentation.py:154、166 | 部分 | main indent.more/less/auto、convertIndent 已有；**本轮修复** editing-extras convertLeadingIndent 按 2/4/8 tab stops 计算混合空白；main convertIndent 已改用 effectiveSettings(current()).indentSize，固定 2 空格缺陷的源码路径已关闭，单测通过、GUI 待验。未见自动探测缩进。 |
| 字符与选区转置：D!transpose.py:74 | 部分 | main text.transpose 只调用 transposeChars；不能等同原版多区域交换。 |

## 4. 查找与替换

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 文档查找/替换、正则、大小写、整词：D!Default (OSX).sublime-keymap:200、205、206、672 | 已实现 | main edit.find → CodeMirror openSearchPanel/baseEditorSetup；CM 中文 phrases 已覆盖。搜索选区限定及原版历史语义未列为已实现。 |
| 文件夹查找替换：D!side_bar.py:119 | 部分 | `src/workbench.js` searchRun/预览/应用 → service search/previewReplace/applyReplace/undoReplace。Worker 限时、revision 防冲突；有结果/文件/字节限制，项目整词/路径 include-exclude 表单和搜索历史未齐。多文件写入不是全局原子事务。 |
| 结果点击导航：D!Default (OSX).sublime-keymap:215 next_result | 部分 | workbench 结果行可以跳转；未见统一 F4/Shift-F4 跨结果前后循环及持久化搜索历史。 |

## 5. 导航、符号与索引

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 行号跳转：D!goto_line.py:18–33 | 已实现 | main goto.line → CodeMirror gotoLine；可完成普通行号跳转。原插件负数行为与面板语法不应假设一致。 |
| Goto Anything：D!Default (OSX).sublime-keymap:186 | 部分 | `src/core.js` 自有 Unicode 模糊匹配；main renderPalette 文件/命令列表与高亮。未实现原版全部混合查询协议、预览导航和排名一致性。 |
| 文档/项目符号、定义：D!symbol.py:183 | 部分 | `src/syntax-navigation.js:21、78` JS/TS 同文档语法树定义，其他语言正则扫描；service symbols 为有上限的扫描。无完整跨文件索引、符号配置和类型解析；LSP 不是本版核心基线要求。 |
| 引用、悬浮定义：D!Main.sublime-menu:633；D!Preferences.sublime-settings:247 | 缺失 | 现有 workbench 定义跳转不构成引用检索/悬浮定义。 |
| 后退/前进：D!Main.sublime-menu:641；D!history_list.py:227 | 已实现 | **本轮新增** main navigationForward、navigateBack(forward)、navigation.forward，并在新导航清空前进栈；有同文件 select.goto 记录路径。安装版跨文件后退/前进及光标位置验证通过，不宣称位置随所有后续编辑自动映射。 |
| 书签：D!Default (OSX).sublime-keymap:586 | 部分 | main toggleBookmark/nextBookmark 有持久化位置列表；本轮新增 changes.mapPos 映射、行首归一及去重；GUI 编辑后位置验收尚未完成；无 gutter 标识/清空全部专门入口。 |

## 6. 语言、语法与补全

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 高亮/补全/括号/标签：D!Preferences.sublime-settings:256、287 | 部分 | main lang 和 baseEditorSetup，依赖包含 JS/TS、Python、HTML、CSS、JSON、Markdown。Build3211 发行包有 51 个包；不能把包数当语言数，ET 也未解析 .sublime-syntax/.tmLanguage 或原版 completion/scope 规则。 |
| snippet 与字段跳转：D!Default (OSX).sublime-keymap:129、266 | 部分 | workbench chooseSnippet、Tab 前缀展开、settings-forms GUI；CodeMirror snippet 语法，非 .sublime-snippet 全语法/作用域/变量/正则变换兼容。 |
| 作用域检查：D!show_scope_name.py:11 | 缺失 | 无原版 scope 查询 UI；Python shim 也不提供原生语法引擎，不能用占位字符串冒充。 |
| 拼写/字典：D!Preferences.sublime-settings:75、125 | 缺失 | 无拼写标注/字典选择/忽略词工作流。系统输入法可输入中文，不代表编辑器已实现拼写功能。 |

## 7. 折叠与展示

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 普通折叠/全部折叠/展开：D!fold.py:34、63、130 | 已实现 | baseEditorSetup foldGutter/foldKeymap 及 main fold.all/unfold.all；依赖当前语言解析能力。 |
| 按层级/标签属性折叠：D!Main.sublime-menu:240；D!fold.py:83 | 缺失 | 未见层级选择或 HTML 属性折叠操作；普通 foldAll 不等同。 |
| 软换行、行号、字号、minimap：D!Preferences.sublime-settings:108；D!font.py:5 | 已实现 | `src/preferences.js`、main reconfigure、`src/minimap.js`；字号受 ET 10–24 限制，minimap 是自绘文本概览。 |
| 标尺、空白字符、缩进线可配置：D!Preferences.sublime-settings:72、198、204 | 部分 | **本轮新增** display-options.js 及 preferences GUI：行号开关、空白显示、活动行高亮、0/80/100/120 列标尺；main 使用独立 display Compartment。选项组合和历史保留单测通过，空白点和 80 列标尺实际绘制、重启后设置持久化已验收；行号/活动行开关组合本轮仅单测。缩进引导线和任意多个标尺仍未实现。 |
| 主题与配色资源：D!ui.py:7、177 | 部分 | 0.5.1 新增图形选择七套内置配色及工作区同步配色；无外部主题/配色包导入和 Sublime 语法配色格式兼容。 |
| 全屏/无干扰/隐藏栏：D!Main.sublime-menu:380、381、386 | 部分 | desktop native-menu 有 togglefullscreen，main 有侧栏开关；未见独立无干扰模式、标签栏/状态栏开关。 |

## 8. 窗口、分栏与标签

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 双文件/同文件双视图：D!Main.sublime-menu:81 clone_file | 已实现 | main mount、paneFiles、记忆选区/滚动及 change 映射；窄范围为两栏，不宣称原版 clone 生命周期相同。 |
| 多窗口、网格、任意 pane：D!Main.sublime-menu:129–130；D!pane.py:54、118 | 缺失 | desktop main 维护单一 window；main split boolean/两个 paneFiles。新窗口、三四栏/网格、pane 增删尚无路径。 |
| 标签排序/切换/组移动：D!Default (OSX).sublime-keymap:545、554 | 部分 | main moveTab、左右切换及关闭其他/右侧标签；无任意组移动、MRU 堆栈切换和拖放重排完整流程。 |
| macOS 原生 tabs：D!Preferences.sublime-settings:352 | 缺失 | ET 编辑器自绘 tabs，不是 macOS 原生窗口 tab 分组；可低优先级独立决定是否实现。 |

## 9. 项目、工作区与侧栏

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 文件夹树/筛选/新建/重命名：D!side_bar.py:65、119 | 部分 | main renderTree/newFile/rename、folder-tree、service listTree/createFile/renameFile；无目录重命名、目录新建和通用侧栏上下文操作集。 |
| 删除文件/移至废纸篓/在访达显示：D!Side Bar.sublime-menu:4 | 缺失 | service 暂无删除/废纸篓/reveal 服务，不应以移除标签代替。实现须保护脏缓冲区与授权边界。 |
| 项目切换、多根、项目设置：D!Main.sublime-menu:816–823 | 部分 | 单活动 workspace、打开目录、会话以及 JSON 工作区备份导入/导出；没有 .sublime-project/.sublime-workspace 兼容、多根管理 GUI 或每项目排除/构建设置全集。 |
| 过滤与排除：D!Preferences.sublime-settings:452–456 | 部分 | 有树文本筛选，service 固定跳过 .git/node_modules/符号链接及条目上限；无用户配置的 glob 排除。 |

## 10. 构建与执行

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 构建/取消/输出：D!exec.py:170；D!Default (OSX).sublime-keymap:254、258 | 已实现 | workbench 构建表单 → service startBuild/cancelBuild；受确认的本地进程、shell:false、输出限制和进程组取消。此范围不是交互式终端。 |
| 错误导航/variants/系统自动选择：D!Main.sublime-menu:746；D!Preferences.sublime-settings:428 | 部分 | `src/build-diagnostics.js` 解析常见诊断并点击跳转；无 .sublime-build 解释器、variants、语法自动选择、file_regex 完整配置及全部内联错误行为。 |

## 11. Git 与外部工具

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 编辑器行差异/下一修改/回退：D!Default (OSX).sublime-keymap:218、220；Preferences:69 | 部分 | workbench diff、text-tools lineDiff 已有独立差异面板；并非 gutter mini_diff、逐块回退和修改间跳转完整工作流。 |
| Git 状态与外部集成：D!Preferences.sublime-settings:433 | 部分 | service gitStatus/gitDiff/gitLog/gitStage/gitCommit、workbench Git 面板；ET 额外暂存/提交不抵消原版侧栏状态与 gutter 缺口。 |
| Sublime Merge 专属命令：D!Default.sublime-commands:102–103 | 不适用 | 不照搬产品名、链接或品牌集成；如需外部 Git 工具应做 ET 自有可配置入口。 |

## 12. 自动化、扩展与配置

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 命令面板/GUI 设置/自定义键：D!Default (OSX).sublime-keymap:186；D!settings.py:7 | 部分 | main commands、preferences、settings-forms 均真实接入；键绑定映射自身命令，不兼容 Sublime context/鼠标映射/平台条件全集。GUI 是 ET 产品选择，不要求照搬原版 JSON 编辑流程。 |
| 宏录制/回放/保存：D!Main.sublime-menu:766 | 部分 | text-tools MacroRecorder 模拟后单事务提交，workbench 持久化最近宏；不是 Sublime 命令宏文件、命名多宏和参数语义兼容。 |
| Python 命令和事件：sublime_plugin.py:1076–1105 | 部分 | plugin-manager + python_host + plugin-transactions 有真实进程、事务快照、版本防护与明确 UnsupportedAPI；已验证部分本机 Default 插件见 research/plugin-sample-review.json。无任意插件兼容保证；交互面板、渲染区域、线程回调、native ABI 等仍受限。 |
| 控制台、资源浏览、语法测试、性能分析：D!ui.py:282；D!profile.py:14；D!run_syntax_tests.py:12 | 缺失 | 插件输出面板不是可执行 Python 控制台；无语法资源浏览/转换、原版语法测试、性能分析完整工具链。 |
| Package Control 安装：D!install_package_control.py:13 | 不适用 | 不直接复制原产品的安装入口。ET 有可信本地插件来源安装，但不是 Package Control 生态兼容。 |

## 13. 应用与系统交互

| 行为 / 原版证据 | 状态 | ET 路径及差距 |
|---|---|---|
| 关于/原生文件选择/剪贴板/退出：D!Main.sublime-menu:901 等 | 已实现 | desktop main/preload、native-menu、src/dialogs.js；ET 自有关于信息、确认框和文件选择器。 |
| 原版购买/许可/更新品牌入口 | 不适用 | 不复制 Sublime 商标、许可验证或购买链接；ET 自身更新策略需另行设计，不能伪装原版更新。 |
| URL/浏览器打开、命令行客户端：D!open_in_browser.py:6；Contents/SharedSupport/bin/subl | 缺失 | 未见 ET 自有打开当前文件到浏览器、命令行打开路径/行号的发行入口；Electron 可启动不等于已交付 CLI。 |

## REA 关键路径复核

本轮读取 [REA 记录](../research/rea-commands.md) 和 [本地启动脚本](../rea-local.sh)，实际执行 `sh rea-local.sh --version` 返回 **6.8.0**。复用已导出的 REA/Ghidra 证据，未重新运行反编译，也未调用原版运行态函数。

- 本机 Default 包重新计算 SHA-256 为 `c0fe5a2108fed29548ac53488d651261f109b239e8de6ef5a7eee5601fdfe668`，与既有 REA artifact 证据一致；`goto_line.py`、macOS keymap、Main menu 的成员摘要已重新核对。
- 原生 evidence bundle SHA-256 为 `a434f3897f4f2bae2daecb3b11046bec875f252a65ae90f37a072e7959f05bfa`。下列 4 个 `.c` 文件均逐字等于对应 record 的 `normalized_result`，不是根据文件名猜测。

| 关键路径 | REA 地址 / evidence_id | 能确认什么 / ET 对照 |
|---|---|---|
| 保存 | `0x10037153a` / `ev_9e14e20c1172f3ae786da730cc22f6ade0c746342ffd1cf5a8122a0e5f4c6944` | 可见受条件控制的去尾空白、EOF 换行，随后 write、回调和 did_write_file 队列。ET saveFile 有独立写入保障，但前述保存整理功能尚缺。不能由该函数推断完整原子保存策略。 |
| 撤销组 | `0x1003727d2` / `ev_98c3084d05428606e1ddf030a2c2a6156d74928f6b233a2b588fb25c36e7cbc0` | 可见组内动作与依赖文本恢复路径；ET 使用 CodeMirror 历史与宏组合事务，不宣称复制原版内存/压缩布局。 |
| 多选集合 | `0x1003484da` / `ev_9242c96144ad04259cb57990cc1cb4670dce681d11a20b1923a3cd6e7ff54a30` | 可见范围比较和合并路径。ET 使用 EditorSelection/change mapping；端点接触、反向区域等具体等价仍需输入输出差分，静态名称不能证明。 |
| 模糊评分 | `0x100167844` / `ev_366b93782f6e52b94556ba55a4d81b4d4971ce82f045baf424e2df92af1b33ee` | 有序子序列、位置权重、连续性代价有表达式证据；权重来源与调用者排序未完备取证。ET core.js 自有有界匹配和高亮，不宣称分数等价。 |

公开命令路由亦已交叉检查：D!goto_line.py:18–33 → sublime.py View/Selection 包装 → native API；ET main goto.line → CodeMirror gotoLine 是独立实现。原插件若经 ET Python 宿主执行，则经过 host 命令注册 → 快照变更 → plugin-transactions 验证 → 单次前端事务，是另一条受限兼容路径。不能把能够加载插件当成已实现整个命令/API 集合。

## 最值得先补齐的独立增量

1. **验收缩进转换修复**：新 convertLeadingIndent 已接入 main，使用活动文件 effectiveSettings，且通过 2/4/8 混合空白单测；继续 GUI 验证局部设置和单次撤销。
2. **文件生命周期验收与最近打开**：全部保存/撤销关闭已新增，优先做双栏、取消保存、冲突的 GUI 验收；接着补最近文件/目录，明确关闭标签与释放缓冲区区别。
3. **书签与导航验收**：前进/后退已新增，验证同文件和跨栏历史；书签事务映射已接入，仍需 GUI 验收及 gutter 展示。
4. **剩余文本操作**：合并行、Title/Swap Case、ROT13、逆序已新增并通过单测；接着补按列重排、保存时去尾空白/补 EOF 换行，并验证不同命令无选区规则的清晰提示。
5. **展示设置后续**：标尺/空白/活动行/行号已接入表单，先验实际绘制与重启恢复；剩余缩进引导线、状态/标签栏开关及无干扰布局。
6. **项目基础管理**：可配置 glob 排除、目录新建/重命名、访达显示、受保护的废纸篓删除；之后再做多根与网格分栏。

LSP、调试器、交互终端、AI 助手、远程开发均不纳入此 Build3211 核心欠账；第三方插件可能提供，但本轮未读取用户插件。跨语言索引、完整 Sublime 语法/主题格式与 Python 生态兼容属于较大工程，不宜用新增几个菜单宣称完成。

本轮结论来自源码路径、发行包声明与既有 REA 证据复核。历史独立 API/测试产物可帮助后续验收，当前 0.5.0 通过 61 项前端及 34 项桌面自动测试，GUI 范围见验收记录，未给“全部功能完整”结论。
