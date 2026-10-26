import { uniqueName } from "./core.js";

export function createMemoryBuffer(files = [], id = crypto.randomUUID()) {
  return {
    id,
    name: uniqueName("untitled", files),
    content: "",
    saved: "",
    version: 0,
    memoryOnly: true,
  };
}

/** Serialize durable documents, replacing unsaved active buffers with empty ones. */
export function durableSession(data) {
  const files = data.files.filter(file => !(file.memoryOnly === true && !file.path));
  const ids = new Set(files.map(file => file.id));
  let tabs = (data.tabs || []).filter(id => ids.has(id));
  let active = data.active;
  if (!ids.has(active) || !tabs.length) {
    let id = "memory-session-placeholder";
    let suffix = 2;
    while (data.files.some(file => file.id === id)) id = `memory-session-placeholder-${suffix++}`;
    const placeholder = createMemoryBuffer(files, id);
    files.push(placeholder);
    active = placeholder.id;
    tabs = [...tabs, active];
  }
  const settings = { ...data.settings };
  if (settings.bookmarks) {
    settings.bookmarks = Object.fromEntries(
      Object.entries(settings.bookmarks).filter(([id]) => ids.has(id)),
    );
  }
  return {
    ...data,
    files,
    active,
    tabs,
    closedTabs: (data.closedTabs || []).filter(entry => ids.has(entry.id)),
    viewStates: (data.viewStates || []).filter(entry => ids.has(entry.fileId)),
    paneFiles: (data.paneFiles || [active, active]).map(id => ids.has(id) ? id : active),
    settings,
  };
}
