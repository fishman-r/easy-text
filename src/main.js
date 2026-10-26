import { selectionsByLine } from "./selection-tools.js";
import { createPluginController } from "./plugins.js";
import {
  preparePluginDocuments,
  pluginSettingPatch,
  assertPluginSnapshot as validatePluginSnapshot,
} from "./plugin-transactions.js";
import { folderNodes } from "./folder-tree.js";
import { monokai } from "./monokai.js";
import { restoreSession, normalizeSettings } from "./session-state.js";
import { installMenus } from "./menus.js";
import { renderShell } from "./shell.js";
import { basicSetup } from "codemirror";
import { EditorState, Compartment, EditorSelection } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  indentWithTab,
  undo,
  redo,
  toggleComment,
  moveLineUp,
  moveLineDown,
  copyLineUp,
  copyLineDown,
  indentMore,
  indentLess,
  indentSelection,
  selectLine,
  deleteLine,
  splitLine,
  transposeChars,
  addCursorAbove,
  addCursorBelow,
  selectAll,
  isolateHistory,
} from "@codemirror/commands";
import {
  openSearchPanel,
  gotoLine,
  selectNextOccurrence,
} from "@codemirror/search";
import { foldAll, unfoldAll, indentUnit } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import {
  filterFiles,
  uniqueName,
  dirty,
  validSession,
  fuzzyMatch,
  rankFiles,
  fileFormat,
  applySaveResult,
} from "./core.js";
import { normalizeText } from "./text-tools.js";
import { attachMinimap } from "./minimap.js";
import { createWorkbench } from "./workbench.js";
import "./style.css";
import "./workbench.css";
import "./classic-layout.css";

const native = window.easyText || null;
let workspace = null;
let nativeSessionReady = !native;
let diskTree = [];
let workbench = null;
let plugins = null;
let paneFiles = [];
let minimaps = [];
const viewFiles = new WeakMap();
const paneSelections = new Map();
const paneScroll = new Map();
const changeNotifications = new Map();
const notifiedRevisions = new Map();
const navigationHistory = [];
let navigatingBack = false;

const STORAGE = "easy-text-session-v2";
const intro = `/**\n * easy text — 把想法写成代码\n *\n * 一个独立实现的本地代码编辑器。\n * Cmd / Ctrl + P 跳转文件，Shift + Cmd / Ctrl + P 打开命令面板。\n * ${native ? "桌面模式：打开文件后原路径保存，检查磁盘冲突。" : "浏览器演示：保存发起下载，不直接写回原文件。"}\n */\n\nexport function createWorkspace(name = '我的项目') {\n  const tools = [\n    '多光标编辑',\n    '正则查找与替换',\n    '语法高亮与代码折叠',\n    '独立文档分栏与代码片段',\n  ];\n\n  return {\n    name,\n    tools,\n    ready: true,\n    createdAt: new Date().toISOString(),\n  };\n}\n\nconst workspace = createWorkspace();\nconsole.log('开始创造', workspace);\n`;
function file(name, content) {
  content = normalizeText(content);
  return { id: crypto.randomUUID(), name, content, saved: content, version: 0 };
}
const initial = [
  file("src/welcome.js", intro),
  file(
    "README.md",
    "# 欢迎来到 easy text\n\n这是一个使用 CodeMirror 独立实现的代码编辑器。\n\n## 快速开始\n\n- 点击左侧文件开始编辑。\n- 使用「打开」导入 UTF-8 文本文件或目录。\n- Cmd/Ctrl + S 保存当前文件（浏览器版下载）。\n- Cmd/Ctrl + F 打开查找，可开启正则并展开替换。\n- Alt + 点击增加光标；Cmd/Ctrl + D 选择下一处相同文本。\n- 使用右上角分栏按钮，在两栏中选择不同文件，也可以共享同一文档。\n\n## 边界\n\n会话在本机自动保存。桌面版支持原路径保存和冲突检测；浏览器版下载备份。\n桌面版提供项目搜索替换、Git 和构建输出。命令面板包含宏、片段、书签和自定义快捷键。桌面插件管理可显式加载可信 Python 插件，支持已实现的 Sublime Python API 子集。没有完整 LSP，也不保证任意插件兼容。\n",
  ),
  file(
    "src/styles.css",
    ":root {\n  --accent: #c4ef8b;\n  --background: #11151b;\n}\n\n.workspace {\n  display: grid;\n  min-height: 100vh;\n  color: var(--accent);\n}\n",
  ),
  file(
    "data/settings.json",
    '{\n  "name": "easy text",\n  "theme": "dark",\n  "tabSize": 2,\n  "wordWrap": false\n}\n',
  ),
];
let stored;
try {
  stored = JSON.parse(localStorage.getItem(STORAGE));
} catch {}
const restored = validSession(stored) ? restoreSession(stored) : null;
let files = restored?.files || initial;
let active = restored?.active || files[0].id;
let tabs = restored?.tabs || files.map((file) => file.id);
let settings = restored?.settings || normalizeSettings();
paneFiles = restored?.paneFiles || [active, active];
workspace = restored?.workspace || null;
let views = [],
  states = new Map(),
  syncing = false,
  split = restored?.split || false,
  focused = null,
  saveTimer,
  toastTimer;
const compartments = new WeakMap();
const current = () => files.find((f) => f.id === active);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) =>
  ({
    js: "JS",
    json: "{}",
    css: "#",
    md: "M↓",
    html: "<>",
    py: "Py",
    txt: "T",
  })[name.split(".").pop()] || "T";
function toast(text) {
  document.querySelector("#toast").textContent = text;
  document.querySelector("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => document.querySelector("#toast").classList.remove("show"),
    3500,
  );
}
function rememberViews() {
  views.forEach((view, pane) => {
    const key = pane + ":" + viewFiles.get(view);
    paneSelections.set(key, view.state.selection);
    paneScroll.set(key, {
      top: view.scrollDOM.scrollTop,
      left: view.scrollDOM.scrollLeft,
    });
  });
}
function restoreViews(data) {
  paneSelections.clear();
  paneScroll.clear();
  for (const entry of data?.viewStates || []) {
    const key = entry.pane + ":" + entry.fileId;
    paneSelections.set(
      key,
      EditorSelection.create(
        entry.selection.ranges.map((range) =>
          EditorSelection.range(range.anchor, range.head),
        ),
        entry.selection.mainIndex,
      ),
    );
    paneScroll.set(key, { top: entry.scrollTop, left: entry.scrollLeft });
  }
}
function captureSession() {
  rememberViews();
  const viewStates = [];
  for (const [key, selection] of paneSelections) {
    const scroll = paneScroll.get(key) || { top: 0, left: 0 };
    viewStates.push({
      pane: Number(key[0]),
      fileId: key.slice(2),
      selection: {
        ranges: selection.ranges.map((range) => ({
          anchor: range.anchor,
          head: range.head,
        })),
        mainIndex: selection.mainIndex,
      },
      scrollTop: scroll.top,
      scrollLeft: scroll.left,
    });
  }
  return {
    files,
    active,
    tabs,
    settings,
    workspace,
    split,
    paneFiles,
    viewStates,
  };
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = captureSession();
    try {
      localStorage.setItem(STORAGE, JSON.stringify(data));
    } catch {
      if (!native) {
        document.querySelector("#session").textContent =
          "会话保存失败，请下载备份";
        toast("浏览器存储空间不足或不可用，请下载文件备份。");
      }
    }
    if (native && nativeSessionReady) {
      native
        .saveSession({ data })
        .then(() => {
          document.querySelector("#session").textContent = "本机会话已保存";
        })
        .catch((error) => {
          document.querySelector("#session").textContent = "本机会话保存失败";
          toast("本机会话保存失败：" + error.message);
        });
    } else if (!native)
      document.querySelector("#session").textContent = "会话已保存在此浏览器";
  }, 300);
}
restoreViews(restored);

