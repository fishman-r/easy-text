import { isolateHistory } from "@codemirror/commands";
/** Pure text operations used by the editor and its regression tests. */
export function normalizeText(text) {
  return text.replace(/\r\n?/g, "\n");
}

export function findSymbols(content, name = "") {
  const lines = normalizeText(content).split("\n");
  const symbols = [];
  const patterns = [
    [
      /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([\w$]+)/,
      "function",
    ],
    [/^\s*(?:export\s+)?(?:class|interface|type|enum)\s+([\w$]+)/, "type"],
    [/^\s*(?:async\s+)?def\s+([\w_]+)/, "function"],
    [
      /^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/,
      "function",
    ],
    [/^(#{1,6})\s+(.+)/, "heading"],
  ];
  lines.forEach((text, index) => {
    for (const [pattern, kind] of patterns) {
      const match = pattern.exec(text);
      if (match) {
        symbols.push({
          name: kind === "heading" ? match[2] : match[1],
          line: index + 1,
          kind,
          file: name,
        });
        break;
      }
    }
  });
  return symbols;
}

export function searchPattern(
  query,
  regex = false,
  caseSensitive = false,
  global = false,
) {
  const source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(source, `${global ? "g" : ""}${caseSensitive ? "" : "i"}u`);
}

export function lineDiff(before, after) {
  const left = normalizeText(before).split("\n");
  const right = normalizeText(after).split("\n");
  let prefix = 0;
  while (
    prefix < left.length &&
    prefix < right.length &&
    left[prefix] === right[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  )
    suffix++;
  const a = left.slice(prefix, left.length - suffix);
  const b = right.slice(prefix, right.length - suffix);
  const result = left.slice(0, prefix).map((text) => ({ kind: "same", text }));
  if (a.length * b.length > 1_000_000) {
    for (const text of a) result.push({ kind: "remove", text });
    for (const text of b) result.push({ kind: "add", text });
  } else {
    const matrix = Array.from(
      { length: a.length + 1 },
      () => new Uint32Array(b.length + 1),
    );
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        matrix[i][j] =
          a[i] === b[j]
            ? matrix[i + 1][j + 1] + 1
            : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    let i = 0,
      j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j])
        (result.push({ kind: "same", text: a[i++] }), j++);
      else if (
        j < b.length &&
        (i === a.length || matrix[i][j + 1] >= matrix[i + 1][j])
      )
        result.push({ kind: "add", text: b[j++] });
      else result.push({ kind: "remove", text: a[i++] });
    }
  }
  if (suffix)
    for (const text of left.slice(left.length - suffix))
      result.push({ kind: "same", text });
  return result;
}

export class MacroRecorder {
  recording = false;
  playing = false;
  events = [];
  start() {
    this.events = [];
    this.recording = true;
  }
  stop() {
    this.recording = false;
    return this.events;
  }
  observe(update) {
    if (
      !this.recording ||
      this.playing ||
      (!update.docChanged && !update.selectionSet)
    )
      return;
    const base = update.startState.selection.main.from;
    const changes = [];
    update.changes.iterChanges((from, to, _a, _b, insert) =>
      changes.push({
        from: from - base,
        to: to - base,
        insert: insert.toString(),
      }),
    );
    this.events.push({
      changes,
      selection: update.state.selection.ranges.map((r) => ({
        anchor: r.anchor - base,
        head: r.head - base,
      })),
    });
  }
  replay(view, selectionFactory) {
    if (this.recording) throw new Error("请先停止录制再回放");
    this.playing = true;
    try {
      let state = view.state;
      let combined = state.changes([]);
      for (const event of this.events) {
        const base = state.selection.main.from;
        const changes = event.changes.map((change) => ({
          ...change,
          from: change.from + base,
          to: change.to + base,
        }));
        if (
          changes.some(
            (change) => change.from < 0 || change.to > state.doc.length,
          )
        )
          throw new Error("宏步骤越界，未应用任何更改");
        const newLength =
          state.doc.length +
          changes.reduce(
            (total, change) =>
              total + change.insert.length - (change.to - change.from),
            0,
          );
        const ranges = event.selection.map((range) => ({
          anchor: Math.max(0, Math.min(newLength, range.anchor + base)),
          head: Math.max(0, Math.min(newLength, range.head + base)),
        }));
        const transaction = state.update({
          changes,
          selection: selectionFactory(ranges),
        });
        combined = combined.compose(transaction.changes);
        state = transaction.state;
      }
      if (this.events.length)
        view.dispatch({
          changes: combined,
          selection: state.selection,
          scrollIntoView: true,
          annotations: isolateHistory.of("full"),
        });
    } finally {
      this.playing = false;
    }
  }
}
