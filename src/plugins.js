import { validatePluginEffects } from "./plugin-transactions.js";
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

/** Trusted local Python packages run in the desktop host, never in this renderer. */
export function createPluginController(ctx) {
  let state = { sources: [], commands: [], running: false, errors: [] };
  let applying = false;
  let queue = Promise.resolve();
  let log = [];
  const timers = new Map();
  const panel = document.createElement("section");
  panel.className = "workbench-panel plugin-panel hidden";
  document.querySelector("main").append(panel);
  function write(message) {
    log.push(String(message));
    if (log.length > 300) log = log.slice(-300);
    const target = panel.querySelector("#plugin-output");
    if (target) {
      target.textContent = log.join("\n");
      target.scrollTop = target.scrollHeight;
    }
  }
  const available = Boolean(ctx.native?.pluginList);
  async function refresh() {
    if (!available) return;
    state = await ctx.native.pluginList();
    const commands = ctx.commands();
    for (let index = commands.length - 1; index >= 0; index--)
      if (commands[index][0].startsWith("plugin:")) commands.splice(index, 1);
    if (state.running)
      for (const command of state.commands || []) {
        commands.push([
          "plugin:" + command.name,
          `${command.package || "Plugin"}: ${command.name.replaceAll("_", " ")}`,
          "",
          () => run(command.name, {}),
        ]);
      }
    if (!panel.classList.contains("hidden")) render();
  }
  async function effects(result, snapshot) {
    if (result.errors?.length) {
      for (const error of result.errors)
        write(typeof error === "string" ? error : JSON.stringify(error));
      throw new Error("插件报告错误，文档修改未应用；详情见插件输出");
    }
    const plans = ctx.prepareDocuments(result.documents || []);
    const returnedEffects = result.effects || [];
    validatePluginEffects(
      returnedEffects,
      ctx.files(),
      plans,
      ctx.canExecuteBuiltin,
    );
    const unchanged = plans.every((plan) => {
      const original = snapshot.views.find((view) => view.id === plan.file.id);
      return (
        !plan.changes.length &&
        JSON.stringify(plan.selections) === JSON.stringify(original?.selections)
      );
    });
    if (
      unchanged &&
      returnedEffects.every((effect) => effect.type === "status")
    ) {
      for (const effect of returnedEffects) ctx.toast(effect.message);
      return;
    }
    ctx.assertSnapshot(snapshot);
    // Validate every effect before editing. Clipboard failures do not partially edit a document.
    for (const effect of returnedEffects)
      if (effect.type === "clipboard") {
        if (ctx.native.pluginSetClipboard)
          await ctx.native.pluginSetClipboard({ text: effect.text });
        else await navigator.clipboard.writeText(effect.text);
      }
    ctx.assertSnapshot(snapshot);
    applying = true;
    try {
      ctx.commitDocuments(plans);
      for (const effect of returnedEffects) {
        switch (effect.type) {
          case "clipboard":
            break;
          case "status":
            ctx.toast(effect.message);
            break;
          case "focus-view":
            ctx.activate(effect.viewId);
            break;
          case "show":
            ctx.show(effect.viewId, effect.point);
            break;
          case "settings":
            ctx.applySettings(effect.viewId, effect.values);
            break;
          case "run-command":
            ctx.executeBuiltin(effect.name, effect.args, effect.viewId);
            break;
        }
      }
      for (const error of result.errors || [])
        write(typeof error === "string" ? error : JSON.stringify(error));
    } finally {
      applying = false;
    }
  }

  function enqueue(task) {
    const result = queue.then(task);
    queue = result.catch((error) => write(error.message));
    return result;
  }
  function run(name, args = {}) {
    return enqueue(async () => {
      if (!state.running)
        throw new Error("插件宿主尚未启动，请在插件管理中启动");
      const snapshot = ctx.snapshot();
      const result = await ctx.native.pluginRun({ name, args, snapshot });
      await effects(result, snapshot);
    }).catch((error) => {
      ctx.toast("插件执行失败：" + error.message);
      write(error.stack || error.message);
    });
  }
  function event(name, { immediate = false, documentId } = {}) {
    if (!available || !state.running || applying) return Promise.resolve();
    const send = () =>
      enqueue(async () => {
        const snapshot = ctx.snapshot(documentId);
        const result = await ctx.native.pluginEvent({ name, snapshot });
        await effects(result, snapshot);
      });
    if (immediate) return send();
    clearTimeout(timers.get(name));
    timers.set(
      name,
      setTimeout(
        () => send().catch((error) => write(name + ": " + error.message)),
        name === "on_modified" ? 240 : 120,
      ),
    );
    return Promise.resolve();
  }
  function render() {
    const sources = state.sources || [];
    panel.innerHTML = `<div class="workbench-heading"><strong>插件管理</strong><span>${state.running ? "Python 宿主运行中" : "Python 宿主已停止"}</span><button data-plugin-action="close" aria-label="关闭插件管理">×</button></div><div class="workbench-body"><p class="panel-note plugin-trust">本地 Python 插件以当前用户权限运行，可读取文件或联网。仅加载你信任的代码。支持 Sublime Python API 的已实现子集；不保证任意插件兼容。不自动加载现有 Sublime 目录，重启后需显式启动。</p>${available ? `<div class="plugin-toolbar"><button data-plugin-action="install" data-kind="packages">添加 Packages 目录</button><button data-plugin-action="install" data-kind="archive">安装 .sublime-package</button><button data-plugin-action="install" data-kind="python">安装 .py 插件</button><button data-plugin-action="start">启动 / 重新加载</button><button data-plugin-action="stop">停止</button><button data-plugin-action="refresh">刷新</button></div><div class="plugin-sources">${sources.map((source) => `<div class="plugin-source"><div><strong>${escapeHTML(source.name || source.id)}</strong><small>${escapeHTML(source.path || "")}</small></div><button data-plugin-action="toggle" data-source="${escapeHTML(source.id)}">${source.enabled ? "禁用" : "启用"}</button><button data-plugin-action="remove" data-source="${escapeHTML(source.id)}">移除登记</button></div>`).join("") || '<p class="panel-note">尚未登记任何插件。安装入口会显示原生路径选择与信任确认。</p>'}</div><details><summary>兼容性与已注册命令（${(state.commands || []).length}）</summary><pre>${escapeHTML(typeof state.compatibility === "string" ? state.compatibility : JSON.stringify(state.compatibility || {}, null, 2))}</pre><div>${(state.commands || []).map((command) => `<button class="plugin-command" data-plugin-action="run" data-command="${escapeHTML(command.name)}">${escapeHTML(command.package || "Plugin")}: ${escapeHTML(command.name)}</button>`).join("")}</div></details>` : '<p class="panel-note">插件宿主需要 easy text 桌面版。浏览器版不会执行本机 Python。</p>'}<details open><summary>插件输出与错误</summary><pre id="plugin-output"></pre></details></div>`;
    panel.querySelector("#plugin-output").textContent = [
      ...log,
      ...(state.errors || []).map((error) =>
        typeof error === "string" ? error : JSON.stringify(error),
      ),
    ].join("\n");
  }
  async function open() {
    document.querySelectorAll("main > .workbench-panel").forEach((other) => {
      if (other !== panel) other.classList.add("hidden");
    });
    panel.classList.remove("hidden");
    if (available) {
      try {
        await refresh();
      } catch (error) {
        write(error.message);
      }
    }
    render();
  }
  panel.addEventListener("click", async (click) => {
    const button = click.target.closest("[data-plugin-action]");
    if (!button) return;
    try {
      const action = button.dataset.pluginAction;
      if (action === "close") {
        panel.classList.add("hidden");
        return;
      }
      if (action === "install")
        await ctx.native.pluginInstall({ kind: button.dataset.kind });
      if (action === "start") await ctx.native.pluginStart();
      if (action === "stop") await ctx.native.pluginStop();
      if (action === "toggle") {
        const source = state.sources.find(
          (source) => source.id === button.dataset.source,
        );
        await ctx.native.pluginEnable({
          id: source.id,
          enabled: !source.enabled,
        });
      }
      if (action === "remove")
        await ctx.native.pluginRemove({ id: button.dataset.source });
      if (action === "run") await run(button.dataset.command);
      await refresh();
    } catch (error) {
      write(error.stack || error.message);
      ctx.toast("插件操作失败：" + error.message);
    }
  });
  if (available) {
    ctx.native.onEvent((message) => {
      if (message.type === "plugin-output" || message.type === "plugin-error")
        write(message.text || message.message || JSON.stringify(message));
      if (message.type === "plugin-status")
        refresh().catch((error) => write(error.message));
    });
    refresh().catch((error) => write(error.message));
  }
  return {
    open,
    event,
    run,
    get applying() {
      return applying;
    },
    get running() {
      return state.running;
    },
  };
}
