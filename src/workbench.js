import { buildDiagnostics } from "./build-diagnostics.js";
import { dirty } from "./core.js";
import { syntaxSymbols, localDefinition } from "./syntax-navigation.js";
import { localSearch } from "./search-client.js";
import { snippet } from "@codemirror/autocomplete";
import { EditorSelection } from "@codemirror/state";
import {
  findSymbols,
  lineDiff,
  searchPattern,
  MacroRecorder,
} from "./text-tools.js";

const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const readSetting = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

/** Auxiliary workbench features. Native privileges remain exclusively in preload. */
export function createWorkbench(ctx) {
  const recorder = new MacroRecorder();
  const previous = readSetting("easy-text-macro", []);
  if (Array.isArray(previous)) recorder.events = previous;
  let snippets = readSetting("easy-text-snippets", [
    {
      name: "JavaScript function",
      body: "function ${1:name}(${2:args}) {\n  ${3:// code}\n}",
    },
    {
      name: "Python function",
      body: "def ${1:name}(${2:args}):\n    ${3:pass}",
    },
    {
      name: "HTML element",
      body: '<${1:div} class="${2:className}">\n  ${3:content}\n</${1:div}>',
    },
  ]);
  if (!Array.isArray(snippets)) snippets = [];
  let keybindings = readSetting("easy-text-keybindings", {
    "Mod-Shift-o": "symbols",
    "Mod-Shift-m": "macro.record",
  });
  let buildId = null;
  let buildLog = "";
  let diagnosticRows = [];
  let panelName = "";
  let panelActions = {};
  let searchPreview = null;
  let lastReplaceUndo = null;
  let searchRows = [];
  const panel = document.createElement("section");
  panel.className = "workbench-panel hidden";
  document.querySelector("main").append(panel);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog id="config-dialog"><form id="config-form"><div class="dialog-label"><label id="config-title" for="config-text"></label><button type="button" data-dismiss="config-dialog">×</button></div><p id="config-description"></p><textarea id="config-text" spellcheck="false" aria-label="JSON 配置"></textarea><div class="config-actions"><button type="button" data-dismiss="config-dialog">取消</button><button type="submit">保存配置</button></div></form></dialog>`,
  );
  let saveConfig = () => {};
  const safe =
    (action) =>
    async (...args) => {
      try {
        return await action(...args);
      } catch (error) {
        ctx.toast(error.message || String(error));
      }
    };
  function config(title, description, value, onSave) {
    document.querySelector("#config-title").textContent = title;
    document.querySelector("#config-description").textContent = description;
    document.querySelector("#config-text").value = JSON.stringify(
      value,
      null,
      2,
    );
    saveConfig = onSave;
    document.querySelector("#config-dialog").showModal();
  }
  document.querySelector("#config-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      saveConfig(JSON.parse(document.querySelector("#config-text").value));
      document.querySelector("#config-dialog").close();
      ctx.toast("配置已保存");
    } catch (error) {
      ctx.toast("配置错误：" + error.message);
    }
  });
  function show(name, body, actions = {}) {
    panelName = name;
    panelActions = actions;
    panel.classList.remove("hidden");
    panel.innerHTML = `<div class="workbench-heading"><strong>${escapeHTML(name)}</strong><span class="workbench-panel-tabs"><button data-tool="search">搜索</button><button data-tool="outline">大纲</button><button data-tool="diff">差异</button><button data-tool="git">Git</button><button data-tool="build">构建</button></span><button data-tool="close" aria-label="关闭底部面板">×</button></div><div class="workbench-body">${body}</div>`;
  }
  panel.addEventListener(
    "click",
    safe(async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const tool = button.dataset.tool;
      if (tool === "close") panel.classList.add("hidden");
      if (tool === "search") search();
      if (tool === "outline") outline();
      if (tool === "diff") diff();
      if (tool === "git") await git();
      if (tool === "build") build();
      if (button.dataset.panelAction)
        await panelActions[button.dataset.panelAction]?.(button);
    }),
  );
  function jump(file, line, column = 1) {
    ctx.activate(file.id);
    const view = ctx.view();
    const target = view.state.doc.line(
      Math.max(1, Math.min(line, view.state.doc.lines)),
    );
    view.dispatch({
      selection: {
        anchor: Math.min(target.to, target.from + Math.max(0, column - 1)),
      },
      scrollIntoView: true,
    });
    view.focus();
  }
  function outline() {
    const file = ctx.current();
    const result = syntaxSymbols(ctx.view().state, file.name);
    const symbols = result.symbols;
    show(
      "符号大纲 · " +
        (result.syntaxAware ? "JS/TS 语法树" : "声明模式扫描") +
        (result.complete ? "" : " · 解析未完成") +
        "（非 LSP）",
      symbols
        .map(
          (s, i) =>
            `<button class="result-row" data-panel-action="jump" data-index="${i}"><span class="symbol-kind">${s.kind}</span><span>${escapeHTML(s.name)}</span><small>行 ${s.line}</small></button>`,
        )
        .join("") ||
        '<p class="panel-note">当前文件没有匹配到函数、类、类型或 Markdown 标题声明。不会解析跨模块引用。</p>',
      { jump: (button) => jump(file, symbols[+button.dataset.index].line) },
    );
  }
  function diff() {
    const file = ctx.current();
    const truncated =
      file.saved.split("\n").length > 5000 ||
      file.content.split("\n").length > 5000;
    const rows = lineDiff(
      file.saved.split("\n").slice(0, 5000).join("\n"),
      file.content.split("\n").slice(0, 5000).join("\n"),
    );
    show(
      "未保存差异 · " + file.name,
      `<p class="panel-note">比较当前缓冲区与最近成功保存 / 导入的文本。${truncated ? " 为保证响应，仅比较前 5000 行。" : ""}</p><pre class="diff-lines">${rows.map((r) => `<span class="diff-${r.kind}">${r.kind === "add" ? "+" : r.kind === "remove" ? "-" : " "} ${escapeHTML(r.text)}</span>`).join("")}</pre>`,
    );
  }
  function search() {
    searchPreview = null;
    show(
      "项目查找与替换",
      `<div class="search-tools"><input id="project-query" placeholder="查找文本" aria-label="项目查找文本"><input id="project-replacement" placeholder="替换为…" aria-label="项目替换文本"><label><input id="project-regex" type="checkbox"> 正则</label><label><input id="project-case" type="checkbox"> 区分大小写</label><button data-panel-action="find">查找</button><button data-panel-action="preview">预览替换</button>${lastReplaceUndo ? '<button data-panel-action="undo">撤销上次项目替换</button>' : ""}</div><p class="panel-note">${ctx.workspace() ? "搜索磁盘项目；替换前请先保存打开文件。" : "搜索当前工作区缓冲区，替换后可以撤销，保存仍需另行执行。"}</p><div id="project-results"></div>`,
      {
        find: () => searchRun(false),
        preview: () => searchRun(true),
        apply: applyReplacement,
        undo: async () => {
          if (!lastReplaceUndo) return;
          if (ctx.files().some((file) => file.path && dirty(file)))
            throw new Error("请先保存打开文件，再撤销项目替换");
          const result = await ctx.native.undoReplace({
            undoId: lastReplaceUndo,
          });
          for (const file of result.files) await ctx.receiveNative(file);
          lastReplaceUndo = null;
          ctx.toast("已撤销最近的项目替换");
          search();
        },
        jump: async (button) => {
          const row = searchRows[+button.dataset.index];
          const file = row.file || (await ctx.openPath(row.path));
          jump(file, row.line, row.column);
        },
      },
    );
  }
  async function searchRun(preview) {
    const query = panel.querySelector("#project-query").value;
    if (!query) return;
    const replacement = panel.querySelector("#project-replacement").value;
    const regex = panel.querySelector("#project-regex").checked;
    const caseSensitive = panel.querySelector("#project-case").checked;
    const target = panel.querySelector("#project-results");
    searchPattern(query, regex, caseSensitive, true);
    if (ctx.native && ctx.workspace()) {
      if (preview) {
        if (ctx.files().some((f) => f.path && dirty(f)))
          throw new Error("请先保存或还原打开的磁盘文件，再预览项目替换。");
        const buffers = new Map(
          ctx
            .files()
            .filter((file) => file.path)
            .map((file) => [file.path, file.content]),
        );
        searchPreview = await ctx.native.previewReplace({
          workspaceId: ctx.workspace().id,
          query,
          replacement,
          regex,
          caseSensitive,
        });
        searchPreview.buffers = buffers;
        target.innerHTML = `<p>${searchPreview.changes.length} 个文件将修改${searchPreview.truncated ? "（结果已截断，不能完整替换）" : ""}</p>${searchPreview.changes.map((c) => `<details><summary>${escapeHTML(c.path)} · ${c.count} 处</summary><pre>${escapeHTML(c.after.slice(0, 10000))}</pre></details>`).join("")}<button data-panel-action="apply">确认应用替换</button>`;
      } else {
        const result = await ctx.native.search({
          workspaceId: ctx.workspace().id,
          query,
          regex,
          caseSensitive,
        });
        searchRows = result.matches;
        target.innerHTML =
          `<p>${searchRows.length} 处结果${result.truncated ? " · 已截断" : ""}</p>` +
          renderSearchRows();
      }
    } else {
      const result = await localSearch({
        files: ctx
          .files()
          .map((file) => ({ id: file.id, content: file.content })),
        query,
        regex,
        caseSensitive,
        replacement,
        preview,
      });
      if (preview) {
        const changes = result.changes.map((change) => ({
          ...change,
          file: ctx.files().find((file) => file.id === change.id),
        }));
        searchPreview = { changes, local: true };
        target.innerHTML = `<p>${changes.length} 个缓冲区将修改；确认后可分别撤销。</p>${changes.map((change) => `<details><summary>${escapeHTML(change.file.name)}</summary><pre>${escapeHTML(change.after.slice(0, 10000))}</pre></details>`).join("")}<button data-panel-action="apply">确认应用替换</button>`;
      } else {
        searchRows = result.matches.map((match) => ({
          ...match,
          file: ctx.files().find((file) => file.id === match.fileId),
        }));
        target.innerHTML =
          `<p>${searchRows.length} 处结果（上限 1000）</p>` +
          renderSearchRows();
      }
    }
  }

  function renderSearchRows() {
    return searchRows
      .map(
        (r, index) =>
          `<button class="result-row" data-panel-action="jump" data-index="${index}"><span>${escapeHTML(r.file?.name || r.path)}:${r.line}</span><code>${escapeHTML(r.text.slice(0, 180))}</code></button>`,
      )
      .join("");
  }
  async function applyReplacement() {
    if (!searchPreview) return;
    if (searchPreview.local) {
      for (const c of searchPreview.changes) {
        if (c.file.content !== c.before)
          throw new Error("预览后文本已变化，请重新预览");
      }
      for (const c of searchPreview.changes) ctx.replace(c.file.id, c.after);
    } else {
      const paths = new Set(searchPreview.changes.map((change) => change.path));
      if (
        ctx
          .files()
          .some(
            (file) =>
              paths.has(file.path) &&
              (dirty(file) ||
                (searchPreview.buffers.has(file.path) &&
                  file.content !== searchPreview.buffers.get(file.path))),
          )
      )
        throw new Error("预览后缓冲区已变化，请保存后重新预览");
      const result = await ctx.native.applyReplace({
        previewId: searchPreview.previewId,
      });
      for (const f of result.files) await ctx.receiveNative(f);
      lastReplaceUndo = result.undoId || null;
    }
    searchPreview = null;
    ctx.toast("替换已应用");
    search();
  }
  async function git() {
    if (!ctx.native || !ctx.workspace())
      return show(
        "Git",
        '<p class="panel-note">请在桌面版打开一个 Git 项目目录。浏览器版不能访问本地 Git。</p>',
      );
    const workspaceId = ctx.workspace().id;
    const status = await ctx.native.gitStatus({ workspaceId });
    show(
      "Git · " + ctx.workspace().name,
      `<div class="git-tools"><button data-panel-action="refresh">刷新状态</button><button data-panel-action="diff">工作区差异</button><button data-panel-action="log">最近提交</button><button data-panel-action="stage">暂存当前文件</button><input id="commit-message" placeholder="提交说明" aria-label="Git 提交说明"><button data-panel-action="commit">提交已暂存内容</button></div><pre id="git-output"></pre>`,
      {
        refresh: git,
        diff: async () => {
          panel.querySelector("#git-output").textContent = (
            await ctx.native.gitDiff({ workspaceId })
          ).text;
        },
        log: async () => {
          panel.querySelector("#git-output").textContent = (
            await ctx.native.gitLog({ workspaceId })
          ).text;
        },
        stage: async () => {
          const file = ctx.current();
          if (!file.path) throw new Error("当前文件未保存到磁盘");
          await ctx.native.gitStage({ workspaceId, paths: [file.path] });
          await git();
        },
        commit: async () => {
          const message = panel.querySelector("#commit-message").value.trim();
          if (!message) throw new Error("请输入提交说明");
          const result = await ctx.native.gitCommit({ workspaceId, message });
          ctx.toast(result.text);
          await git();
        },
      },
    );
    panel.querySelector("#git-output").textContent = status.text;
  }
  function build() {
    const enabled = ctx.native && ctx.workspace();
    const saved = readSetting("easy-text-build", {
      command: "node",
      args: ["--version"],
    });
    show(
      "构建与运行输出",
      enabled
        ? `<div class="build-tools"><input id="build-command" aria-label="可执行程序" value="${escapeHTML(saved.command)}" placeholder="可执行程序，例如 npm"><input id="build-args" aria-label="参数 JSON 数组" value="${escapeHTML(JSON.stringify(saved.args))}" placeholder='["run","build"]'><button data-panel-action="run">运行</button><button data-panel-action="cancel">停止</button></div><p class="panel-note">项目目录中执行程序；参数为 JSON 字符串数组，不经过 shell，不支持管道。桌面端会确认执行。</p><div id="build-diagnostics"></div><pre id="build-output"></pre>`
        : '<p class="panel-note">浏览器版不会执行本机程序。请在桌面版打开项目后使用构建系统。</p>',
      {
        run: async () => {
          if (buildId) throw new Error("请先停止当前构建");
          const command = panel.querySelector("#build-command").value.trim();
          const args = JSON.parse(panel.querySelector("#build-args").value);
          if (!Array.isArray(args) || args.some((a) => typeof a !== "string"))
            throw new Error("参数必须是字符串数组");
          localStorage.setItem(
            "easy-text-build",
            JSON.stringify({ command, args }),
          );
          buildLog = "";
          const result = await ctx.native.startBuild({
            workspaceId: ctx.workspace().id,
            command,
            args,
          });
          buildId = result.buildId;
          buildLog += "> " + command + " " + args.join(" ") + "\n";
          refreshBuild();
        },
        diagnostic: async (button) => {
          const row = diagnosticRows[Number(button.dataset.index)];
          if (row) {
            const file = await ctx.openPath(row.path);
            jump(file, row.line, row.column);
          }
        },
        cancel: async () => {
          if (buildId) await ctx.native.cancelBuild({ buildId });
        },
      },
    );
    refreshBuild();
  }
  function refreshBuild() {
    const output = panel.querySelector("#build-output");
    if (output) {
      output.textContent = buildLog;
      output.scrollTop = output.scrollHeight;
    }
    const diagnosticHost = panel.querySelector("#build-diagnostics");
    if (diagnosticHost) {
      diagnosticRows = buildDiagnostics(buildLog, ctx.workspace()?.path);
      diagnosticHost.innerHTML = diagnosticRows
        .map(
          (row, index) =>
            `<button class="result-row" data-panel-action="diagnostic" data-index="${index}"><span>↗ ${escapeHTML(row.path.split("/").pop())}:${row.line}:${row.column}</span><code>${escapeHTML(row.text)}</code></button>`,
        )
        .join("");
    }
  }
  ctx.native?.onEvent?.((event) => {
    if (event.type === "build-output") {
      buildLog += event.text;
      if (buildLog.length > 1_000_000) buildLog = buildLog.slice(-1_000_000);
      refreshBuild();
    }
    if (event.type === "build-exit") {
      buildId = null;
      buildLog += "\n[进程退出 " + event.code + "]\n";
      refreshBuild();
    }
  });
  function chooseSnippet() {
    show(
      "代码片段 · Tab 跳转占位符",
      `<button data-panel-action="configure">编辑自定义片段 JSON</button>${snippets.map((s, i) => `<button class="result-row" data-panel-action="insert" data-index="${i}"><span>${escapeHTML(s.name)}</span><code>${escapeHTML(s.body.slice(0, 100))}</code></button>`).join("")}`,
      {
        configure: () =>
          config(
            "代码片段配置",
            "数组元素为 {name, body}；占位符语法 ${1:name}，Tab 跳至下一个字段。",
            snippets,
            (value) => {
              if (
                !Array.isArray(value) ||
                value.some(
                  (s) =>
                    typeof s.name !== "string" || typeof s.body !== "string",
                )
              )
                throw new Error("需要 name/body 字符串数组");
              snippets = value;
              localStorage.setItem("easy-text-snippets", JSON.stringify(value));
              chooseSnippet();
            },
          ),
        insert: (button) => {
          const view = ctx.view();
          const range = view.state.selection.main;
          snippet(snippets[+button.dataset.index].body)(
            view,
            null,
            range.from,
            range.to,
          );
          view.focus();
        },
      },
    );
  }
  function editKeys() {
    config(
      "自定义快捷键",
      "键为 Mod-Shift-k 等组合，值为命令 ID。Mod 对应 macOS Command / 其它系统 Ctrl。命令 ID 在下方列出。\n" +
        ctx
          .commands()
          .map((c) => c[0])
          .join(", "),
      keybindings,
      (value) => {
        if (!value || Array.isArray(value) || typeof value !== "object")
          throw new Error("需要 JSON 对象");
        for (const [key, id] of Object.entries(value)) {
          if (
            typeof id !== "string" ||
            !ctx.commands().some((c) => c[0] === id)
          )
            throw new Error("未知命令：" + id);
          if (!key.includes("-")) throw new Error("快捷键必须包含修饰键");
        }
        keybindings = value;
        localStorage.setItem("easy-text-keybindings", JSON.stringify(value));
      },
    );
  }
  document.addEventListener(
    "keydown",
    (event) => {
      if (document.querySelector("dialog[open]")) return;
      for (const [binding, id] of Object.entries(keybindings)) {
        const parts = binding.toLowerCase().split("-");
        const key = parts.pop();
        const mod = /Mac|iPhone|iPad/.test(navigator.platform)
          ? event.metaKey
          : event.ctrlKey;
        if (
          key === event.key.toLowerCase() &&
          parts.includes("mod") === mod &&
          parts.includes("shift") === event.shiftKey &&
          parts.includes("alt") === event.altKey &&
          (parts.includes("ctrl") ? event.ctrlKey : true)
        ) {
          const command = ctx.commands().find((c) => c[0] === id);
          if (command) {
            event.preventDefault();
            event.stopImmediatePropagation();
            safe(command[3])();
            return;
          }
        }
      }
    },
    true,
  );
  const commands = [
    ["symbols", "符号大纲 / 跳转（JS/TS语法树）", "⇧ ⌘ O", outline],
    [
      "navigation.definition",
      "跳转当前文件局部声明（JS/TS语法树）",
      "",
      () => {
        const view = ctx.view();
        const target = localDefinition(view.state, ctx.current().name);
        if (!target)
          return ctx.toast(
            "没有找到同一文件内可解析的声明；不解析跨文件类型或对象成员",
          );
        view.dispatch({
          selection: { anchor: target.from, head: target.to },
          scrollIntoView: true,
        });
        view.focus();
      },
    ],
    ["project.replace", "项目查找与替换 · 先预览", "", search],
    ["view.diff", "显示未保存文本差异", "", diff],
    ["git.panel", "Git 状态 / 差异 / 暂存 / 提交", "", git],
    ["build.panel", "构建系统 / 输出面板", "", build],
    ["snippet.insert", "插入 / 管理代码片段", "", chooseSnippet],
    ["keybindings.edit", "编辑自定义快捷键 JSON", "", editKeys],
    [
      "macro.record",
      "开始 / 停止录制编辑宏",
      "⇧ ⌘ M",
      () => {
        if (recorder.recording) {
          recorder.stop();
          localStorage.setItem(
            "easy-text-macro",
            JSON.stringify(recorder.events),
          );
          ctx.toast("宏已保存：" + recorder.events.length + " 步");
        } else {
          recorder.start();
          ctx.toast("正在录制当前编辑操作；再次执行命令停止");
        }
        document.querySelector(".status-logo").textContent = recorder.recording
          ? "● REC"
          : "ET";
      },
    ],
    [
      "macro.play",
      "回放已录制编辑宏",
      "",
      () => {
        recorder.replay(ctx.view(), (ranges) =>
          EditorSelection.create(
            ranges.map((r) => EditorSelection.range(r.anchor, r.head)),
          ),
        );
        ctx.view().focus();
      },
    ],
  ].map((c) => [...c.slice(0, 3), safe(c[3])]);
  return {
    commands,
    observe: (update) => recorder.observe(update),
    search,
    outline,
    diff,
    git: safe(git),
    build,
    refresh() {
      if (panelName.startsWith("符号大纲")) outline();
    },
  };
}
