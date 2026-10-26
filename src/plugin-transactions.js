/** Validate the complete plugin reply before any editor state is changed. */
export function preparePluginDocuments(documents, files) {
  if (!Array.isArray(documents)) throw new Error("插件 documents 必须是数组");
  const seen = new Set();
  const plans = [];
  for (const document of documents) {
    if (seen.has(document.id)) throw new Error("插件重复提交同一文档");
    seen.add(document.id);
    const file = files.find((file) => file.id === document.id);
    if (!file) throw new Error("插件提交了未知文档");
    if (
      !Number.isInteger(document.expectedVersion) ||
      document.expectedVersion !== (file.version || 0)
    )
      throw new Error("插件结果已过期，编辑器保留当前内容");
    const changes = Array.isArray(document.changes) ? document.changes : [];
    if (changes.length > 10000) throw new Error("插件编辑数量超过限制");
    let offset = 0,
      text = "";
    for (const change of changes) {
      if (
        !Number.isInteger(change.from) ||
        !Number.isInteger(change.to) ||
        change.from < offset ||
        change.to < change.from ||
        change.to > file.content.length ||
        typeof change.insert !== "string"
      )
        throw new Error("插件编辑范围无效或重叠");
      text += file.content.slice(offset, change.from) + change.insert;
      offset = change.to;
    }
    text += file.content.slice(offset);
    if (typeof document.text !== "string" || text !== document.text)
      throw new Error("插件的编辑事务与最终文本不一致");
    if (text.length > 10 * 1024 * 1024)
      throw new Error("插件结果超过文档大小限制");
    const selections = document.selections;
    if (
      !Array.isArray(selections) ||
      !selections.length ||
      selections.length > 10000 ||
      selections.some(
        (range) =>
          !Number.isInteger(range.anchor) ||
          !Number.isInteger(range.head) ||
          range.anchor < 0 ||
          range.head < 0 ||
          range.anchor > text.length ||
          range.head > text.length,
      )
    )
      throw new Error("插件选区无效");
    plans.push({ file, changes, text, selections });
  }
  return plans;
}

export function pluginSettingPatch(values) {
  if (!values || Array.isArray(values) || typeof values !== "object")
    throw new Error("插件设置必须是对象");
  const patch = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "tab_size" && [2, 4, 8].includes(value))
      patch.indentSize = value;
    else if (key === "word_wrap" && typeof value === "boolean")
      patch.wrap = value;
    else if (
      key === "font_size" &&
      Number.isFinite(value) &&
      value >= 10 &&
      value <= 24
    )
      patch.fontSize = value;
    else if (key === "translate_tabs_to_spaces" && typeof value === "boolean")
      patch.useTabs = !value;
    else throw new Error("不支持的插件设置或值：" + key);
  }
  return patch;
}

export function validatePluginEffects(effects, files, plans, canExecute) {
  if (!Array.isArray(effects) || effects.length > 1000)
    throw new Error("插件 effects 必须是有限数组");
  const ids = new Set(files.map((file) => file.id));
  for (const effect of effects) {
    if (!effect || typeof effect.type !== "string")
      throw new Error("插件效果结构无效");
    if (effect.viewId !== undefined && !ids.has(effect.viewId))
      throw new Error("插件效果引用未知文档");
    switch (effect.type) {
      case "status":
        if (typeof effect.message !== "string")
          throw new Error("插件状态消息无效");
        break;
      case "clipboard":
        if (typeof effect.text !== "string" || effect.text.length > 1024 * 1024)
          throw new Error("插件剪贴板文本无效");
        break;
      case "focus-view":
        if (!ids.has(effect.viewId)) throw new Error("插件目标文档无效");
        break;
      case "show": {
        const file = files.find((file) => file.id === effect.viewId);
        const text =
          plans.find((plan) => plan.file.id === effect.viewId)?.text ??
          file?.content;
        if (
          typeof text !== "string" ||
          !Number.isInteger(effect.point) ||
          effect.point < 0 ||
          effect.point > text.length
        )
          throw new Error("插件滚动位置无效");
        break;
      }
      case "settings":
        pluginSettingPatch(effect.values);
        break;
      case "run-command":
        if (
          typeof effect.name !== "string" ||
          !canExecute(effect.name) ||
          !effect.args ||
          Array.isArray(effect.args) ||
          typeof effect.args !== "object"
        )
          throw new Error("不支持的插件内建命令：" + effect.name);
        if (
          ["insert", "append"].includes(effect.name) &&
          typeof effect.args.characters !== "string"
        )
          throw new Error("插件插入命令缺少 characters");
        break;
      default:
        throw new Error("未支持的插件效果：" + effect.type);
    }
  }
}

export function assertPluginSnapshot(snapshot, files, active) {
  if (snapshot.activeViewId !== active)
    throw new Error("插件运行期间活动文档已改变，结果未应用");
  for (const entry of snapshot.views) {
    const file = files.find((file) => file.id === entry.id);
    if (!file || (file.version || 0) !== entry.version)
      throw new Error("插件运行期间文本或选区已改变，结果未应用");
  }
}