function lang(name) {
  switch (name.split(".").pop().toLowerCase()) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: /tsx?$/.test(name) });
    case "json":
      return json();
    case "html":
      return html();
    case "css":
      return css();
    case "md":
      return markdown();
    case "py":
      return python();
    default:
      return [];
  }
}
function languageName(name) {
  return (
    {
      js: "JavaScript",
      jsx: "JavaScript JSX",
      ts: "TypeScript",
      tsx: "TypeScript JSX",
      json: "JSON",
      html: "HTML",
      css: "CSS",
      md: "Markdown",
      py: "Python",
    }[name.split(".").pop()] || "纯文本"
  );
}
function effectiveSettings(file) {
  return { ...settings, ...file?.editorOverrides };
}
function editorTheme(configuration = settings) {
  return [
    configuration.light ? [] : monokai,
    EditorView.theme({
      "&": { fontSize: configuration.fontSize + "px", height: "100%" },
      ".cm-scroller": {
        fontFamily: '"SFMono-Regular",Consolas,"Liberation Mono",monospace',
        lineHeight: "1.45",
      },
      ".cm-content": { padding: "3px 0" },
      ".cm-line": { padding: "0 8px" },
      ".cm-gutters": { paddingLeft: "5px", border: "none" },
      "&.cm-focused": { outline: "none" },
    }),
  ];
}
function createState(f) {
  const localSettings = effectiveSettings(f);
  const config = {
    theme: new Compartment(),
    wrap: new Compartment(),
    lang: new Compartment(),
    indent: new Compartment(),
  };
  const state = EditorState.create({
    doc: f.content,
    extensions: [
      basicSetup,
      EditorState.allowMultipleSelections.of(true),
      config.indent.of([
        indentUnit.of(
          localSettings.useTabs ? "\t" : " ".repeat(localSettings.indentSize),
        ),
        EditorState.tabSize.of(localSettings.indentSize),
      ]),
      keymap.of([indentWithTab, { key: "Mod-d", run: selectNextOccurrence }]),
      config.theme.of(editorTheme(localSettings)),
      config.wrap.of(localSettings.wrap ? EditorView.lineWrapping : []),
      config.lang.of(lang(f.name)),
      EditorView.domEventHandlers({
        focus: (_, v) => {
          focused = v;
          active = viewFiles.get(v) || active;
          renderTabs();
          renderTree();
          document.querySelector("#breadcrumbs").textContent =
            (workspace?.name || "工作区") + " › " + current().name;
          status(v);
          plugins?.event("on_activated", { documentId: active });
          persist();
        },
      }),
      EditorView.updateListener.of((update) => {
        const id = viewFiles.get(update.view) || f.id;
        const target = files.find((file) => file.id === id);
        if (!target) return;
        if (update.docChanged || update.selectionSet)
          target.version =
            (Number.isInteger(target.version) ? target.version : 0) + 1;
        workbench?.observe(update);
        if (update.docChanged)
          plugins?.event("on_modified", { documentId: id });
        else if (update.selectionSet)
          plugins?.event("on_selection_modified", { documentId: id });
        if (update.docChanged) {
          if (settings.bookmarks?.[id])
            settings.bookmarks[id] = settings.bookmarks[id].map((position) =>
              update.changes.mapPos(position),
            );
          target.content = update.state.doc.toString();
          states.set(id, { state: update.state, config });
          if (!syncing) {
            syncing = true;
            for (const other of views)
              if (other !== update.view && viewFiles.get(other) === id) {
                const selection = other.state.selection.map(update.changes);
                const scroll = other.scrollDOM.scrollTop;
                other.setState(update.state.update({ selection }).state);
                requestAnimationFrame(() => {
                  other.scrollDOM.scrollTop = scroll;
                });
              }
            syncing = false;
          }
          renderTabs();
          renderTree();
          persist();
        }
        if (
          update.selectionSet &&
          !update.docChanged &&
          !navigatingBack &&
          Math.abs(
            update.startState.selection.main.head -
              update.state.selection.main.head,
          ) > 30
        ) {
          navigationHistory.push({
            id,
            position: update.startState.selection.main.head,
          });
          if (navigationHistory.length > 100) navigationHistory.shift();
        }
        if (update.selectionSet || update.docChanged) {
          states.set(id, { state: update.state, config });
          if (update.view === focused) status(update.view);
          for (const map of minimaps) map.draw();
          persist();
        }
      }),
    ],
  });
  return { state, config };
}
function mount(preferredIndex = 0) {
  for (const map of minimaps) map.destroy();
  minimaps = [];
  rememberViews();
  views.forEach((view) => view.destroy());
  views = [];
  focused = null;
  const host = document.querySelector("#editors");
  if (!paneFiles.length) paneFiles = [active, active];
  if (!split) paneFiles[0] = active;
  const ids = split ? paneFiles.slice(0, 2) : [active];
  host.innerHTML = "";
  host.classList.toggle("split", split);
  ids.forEach((id, index) => {
    const target = files.find((f) => f.id === id) || current();
    paneFiles[index] = target.id;
    const pane = document.createElement("div");
    pane.className = "editor-pane" + (index ? " secondary" : "");
    pane.innerHTML = `<div class="pane-heading"><select aria-label="${index + 1} 栏文件">${files.map((f) => `<option value="${esc(f.id)}" ${f.id === target.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select><span>${index + 1} 栏</span></div><div class="editor-surface"><div class="code-host"></div></div>`;
    host.append(pane);
    const entry = states.get(target.id) || createState(target);
    states.set(target.id, entry);
    const surface = pane.querySelector(".editor-surface");
    const selection = paneSelections.get(index + ":" + target.id);
    const paneState =
      selection &&
      selection.ranges.every((range) => range.to <= entry.state.doc.length)
        ? entry.state.update({ selection }).state
        : entry.state;
    const view = new EditorView({
      state: paneState,
      parent: pane.querySelector(".code-host"),
    });
    views.push(view);
    viewFiles.set(view, target.id);
    compartments.set(view, entry.config);
    const scroll = paneScroll.get(index + ":" + target.id);
    if (scroll)
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = scroll.top;
        view.scrollDOM.scrollLeft = scroll.left;
      });
    view.scrollDOM.addEventListener("scroll", persist);
    if (settings.minimap !== false) minimaps.push(attachMinimap(view, surface));
    pane.querySelector("select").addEventListener("change", (event) => {
      focused = view;
      activate(event.target.value);
    });
  });
  focused = views[Math.min(preferredIndex, views.length - 1)];
  active = viewFiles.get(focused);
  status(focused);
  document.querySelector("#breadcrumbs").textContent =
    (workspace?.name || "工作区") + " › " + current().name;
}
function activate(id) {
  if (!files.some((f) => f.id === id)) return;
  if (!tabs.includes(id)) tabs.push(id);
  if (focused && id !== active && !navigatingBack) {
    navigationHistory.push({
      id: active,
      position: focused.state.selection.main.head,
    });
    if (navigationHistory.length > 100) navigationHistory.shift();
  }
  const index = Math.max(0, views.indexOf(focused));
  active = id;
  paneFiles[index] = id;
  mount(index);
  renderTabs();
  renderTree();
  persist();
}
function replaceDocument(id, content) {
  const target = files.find((f) => f.id === id);
  if (!target) return;
  content = normalizeText(content);
  const visible = views.find((v) => viewFiles.get(v) === id);
  if (visible)
    visible.dispatch({
      changes: { from: 0, to: visible.state.doc.length, insert: content },
    });
  else {
    const entry = states.get(id) || createState(target);
    entry.state = entry.state.update({
      changes: { from: 0, to: entry.state.doc.length, insert: content },
    }).state;
    states.set(id, entry);
    target.content = content;
    target.version = (target.version || 0) + 1;
  }
  renderTabs();
  renderTree();
  persist();
}

function refreshFileLabels() {
  for (const view of views) {
    const select = view.dom.closest(".editor-pane")?.querySelector("select");
    const id = viewFiles.get(view);
    if (select)
      select.innerHTML = files
        .map(
          (file) =>
            `<option value="${esc(file.id)}" ${file.id === id ? "selected" : ""}>${esc(file.name)}</option>`,
        )
        .join("");
  }
  document.querySelector("#breadcrumbs").textContent =
    (workspace?.name || "工作区") + " › " + current().name;
  status();
}
function renderTabs() {
  document.querySelector("#tabs").innerHTML = tabs
    .map((id) => {
      const f = files.find((x) => x.id === id);
      return `<div class="tab ${id === active ? "active" : ""}"><button class="tab-name" data-file="${esc(id)}">${esc(f.name.split("/").pop())}${dirty(f) ? '<span class="dirty" title="未保存更改">●</span>' : ""}</button><button class="close" aria-label="关闭 ${esc(f.name)}" data-close="${esc(id)}">×</button></div>`;
    })
    .join("");
  renderOpenFiles();
}
function renderOpenFiles() {
  const host = document.querySelector("#open-files");
  if (!host) return;
  host.innerHTML = tabs
    .map((id) => {
      const file = files.find((file) => file.id === id);
      return `<div class="open-file-row ${id === active ? "selected" : ""}"><button data-file="${esc(id)}" title="${esc(file.path || file.name)}"><span class="document-icon">▱</span>${esc(file.name.split("/").pop())}</button><button class="open-file-close" data-close="${esc(id)}" aria-label="关闭 ${esc(file.name)}">${dirty(file) ? "●" : "×"}</button></div>`;
    })
    .join("");
}
function renderTree() {
  const query = document.querySelector("#tree-filter").value;
  const collapsed = new Set(settings.collapsedFolders || []);
  const nodes = folderNodes(files, diskTree, workspace, query);
  document.querySelector("#file-count").textContent = files.length + " 个文件";
  document.querySelector("#tree").innerHTML =
    nodes
      .filter(
        (node) =>
          query || !node.parents.some((parent) => collapsed.has(parent)),
      )
      .map((node) => {
        if (node.kind === "directory")
          return `<button class="tree-directory" data-directory="${esc(node.key)}" style="--depth:${node.depth}" aria-expanded="${!collapsed.has(node.key)}"><span class="tree-disclosure">${collapsed.has(node.key) ? "▸" : "▾"}</span><span class="folder-icon"></span><span>${esc(node.name)}</span></button>`;
        const file = files.find((file) => file.id === node.loadedId);
        return `<button class="tree-file ${node.loadedId === active ? "selected" : ""}" ${node.loadedId ? `data-file="${esc(node.loadedId)}"` : `data-path="${esc(node.path)}"`} style="--depth:${node.depth}" title="${esc(node.path || node.key)}"><span class="tree-disclosure"></span><span class="document-icon">▱</span><span>${esc(node.name)}</span>${file && dirty(file) ? "<b>●</b>" : ""}</button>`;
      })
      .join("") || '<div class="empty">没有文件</div>';
  renderOpenFiles();
}

function status(view = focused) {
  if (!view) return;
  const selection = view.state.selection;
  const pos = selection.main.head;
  const line = view.state.doc.lineAt(pos);
  document.querySelector("#cursor").textContent =
    `Line ${line.number}, Column ${pos - line.from + 1}${selection.ranges.length > 1 ? " · " + selection.ranges.length + " 个光标" : ""}${selection.main.empty ? "" : " · 已选 " + (selection.main.to - selection.main.from) + " 字符"}`;
  document.querySelector("#language").textContent = languageName(
    current().name,
  );
  document.querySelector("#lines").textContent = view.state.doc.lines + " 行";
  document.querySelector("#encoding").textContent = (
    current().encoding || "utf-8"
  ).toUpperCase();
  document.querySelector("#line-ending").textContent =
    current().lineEnding || "LF";
  document.querySelector("#indent-status").textContent =
    "Tab Size: " + effectiveSettings(current()).indentSize;
  document.title = current().name.split("/").pop() + " — easy text";
}
function closeTab(id) {
  plugins
    ?.event("on_close", { documentId: id, immediate: true })
    .catch((error) => toast(error.message));
  tabs = tabs.filter((t) => t !== id);
  if (!tabs.length) {
    toast("已保留最后一个标签；文件仍在工作区中。");
    tabs = [id];
  }
  if (active === id) activate(tabs[tabs.length - 1]);
  else renderTabs();
  persist();
}
let namingAction = null;
function askName(title, value, action) {
  namingAction = action;
  document.querySelector("#name-title").textContent = title;
  document.querySelector("#name-hint").textContent = /新建文件|重命名/.test(
    title,
  )
    ? "支持目录路径，例如 src/app.js"
    : /编码/.test(title)
      ? "选择编码后仍需保存；修改标记会保留到成功写入。"
      : /换行/.test(title)
        ? "选择 LF、CRLF 或 CR；保存时按选择转换换行格式。"
        : /缩进/.test(title)
          ? "设置编辑器缩进单位，不会自动改写已有文本。"
          : "确认后执行该操作。";
  document.querySelector("#name-input").setAttribute("aria-label", title);
  const input = document.querySelector("#name-input");
  input.value = value;
  document.querySelector("#name-dialog").showModal();
  input.focus();
  input.select();
}
function newFile() {
  askName("新建文件", "untitled.js", async (name) => {
    if (native && workspace) {
      try {
        const created = await receiveNative(
          await native.createFile({
            workspaceId: workspace.id,
            relativePath: name,
            content: "",
          }),
          true,
        );
        plugins?.event("on_new", { documentId: created.id });
      } catch (error) {
        toast("新建失败：" + error.message);
      }
      return;
    }
    const f = file(uniqueName(name, files), "");
    files.push(f);
    activate(f.id);
    focused.focus();
    plugins?.event("on_new", { documentId: f.id });
  });
}
function rename() {
  const f = current();
  askName("重命名文件", f.name, async (name) => {
    if (name === f.name) return;
    if (files.some((x) => x.id !== f.id && x.name === name))
      return toast("已有同名文件，请使用其他名称。");
    if (native && f.path) {
      try {
        const result = await native.renameFile({
          path: f.path,
          newName: name,
          revision: f.revision,
        });
        Object.assign(f, {
          path: result.path,
          name: result.name,
          revision: result.revision,
        });
      } catch (error) {
        return toast(error.message);
      }
    } else f.name = name;
    for (const v of views.filter((view) => viewFiles.get(view) === f.id))
      v.dispatch({
        effects: compartments.get(v).lang.reconfigure(lang(f.name)),
      });
    states.set(active, {
      state: focused.state,
      config: compartments.get(focused),
    });
    renderTree();
    renderTabs();
    refreshFileLabels();
    if (native && workspace) {
      try {
        diskTree = (await native.listTree({ workspaceId: workspace.id })).tree;
        renderTree();
      } catch {}
    }
    status();
    persist();
  });
}
async function receiveNative(data, shouldActivate = false, force = false) {
  const existing = files.find((f) => f.path === data.path);
  const content = normalizeText(data.content);
  const target = existing || file(data.name, content);
  if (existing && dirty(existing) && !force) {
    if (content !== existing.saved) {
      existing.externalConflict = true;
      toast(
        "磁盘内容与未保存缓冲区冲突，已保留输入。请另存为或明确重新读取：" +
          existing.name,
      );
    } else toast("保留现有未保存更改：" + existing.name);
    if (shouldActivate) activate(existing.id);
    return existing;
  }
  if (existing) replaceDocument(target.id, content);
  Object.assign(target, data, {
    id: target.id,
    content,
    saved: content,
    externalConflict: false,
  });
  if (!existing) files.push(target);
  if (shouldActivate) activate(target.id);
  if (!existing) plugins?.event("on_load", { documentId: target.id });
  renderTree();
  renderTabs();
  persist();
  return target;
}
async function openPath(path) {
  const existing = files.find((f) => f.path === path);
  if (existing) {
    activate(existing.id);
    return existing;
  }
  const data = await native.readFile({ path });
  return receiveNative(data, true);
}
async function openFiles() {
  if (!native) return document.querySelector("#file-input").click();
  try {
    const result = await native.openFiles();
    for (const data of result?.files || []) await receiveNative(data, true);
  } catch (error) {
    toast(error.message);
  }
}
async function openProject() {
  if (!native) return document.querySelector("#folder-input").click();
  try {
    const result = await native.openProject();
    if (!result?.workspace) return;
    workspace = result.workspace;
    diskTree = result.tree || [];
    document.querySelector(".project-heading span").textContent =
      workspace.name;
    renderTree();
    persist();
    toast("项目已打开：" + workspace.path);
  } catch (error) {
    toast(error.message);
  }
}
async function save(asNew = false) {
  const target = current();
  if (native) {
    try {
      await plugins?.event("on_pre_save", {
        immediate: true,
        documentId: target.id,
      });
      if (target.externalConflict && !asNew)
        throw new Error("缓冲区存在外部修改冲突，请另存为或重新读取磁盘文件");
      if (target.lineEnding === "mixed") {
        return askName(
          "混合换行：输入 LF、CRLF 或 CR 以明确规范化",
          "LF",
          (ending) => {
            if (!["LF", "CRLF", "CR"].includes(ending))
              return toast("换行格式无效");
            target.lineEnding = ending;
            save(asNew);
          },
        );
      }
      const captured = target.content;
      const capturedFormat = fileFormat(target);
      const result =
        target.path && !asNew
          ? await native.saveFile({
              path: target.path,
              content: captured,
              revision: target.revision,
              ...capturedFormat,
            })
          : await native.saveAs({
              content: captured,
              suggestedName: target.name,
              ...capturedFormat,
            });
      if (!result) return;
      applySaveResult(target, captured, capturedFormat, result);
      refreshFileLabels();
      renderTabs();
      renderTree();
      persist();
      toast("已保存到磁盘：" + target.path);
      plugins?.event("on_post_save", { documentId: target.id });
    } catch (error) {
      toast("保存失败：" + error.message);
    }
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(
    new Blob([target.content], { type: "text/plain;charset=utf-8" }),
  );
  anchor.download = target.name.split("/").pop();
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  toast("已发起下载；浏览器无法验证落盘，修改标记保留。");
}

async function importFiles(list) {
  let skipped = 0;
  let imported = 0;
  for (const source of list) {
    try {
      if (source.size > 5 * 1024 * 1024) {
        skipped++;
        continue;
      }
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await source.arrayBuffer(),
      );
      if (content.includes("\0")) {
        skipped++;
        continue;
      }
      files.push(
        file(
          uniqueName(source.webkitRelativePath || source.name, files),
          content,
        ),
      );
      imported++;
    } catch {
      skipped++;
    }
  }
  if (imported) activate(files.at(-1).id);
  toast(
    `导入 ${imported} 个文件${skipped ? "；跳过 " + skipped + " 个非 UTF-8、二进制、读取失败或超过 5MB 的文件" : ""}`,
  );
}
function reconfigure() {
  document.body.classList.toggle("light", settings.light);
  for (const [id, entry] of states) {
    const localSettings = effectiveSettings(
      files.find((file) => file.id === id),
    );
    entry.state = entry.state.update({
      effects: [
        entry.config.theme.reconfigure(editorTheme(localSettings)),
        entry.config.indent.reconfigure([
          indentUnit.of(
            localSettings.useTabs ? "\t" : " ".repeat(localSettings.indentSize),
          ),
          EditorState.tabSize.of(localSettings.indentSize),
        ]),
        entry.config.wrap.reconfigure(
          localSettings.wrap ? EditorView.lineWrapping : [],
        ),
      ],
    }).state;
  }
  mount();
  persist();
}
function run(command) {
  command(focused);
  focused?.focus();
}
const commands = [
  ["file.new", "新建文件", "⌘ N", newFile],
  ["file.open", "打开文件", "", openFiles],
  ["folder.open", "打开文件夹", "", openProject],
  ["file.save", native ? "保存到磁盘" : "下载当前文件", "⌘ S", save],
  ["file.rename", "重命名当前文件", "", rename],
  ["edit.undo", "撤销", "⌘ Z", () => run(undo)],
  ["edit.redo", "重做", "⇧ ⌘ Z", () => run(redo)],
  ["edit.find", "查找 / 替换（支持正则）", "⌘ F", () => run(openSearchPanel)],
  ["edit.comment", "切换行注释", "⌘ /", () => run(toggleComment)],
  ["edit.next", "选择下一个相同文本", "⌘ D", () => run(selectNextOccurrence)],
  ["goto.line", "跳转到行", "⌃ G", () => run(gotoLine)],
  ["fold.all", "折叠全部代码", "", () => run(foldAll)],
  ["unfold.all", "展开全部代码", "", () => run(unfoldAll)],
  [
    "view.split",
    "切换独立文档分栏",
    "",
    () => {
      split = !split;
      if (split) {
        paneFiles = [active, files.find((f) => f.id !== active)?.id || active];
      }
      mount();
      document
        .querySelector('[data-action="split"]')
        .classList.toggle("on", split);
      persist();
    },
  ],
  [
    "view.wrap",
    "切换自动换行",
    "",
    () => {
      settings.wrap = !settings.wrap;
      reconfigure();
      toast(settings.wrap ? "自动换行已开启" : "自动换行已关闭");
    },
  ],
  [
    "view.theme",
    "切换浅色 / 深色主题",
    "",
    () => {
      settings.light = !settings.light;
      reconfigure();
    },
  ],
  [
    "view.larger",
    "增大编辑器字号",
    "",
    () => {
      settings.fontSize = Math.min(24, settings.fontSize + 1);
      reconfigure();
    },
  ],
  [
    "view.smaller",
    "减小编辑器字号",
    "",
    () => {
      settings.wrap = settings.wrap === true;
      settings.light = settings.light === true;
      settings.fontSize = Math.max(10, settings.fontSize - 1);
      reconfigure();
    },
  ],
  [
    "text.upper",
    "文本转换：大写（选区或全文）",
    "",
    () => transformText("upper"),
  ],
  [
    "text.lower",
    "文本转换：小写（选区或全文）",
    "",
    () => transformText("lower"),
  ],
  ["text.sort", "按行排序（选区或全文）", "", () => transformText("sort")],
  [
    "text.unique",
    "去除重复行（选区或全文）",
    "",
    () => transformText("unique"),
  ],
  [
    "project.search",
    "项目查找与替换（文本 / 正则）",
    "⇧ ⌘ F",
    () => workbench.search(),
  ],
  ["project.export", "导出工作区 JSON 备份", "", exportWorkspace],
  [
    "project.import",
    "合并导入工作区 JSON 文件",
    "",
    () => document.querySelector("#workspace-input").click(),
  ],
  ["help", "快捷键与使用说明", "", () => showHelp()],
];
let paletteMode = "commands",
  paletteIndex = 0,
  paletteItems = [];
function openPalette(mode) {
  paletteMode = mode;
  paletteIndex = 0;
  const d = document.querySelector("#palette");
  d.showModal();
  document.querySelector("#palette-title").textContent =
    mode === "files"
      ? "快速打开文件"
      : mode === "search"
        ? "快速文本定位 · 已打开文件"
        : "命令面板";
  const input = document.querySelector("#palette-query");
  input.value = "";
  input.placeholder =
    mode === "files"
      ? "输入文件名或路径…"
      : mode === "search"
        ? "输入需要查找的文本…"
        : "输入命令，例如：换行、分栏、主题…";
  renderPalette();
  input.focus();
}
function highlightedName(name, ranges = []) {
  let output = "",
    position = 0;
  for (const range of ranges) {
    if (range.from >= name.length) break;
    output +=
      esc(name.slice(position, range.from)) +
      "<mark>" +
      esc(name.slice(range.from, Math.min(range.to, name.length))) +
      "</mark>";
    position = Math.min(range.to, name.length);
  }
  return output + esc(name.slice(position));
}
function renderPalette() {
  const query = document.querySelector("#palette-query").value;
  paletteItems =
    paletteMode === "search"
      ? workspaceMatches(query)
      : paletteMode === "files"
        ? rankFiles(files, query).map(({ file, match }) => ({
            name: file.name,
            hint: languageName(file.name),
            match,
            fn: () => activate(file.id),
          }))
        : commands
            .map((command, index) => ({
              command,
              index,
              match: fuzzyMatch(query, command[1] + " " + command[0]),
            }))
            .filter((result) => result.match.score > -Infinity)
            .sort((a, b) => b.match.score - a.match.score || a.index - b.index)
            .map(({ command, match }) => ({
              name: command[1],
              hint: command[2],
              fn: command[3],
              match,
            }));
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));
  document.querySelector("#palette-results").innerHTML =
    paletteItems
      .map(
        (item, index) =>
          `<button class="palette-row ${index === paletteIndex ? "chosen" : ""}" data-choice="${index}"><span>${highlightedName(item.name, item.match?.ranges)}</span><kbd>${esc(item.hint)}</kbd></button>`,
      )
      .join("") || '<div class="empty">没有匹配结果</div>';
}

function choose(index) {
  document.querySelector("#palette").close();
  paletteItems[index]?.fn();
}
function transformText(mode) {
  const view = focused;
  const ranges = view.state.selection.ranges;
  const hasSelection = ranges.some((r) => !r.empty);
  const targets = hasSelection
    ? ranges.filter((r) => !r.empty)
    : [{ from: 0, to: view.state.doc.length }];
  const convert = (text) => {
    if (mode === "upper") return text.toUpperCase();
    if (mode === "lower") return text.toLowerCase();
    const lines = text.split("\n");
    return (
      mode === "sort"
        ? lines.sort((a, b) => a.localeCompare(b))
        : [...new Set(lines)]
    ).join("\n");
  };
  view.dispatch({
    changes: targets.map((r) => ({
      from: r.from,
      to: r.to,
      insert: convert(view.state.sliceDoc(r.from, r.to)),
    })),
  });
  view.focus();
}
function exportWorkspace() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(
      [JSON.stringify({ version: 1, files, active, tabs, settings }, null, 2)],
      { type: "application/json" },
    ),
  );
  a.download = "easy-text-workspace.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("已发起工作区备份下载（所有文件和设置）");
}
async function importWorkspace(source) {
  try {
    const data = JSON.parse(await source.text());
    if (!validSession(data)) throw new Error("文件格式无效");
    for (const f of data.files)
      files.push({
        id: crypto.randomUUID(),
        name: uniqueName(f.name, files),
        content: normalizeText(f.content),
        saved: normalizeText(f.saved),
      });
    activate(files.at(-1).id);
    toast("已合并导入工作区文件；当前设置保留");
  } catch (error) {
    toast("无法导入工作区：" + error.message);
  }
}
function workspaceMatches(query) {
  if (!query) return [];
  const results = [];
  const needle = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  for (const f of files) {
    let offset = 0;
    for (const [index, line] of f.content.split("\n").entries()) {
      const match = needle.exec(line);
      if (match) {
        const from = offset + match.index;
        results.push({
          name: f.name + ":" + (index + 1) + " · " + line.trim().slice(0, 100),
          hint: "文本匹配",
          fn: () => {
            activate(f.id);
            focused.dispatch({
              selection: { anchor: from, head: from + match[0].length },
              scrollIntoView: true,
            });
            focused.focus();
          },
        });
      }
      offset += line.length + 1;
      if (results.length >= 100) return results;
    }
  }
  return results;
}
function showHelp() {
  document.querySelector("#help").showModal();
}

document.querySelector("#app").innerHTML = renderShell();
document.body.classList.toggle("desktop", Boolean(native));

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.directory) {
    const collapsed = new Set(settings.collapsedFolders || []);
    collapsed.has(b.dataset.directory)
      ? collapsed.delete(b.dataset.directory)
      : collapsed.add(b.dataset.directory);
    settings.collapsedFolders = [...collapsed];
    renderTree();
    persist();
  }
  if (b.dataset.file) activate(b.dataset.file);
  if (b.dataset.path)
    openPath(b.dataset.path).catch((error) => toast(error.message));
  if (b.dataset.close) closeTab(b.dataset.close);
  if (b.dataset.dismiss) document.getElementById(b.dataset.dismiss).close();
  if (b.dataset.choice !== undefined) choose(+b.dataset.choice);
  const actions = {
    new: newFile,
    previousTab: () =>
      activate(tabs[(tabs.indexOf(active) - 1 + tabs.length) % tabs.length]),
    nextTab: () => activate(tabs[(tabs.indexOf(active) + 1) % tabs.length]),
    toggleOpenFiles: () => {
      const host = document.querySelector("#open-files");
      host.hidden = !host.hidden;
      b.setAttribute("aria-expanded", String(!host.hidden));
      b.textContent = "OPEN FILES";
    },
    toggleFolders: () => {
      const host = document.querySelector("#tree");
      host.hidden = !host.hidden;
      b.setAttribute("aria-expanded", String(!host.hidden));
      b.textContent = host.hidden ? "▸" : "▾";
    },
    treeFilter: () => {
      document.querySelector(".sidebar").classList.toggle("filter-open");
      document.querySelector("#tree-filter").focus();
    },
    open: openFiles,
    folder: openProject,
    find: () => run(openSearchPanel),
    commands: () => openPalette("commands"),
    files: () => openPalette("files"),
    view: () => openPalette("commands"),
    indentSettings: () =>
      commands.find((command) => command[0] === "indent.configure")[3](),
    settings: () => {
      openPalette("commands");
      document.querySelector("#palette-query").value = "view.";
      renderPalette();
    },
    help: showHelp,
    outline: () => workbench.outline(),
    projectSearch: () => workbench.search(),
    git: () => workbench.git(),
    build: () => workbench.build(),
    split: commands.find((c) => c[0] === "view.split")[3],
    rename,
    sidebar: () => {
      const sidebar = document.querySelector(".sidebar");
      sidebar.classList.toggle(
        matchMedia("(max-width:700px)").matches ? "mobile-open" : "hidden",
      );
    },
  };
  actions[b.dataset.action]?.();
});
document.querySelector("#name-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = document.querySelector("#name-input").value.trim();
  if (!value) return;
  document.querySelector("#name-dialog").close();
  namingAction?.(value);
});
document
  .querySelector("#workspace-input")
  .addEventListener("change", async (e) => {
    if (e.target.files[0]) await importWorkspace(e.target.files[0]);
    e.target.value = "";
  });
document.querySelector("#tree-filter").addEventListener("input", renderTree);
document.querySelector("#file-input").addEventListener("change", async (e) => {
  await importFiles([...e.target.files]);
  e.target.value = "";
});
document
  .querySelector("#folder-input")
  .addEventListener("change", async (e) => {
    await importFiles([...e.target.files]);
    e.target.value = "";
  });
document.querySelector("#palette-query").addEventListener("input", () => {
  paletteIndex = 0;
  renderPalette();
});
document.querySelector("#palette-query").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    paletteIndex = Math.max(
      0,
      Math.min(
        paletteItems.length - 1,
        paletteIndex + (e.key === "ArrowDown" ? 1 : -1),
      ),
    );
    renderPalette();
    document.querySelector(".chosen")?.scrollIntoView({ block: "nearest" });
  }
  if (e.key === "Enter") {
    e.preventDefault();
    choose(paletteIndex);
  }
});
document.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const key = e.key.toLowerCase();
  if (key === "p") {
    e.preventDefault();
    if (document.querySelector("#palette").open)
      document.querySelector("#palette").close();
    openPalette(e.shiftKey ? "commands" : "files");
  }
  if (key === "f" && e.shiftKey) {
    e.preventDefault();
    workbench.search();
  }
  if (key === "s") {
    e.preventDefault();
    save(e.shiftKey);
  }
  if (key === "n") {
    e.preventDefault();
    newFile();
  }
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]);
});
window.addEventListener("beforeunload", () => {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE, JSON.stringify(captureSession()));
  } catch {}
});
function toggleBookmark() {
  settings.bookmarks ||= {};
  const position = focused.state.doc.lineAt(
    focused.state.selection.main.head,
  ).from;
  const bookmarks = (settings.bookmarks[active] ||= []);
  const index = bookmarks.indexOf(position);
  if (index >= 0) bookmarks.splice(index, 1);
  else bookmarks.push(position);
  toast(index >= 0 ? "已移除书签" : "已在当前行添加书签");
  persist();
}
function nextBookmark(direction) {
  const positions = [...(settings.bookmarks?.[active] || [])].sort(
    (a, b) => a - b,
  );
  if (!positions.length) return toast("当前文件没有书签");
  const cursor = focused.state.selection.main.head;
  const target =
    direction > 0
      ? (positions.find((position) => position > cursor) ?? positions[0])
      : (positions.filter((position) => position < cursor).at(-1) ??
        positions.at(-1));
  focused.dispatch({
    selection: { anchor: Math.min(target, focused.state.doc.length) },
    scrollIntoView: true,
  });
  focused.focus();
}
function navigateBack() {
  const previous = navigationHistory.pop();
  if (!previous) return toast("没有更早的导航位置");
  navigatingBack = true;
  try {
    activate(previous.id);
    focused.dispatch({
      selection: {
        anchor: Math.min(previous.position, focused.state.doc.length),
      },
      scrollIntoView: true,
    });
    focused.focus();
  } finally {
    navigatingBack = false;
  }
}
function moveTab(direction) {
  const index = tabs.indexOf(active);
  const next = index + direction;
  if (next < 0 || next >= tabs.length) return;
  [tabs[index], tabs[next]] = [tabs[next], tabs[index]];
  renderTabs();
  persist();
}
function convertIndent(mode) {
  const text = current().content;
  const content =
    mode === "tabs"
      ? text.replace(/^(?: {2})+/gm, (spaces) => "\t".repeat(spaces.length / 2))
      : text.replace(/^\t+/gm, (tabs) =>
          " ".repeat(tabs.length * settings.indentSize),
        );
  replaceDocument(active, content);
}
workbench = createWorkbench({
  native,
  workspace: () => workspace,
  files: () => files,
  current,
  view: () => focused,
  activate,
  openPath,
  receiveNative,
  replace: replaceDocument,
  toast,
  commands: () => commands,
});
commands.push(
  ...workbench.commands,
  ["file.close", "关闭当前标签", "⌘ W", () => closeTab(active)],
  [
    "selection.split",
    "将选区拆分为行",
    "",
    () => {
      try {
        focused.dispatch({ selection: selectionsByLine(focused.state) });
        focused.focus();
      } catch (error) {
        toast(error.message);
      }
    },
  ],
  ["selection.above", "在上一行添加光标", "", () => run(addCursorAbove)],
  ["selection.below", "在下一行添加光标", "", () => run(addCursorBelow)],
  ["plugins.manage", "插件管理 / Python API 子集", "", () => plugins.open()],
  [
    "view.sidebar",
    "切换侧栏",
    "",
    () => document.querySelector(".sidebar").classList.toggle("hidden"),
  ],
  ["commands.show", "命令面板", "⇧ ⌘ P", () => openPalette("commands")],
  ["file.quick", "快速打开文件", "⌘ P", () => openPalette("files")],
  [
    "indent.configure",
    "设置缩进宽度（2 / 4 / 8 空格）",
    "",
    () =>
      askName("缩进宽度：2、4 或 8", String(settings.indentSize), (value) => {
        if (![2, 4, 8].includes(Number(value))) return toast("缩进宽度无效");
        settings.indentSize = Number(value);
        reconfigure();
      }),
  ],
  ["line.up", "向上移动行", "", () => run(moveLineUp)],
  ["line.down", "向下移动行", "", () => run(moveLineDown)],
  ["line.copyUp", "向上复制行", "", () => run(copyLineUp)],
  ["line.copyDown", "向下复制行", "", () => run(copyLineDown)],
  ["line.select", "选择当前行", "", () => run(selectLine)],
  ["line.delete", "删除当前行", "", () => run(deleteLine)],
  ["line.split", "拆分当前行", "", () => run(splitLine)],
  ["text.transpose", "交换光标附近字符", "", () => run(transposeChars)],
  ["indent.more", "增加缩进", "Tab", () => run(indentMore)],
  ["indent.less", "减少缩进", "Shift Tab", () => run(indentLess)],
  ["indent.auto", "按语法重新缩进选区", "", () => run(indentSelection)],
  ["indent.tabs", "将行首空格缩进转换为 Tab", "", () => convertIndent("tabs")],
  ["indent.spaces", "将行首 Tab 转换为空格", "", () => convertIndent("spaces")],
  ["bookmark.toggle", "切换当前行书签", "", toggleBookmark],
  ["bookmark.next", "跳转下一个书签", "", () => nextBookmark(1)],
  ["bookmark.previous", "跳转上一个书签", "", () => nextBookmark(-1)],
  ["navigation.back", "返回上一个导航位置", "", navigateBack],
  [
    "tabs.closeOthers",
    "关闭其他标签（保留缓冲区）",
    "",
    () => {
      tabs = [active];
      renderTabs();
      persist();
    },
  ],
  [
    "tabs.closeRight",
    "关闭右侧标签（保留缓冲区）",
    "",
    () => {
      tabs = tabs.slice(0, tabs.indexOf(active) + 1);
      renderTabs();
      persist();
    },
  ],
  ["tabs.moveLeft", "将当前标签左移", "", () => moveTab(-1)],
  ["tabs.moveRight", "将当前标签右移", "", () => moveTab(1)],
  [
    "file.encoding",
    "选择保存编码（UTF-8 / UTF-16LE / UTF-16BE）",
    "",
    () => {
      if (!native) return toast("编码转换保存需要桌面版");
      askName(
        "保存编码：utf-8 / utf-16le / utf-16be",
        current().encoding || "utf-8",
        (encoding) => {
          if (!["utf-8", "utf-16le", "utf-16be"].includes(encoding))
            return toast("编码无效");
          current().encoding = encoding;
          current().formatDirty = true;
          renderTabs();
          renderTree();
          status();
          persist();
        },
      );
    },
  ],
  [
    "file.lineEnding",
    "选择保存换行格式（LF / CRLF / CR）",
    "",
    () => {
      if (!native) return toast("换行格式转换保存需要桌面版");
      askName(
        "保存换行格式：LF / CRLF / CR",
        current().lineEnding || "LF",
        (ending) => {
          if (!["LF", "CRLF", "CR"].includes(ending))
            return toast("换行格式无效");
          current().lineEnding = ending;
          current().formatDirty = true;
          renderTabs();
          renderTree();
          status();
          persist();
        },
      );
    },
  ],
  ["file.saveAs", "另存为…", "⇧ ⌘ S", () => save(true)],
  [
    "view.minimap",
    "切换真实文档概览",
    "",
    () => {
      settings.minimap = settings.minimap === false;
      mount();
      persist();
    },
  ],
  [
    "file.reload",
    "重新读取磁盘文件（将放弃当前更改）",
    "",
    () => {
      const f = current();
      if (!native || !f.path) return toast("当前文件不是桌面磁盘文件");
      askName("输入 RELOAD 放弃当前缓冲区更改", "", async (value) => {
        if (value === "RELOAD")
          try {
            await receiveNative(
              await native.readFile({ path: f.path }),
              false,
              true,
            );
            mount();
          } catch (error) {
            toast(error.message);
          }
      });
    },
  ],
);
function pluginSnapshot(documentId = active) {
  const ids = [...new Set([...tabs, ...(split ? paneFiles : []), documentId])];
  return {
    activeViewId: documentId,
    views: ids
      .map((id) => {
        const file = files.find((file) => file.id === id);
        if (!file) return null;
        const view =
          focused && viewFiles.get(focused) === id
            ? focused
            : views.find((view) => viewFiles.get(view) === id);
        const selection =
          view?.state.selection ||
          states.get(id)?.state.selection ||
          EditorSelection.single(0);
        const local = effectiveSettings(file);
        return {
          id: file.id,
          path: file.path || null,
          name: file.name,
          text: file.content,
          version: file.version || 0,
          selections: selection.ranges.map((range) => ({
            anchor: range.anchor,
            head: range.head,
          })),
          settings: {
            tab_size: local.indentSize,
            word_wrap: local.wrap,
            font_size: local.fontSize,
            translate_tabs_to_spaces: !local.useTabs,
          },
        };
      })
      .filter(Boolean),
    window: {
      id: "main",
      folders: workspace ? [workspace.path] : [],
      settings: {},
    },
  };
}
function assertPluginSnapshot(snapshot) {
  validatePluginSnapshot(snapshot, files, active);
}

function commitPluginDocuments(plans) {
  for (const plan of plans) {
    const entry = states.get(plan.file.id) || createState(plan.file);
    const selection = EditorSelection.create(
      plan.selections.map((range) =>
        EditorSelection.range(range.anchor, range.head),
      ),
      Math.min(entry.state.selection.mainIndex, plan.selections.length - 1),
    );
    if (!plan.changes.length && selection.eq(entry.state.selection)) continue;
    const spec = {
      changes: plan.changes,
      selection,
      annotations: isolateHistory.of("full"),
      scrollIntoView: true,
    };
    const view =
      focused && viewFiles.get(focused) === plan.file.id
        ? focused
        : views.find((view) => viewFiles.get(view) === plan.file.id);
    if (view) view.dispatch(spec);
    else {
      entry.state = entry.state.update(spec).state;
      states.set(plan.file.id, entry);
      plan.file.content = entry.state.doc.toString();
      plan.file.version = (plan.file.version || 0) + 1;
    }
  }
  renderTabs();
  renderTree();
  persist();
}
const pluginBuiltinAliases = {
  undo: "edit.undo",
  redo: "edit.redo",
  toggle_comment: "edit.comment",
  indent: "indent.more",
  unindent: "indent.less",
  upper_case: "text.upper",
  lower_case: "text.lower",
};
function canExecutePluginBuiltin(name) {
  return (
    ["insert", "append", "select_all"].includes(name) ||
    Object.hasOwn(pluginBuiltinAliases, name) ||
    commands.some(
      (command) =>
        command[0] === name &&
        /^(edit|line|text|indent|fold|unfold)\./.test(name),
    )
  );
}
plugins = createPluginController({
  native,
  files: () => files,
  commands: () => commands,
  toast,
  activate,
  snapshot: pluginSnapshot,
  assertSnapshot: assertPluginSnapshot,
  prepareDocuments: (documents) => preparePluginDocuments(documents, files),
  commitDocuments: commitPluginDocuments,
  canExecuteBuiltin: canExecutePluginBuiltin,
  show: (id, point) => {
    activate(id);
    focused.dispatch({ effects: EditorView.scrollIntoView(point) });
  },
  applySettings: (id, values) => {
    const patch = pluginSettingPatch(values);
    if (id) {
      const file = files.find((file) => file.id === id);
      file.editorOverrides = { ...file.editorOverrides, ...patch };
    } else Object.assign(settings, patch);
    reconfigure();
  },
  executeBuiltin: (name, args, id) => {
    if (id) activate(id);
    if (name === "insert") {
      focused.dispatch(focused.state.replaceSelection(args.characters));
      return;
    }
    if (name === "append") {
      focused.dispatch({
        changes: { from: focused.state.doc.length, insert: args.characters },
      });
      return;
    }
    if (name === "select_all") {
      selectAll(focused);
      return;
    }
    const command = commands.find(
      (command) => command[0] === (pluginBuiltinAliases[name] || name),
    );
    command[3]();
  },
});

installMenus(() => commands, toast);
if (native) {
  document.title = current().name.split("/").pop() + " — easy text";
  native.onEvent(async (event) => {
    if (event.type === "menu-command") {
      const command = commands.find((command) => command[0] === event.command);
      if (command)
        try {
          await command[3]();
        } catch (error) {
          toast(error.message);
        }
      else toast("尚未实现的菜单命令：" + event.command);
    }
    if (event.type === "app-close-request") {
      try {
        await native.saveSession({
          data: captureSession(),
        });
        native.closeReady();
      } catch (error) {
        toast("关闭前保存会话失败：" + error.message);
      }
    }
    if (
      event.type === "file-change" &&
      files.some((file) => file.path === event.path)
    ) {
      clearTimeout(changeNotifications.get(event.path));
      changeNotifications.set(
        event.path,
        setTimeout(async () => {
          const file = files.find((file) => file.path === event.path);
          if (!file) return;
          try {
            const disk = await native.readFile({ path: event.path });
            const hash = disk.revision?.sha256;
            if (
              hash === file.revision?.sha256 ||
              hash === notifiedRevisions.get(event.path)
            )
              return;
            notifiedRevisions.set(event.path, hash);
            toast(
              "磁盘文件已被外部修改：" +
                event.path +
                "。保存将检查冲突；可使用重新读取命令。",
            );
          } catch (error) {
            toast("磁盘文件变化后无法读取：" + error.message);
          }
        }, 350),
      );
    }
  });
  native
    .loadSession()
    .then(async (result) => {
      if (!result?.data || !validSession(result.data)) return;
      if (!validSession(stored)) {
        const data = restoreSession(result.data);
        for (const view of views) view.destroy();
        views = [];
        files = data.files;
        tabs = data.tabs;
        active = data.active;
        settings = data.settings;
        split = data.split;
        paneFiles = data.paneFiles;
        workspace = data.workspace;
        restoreViews(data);
        states.clear();
        document.body.classList.toggle("light", settings.light);
        mount(paneFiles.indexOf(active) === 1 ? 1 : 0);
        renderTabs();
        renderTree();
      }
      workspace = result.data.workspace || null;
      if (workspace) {
        try {
          diskTree = (await native.listTree({ workspaceId: workspace.id }))
            .tree;
          renderTree();
          document.querySelector(".project-heading span").textContent =
            workspace.name;
        } catch {
          workspace = null;
        }
      }
    })
    .catch((error) => toast("恢复本机会话失败：" + error.message))
    .finally(() => {
      nativeSessionReady = true;
      persist();
    });
}
document.body.classList.toggle("light", settings.light);
mount(paneFiles.indexOf(active) === 1 ? 1 : 0);
renderTree();
renderTabs();
persist();
