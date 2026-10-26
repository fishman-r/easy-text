import { t } from "./i18n.js";
export function renderShell() {
  return `
<header class="browser-menu"><nav aria-label="主菜单"><button data-menu="file" aria-haspopup="menu" aria-expanded="false">文件</button><button data-menu="edit" aria-haspopup="menu" aria-expanded="false">编辑</button><button data-menu="selection" aria-haspopup="menu" aria-expanded="false">选择</button><button data-menu="find" aria-haspopup="menu" aria-expanded="false">查找</button><button data-menu="view" aria-haspopup="menu" aria-expanded="false">视图</button><button data-menu="goto" aria-haspopup="menu" aria-expanded="false">前往</button><button data-menu="tools" aria-haspopup="menu" aria-expanded="false">工具</button><button data-menu="preferences" aria-haspopup="menu" aria-expanded="false">偏好设置</button><button data-menu="help" aria-haspopup="menu" aria-expanded="false">帮助</button></nav></header>
<div class="workspace"><aside class="sidebar"><section class="open-files-section"><div class="sidebar-heading"><button data-action="toggleOpenFiles" aria-expanded="true">${t("openFiles")}</button></div><div id="open-files"></div></section><section class="folders-section"><div class="sidebar-heading"><span>${t("folders")}</span><div class="sidebar-tools"><button data-action="treeFilter" title="筛选文件" aria-label="筛选文件">⌕</button><button data-action="folder" title="打开文件夹" aria-label="打开文件夹">＋</button></div></div><input id="tree-filter" aria-label="筛选文件" placeholder="筛选文件…"><div class="project-heading"><button data-action="toggleFolders" aria-expanded="true">▾</button><span>工作区</span></div><div id="tree"></div></section></aside>
<main><div class="tab-bar"><div class="tab-arrows"><button data-action="previousTab" aria-label="上一个标签">◂</button><button data-action="nextTab" aria-label="下一个标签">▸</button></div><div id="tabs"></div><div class="editor-actions"><button data-action="files" title="打开文件列表" aria-label="打开文件列表">▾</button></div></div><div id="breadcrumbs" hidden></div><span id="lines" hidden></span><div id="editors"></div></main></div>
<footer><div class="status-left"><button data-action="sidebar" title="切换侧栏" aria-label="切换侧栏">▤</button><span id="cursor"></span><span class="status-logo"></span><span id="session" hidden></span><span id="file-count" hidden></span></div><div class="status-right"><button id="indent-status" data-action="indentSettings">${t("tabSize", { size: 4 })}</button><span id="encoding">UTF-8</span><span id="line-ending">LF</span><button id="language" data-action="commands"></button></div></footer><div id="toast" role="status"></div>
<input type="file" id="workspace-input" accept=".json" hidden><input type="file" id="file-input" multiple hidden><input type="file" id="folder-input" webkitdirectory multiple hidden>
<dialog id="language-dialog"><form id="language-form"><div class="dialog-label"><label for="language-preference">${t("languageTitle")}</label><button type="button" data-dismiss="language-dialog" aria-label="${t("close")}">×</button></div><div class="name-body"><p>${t("languageDescription")}</p><select id="language-preference" aria-label="${t("languagePreference")}"><option value="zh-CN">${t("languageChinese")}</option><option value="system">${t("languageSystem")}</option></select><p id="language-system-info"></p><div class="name-actions"><button type="button" data-dismiss="language-dialog">${t("cancel")}</button><button class="name-confirm" type="submit">${t("apply")}</button></div></div></form></dialog><dialog id="name-dialog"><form id="name-form"><div class="dialog-label"><label id="name-title" for="name-input">文件名</label><button type="button" data-dismiss="name-dialog" aria-label="取消文件名输入">×</button></div><div class="name-body"><input id="name-input" aria-label="文件名" required maxlength="240" autocomplete="off"><p id="name-hint">支持目录路径，例如 src/app.js</p><div class="name-actions"><button type="button" data-dismiss="name-dialog">取消</button><button class="name-confirm" type="submit">确认</button></div></div></form></dialog><dialog id="palette"><div class="dialog-label"><span id="palette-title"></span><button data-dismiss="palette" aria-label="关闭命令面板">Esc</button></div><input id="palette-query" autocomplete="off" aria-label="搜索文件或命令"><div id="palette-results"></div><div class="palette-hint">↑ ↓ 选择 <span>↵ 确认</span><span>Esc 关闭</span></div></dialog>
<dialog id="help"><div class="dialog-label">让编辑更顺手<button data-dismiss="help" aria-label="关闭帮助">×</button></div><h2>从键盘出发。</h2><p>macOS 使用 ⌘，Windows / Linux 使用 Ctrl。</p><div class="help-grid">${[
    ["快速打开文件", "⌘ P"],
    ["命令面板", "⇧ ⌘ P"],
    ["保存当前文件", "⌘ S"],
    ["新建文件", "⌘ N"],
    ["查找 / 替换", "⌘ F"],
    ["选择下一处匹配", "⌘ D"],
    ["添加光标", "Alt + 点击"],
    ["跳转到行", "Ctrl G"],
    ["切换注释", "⌘ /"],
    ["缩进 / 取消缩进", "Tab / Shift Tab"],
    ["撤销 / 重做", "⌘ Z / ⇧ ⌘ Z"],
    ["代码补全", "Ctrl Space"],
  ]
    .map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`)
    .join(
      "",
    )}</div><p class="help-note">easy text 使用 CodeMirror 6 独立实现编辑。桌面版提供磁盘项目、冲突检测、Git 和构建进程；浏览器版保存为下载。内置宏、代码片段和自定义快捷键；符号扫描不是 LSP，桌面插件管理支持已实现的 Sublime Python API 子集。只加载可信代码，不保证任意插件兼容。</p></dialog>`;
}
