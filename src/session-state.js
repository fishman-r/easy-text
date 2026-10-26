import { normalizeDisplayOptions } from "./display-options.js";
import { normalizeLocalePreference } from "./i18n.js";
import { validSession } from "./core.js";
import { normalizeText } from "./text-tools.js";

export function normalizeSettings(input = {}) {
  const settings = {
    fontSize: 14,
    wrap: false,
    light: false,
    indentSize: 4,
    ...input,
  };
  Object.assign(settings, normalizeDisplayOptions(settings));
  settings.fontSize = Math.max(
    10,
    Math.min(24, Number(settings.fontSize) || 14),
  );
  settings.indentSize = [2, 4, 8].includes(settings.indentSize)
    ? settings.indentSize
    : 4;
  settings.languagePreference = normalizeLocalePreference(
    settings.languagePreference,
  );
  settings.wrap = settings.wrap === true;
  settings.light = settings.light === true;
  if (!settings.bookmarks || typeof settings.bookmarks !== "object")
    settings.bookmarks = {};
  for (const [id, positions] of Object.entries(settings.bookmarks))
    settings.bookmarks[id] = Array.isArray(positions)
      ? positions.filter(
          (position) => Number.isInteger(position) && position >= 0,
        )
      : [];
  return settings;
}

export function restoreSession(data) {
  if (!validSession(data)) throw new Error("无效的编辑器会话");
  const files = data.files.map((file) => ({
    ...file,
    content: normalizeText(file.content),
    saved: normalizeText(file.saved),
  }));
  const ids = new Set(files.map((file) => file.id));
  const active = ids.has(data.active) ? data.active : files[0].id;
  const tabs = [
    ...new Set(
      (Array.isArray(data.tabs)
        ? data.tabs
        : files.map((file) => file.id)
      ).filter((id) => ids.has(id)),
    ),
  ];
  if (!tabs.includes(active)) tabs.push(active);
  const paneFiles = Array.isArray(data.paneFiles)
    ? data.paneFiles.slice(0, 2).map((id) => (ids.has(id) ? id : active))
    : [active, active];
  while (paneFiles.length < 2) paneFiles.push(active);
  const viewStates = [];
  for (const entry of Array.isArray(data.viewStates) ? data.viewStates : []) {
    if (![0, 1].includes(entry.pane) || !ids.has(entry.fileId)) continue;
    const length = files.find((file) => file.id === entry.fileId).content
      .length;
    const clamp = (value) =>
      Math.max(
        0,
        Math.min(length, Number.isFinite(value) ? Math.trunc(value) : 0),
      );
    const ranges = (
      Array.isArray(entry.selection?.ranges) ? entry.selection.ranges : []
    ).map((range) => ({
      anchor: clamp(range.anchor),
      head: clamp(range.head),
    }));
    if (!ranges.length) ranges.push({ anchor: 0, head: 0 });
    viewStates.push({
      pane: entry.pane,
      fileId: entry.fileId,
      selection: {
        ranges,
        mainIndex: Math.max(
          0,
          Math.min(ranges.length - 1, Number(entry.selection?.mainIndex) || 0),
        ),
      },
      scrollTop: Math.max(0, Number(entry.scrollTop) || 0),
      scrollLeft: Math.max(0, Number(entry.scrollLeft) || 0),
    });
  }
  return {
    files,
    active,
    tabs,
    closedTabs: (Array.isArray(data.closedTabs) ? data.closedTabs : []).filter(entry => entry && ids.has(entry.id) && !tabs.includes(entry.id) && Number.isInteger(entry.index) && entry.index >= 0).slice(-50),
    settings: normalizeSettings(data.settings),
    workspace: data.workspace || null,
    split: data.split === true,
    paneFiles,
    viewStates,
  };
}
