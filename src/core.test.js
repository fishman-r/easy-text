import test from "node:test";
import assert from "node:assert/strict";
import { filterFiles, uniqueName, dirty, validSession } from "./core.js";
test("fuzzy file jump accepts ordered subsequences and rejects reversed characters", () => {
  const files = [
    { name: "src/main.js" },
    { name: "README.md" },
    { name: "src/styles.css" },
  ];
  assert.equal(filterFiles(files, "smj")[0].name, "src/main.js");
  assert.equal(filterFiles(files, "jms").length, 0);
  assert.equal(filterFiles(files, "README")[0].name, "README.md");
});
test("imports do not overwrite duplicate names or extensions", () =>
  assert.equal(
    uniqueName("a.js", [{ name: "a.js" }, { name: "a (2).js" }]),
    "a (3).js",
  ));
test("dirty state clears after restoring saved text", () => {
  const f = { content: "b", saved: "a" };
  assert.equal(dirty(f), true);
  f.content = "a";
  assert.equal(dirty(f), false);
});
test("session validates content and rejects duplicate identities", () => {
  const f = { id: "1", name: "a", content: "", saved: "" };
  assert.equal(validSession({ files: [f] }), true);
  assert.equal(validSession({ files: [f, f] }), false);
  assert.equal(validSession({ files: [{ ...f, content: null }] }), false);
});

import {
  normalizeText,
  findSymbols,
  lineDiff,
  searchPattern,
  MacroRecorder,
} from "./text-tools.js";
import { EditorState, EditorSelection } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";

test("CRLF and CR normalize without shifting later-line offsets", () => {
  assert.equal(normalizeText("a\r\nb\rc\n"), "a\nb\nc\n");
  assert.equal(searchPattern("a").exec("İa").index, 1);
  assert.equal(searchPattern("[").test("["), true);
});
test("symbol scan identifies declaration lines without claiming semantic references", () => {
  assert.deepEqual(
    findSymbols(
      "const incidental = 1;\nexport function hello() {}\nclass Example {}",
    ).map((s) => [s.name, s.line]),
    [
      ["hello", 2],
      ["Example", 3],
    ],
  );
});
test("large line diff does not spread arrays beyond engine argument limit", () => {
  const rows = lineDiff("a\n".repeat(130000), "b\n".repeat(130000));
  assert.equal(rows.filter((row) => row.kind === "remove").length, 130000);
  assert.equal(rows.filter((row) => row.kind === "add").length, 130000);
});
function fakeView(doc) {
  const view = {
    state: EditorState.create({ doc, extensions: [history()] }),
    count: 0,
  };
  view.dispatch = (transaction) => {
    view.count++;
    view.state = transaction.startState
      ? transaction.state
      : view.state.update(transaction).state;
  };
  return view;
}
const selectionFactory = (ranges) =>
  EditorSelection.create(
    ranges.map((r) => EditorSelection.range(r.anchor, r.head)),
  );
test("macro replay commits all edits once and one undo restores the source", () => {
  const view = fakeView("z");
  const macro = new MacroRecorder();
  macro.events = [
    {
      changes: [{ from: 0, to: 0, insert: "x" }],
      selection: [{ anchor: 1, head: 1 }],
    },
    {
      changes: [{ from: 0, to: 0, insert: "y" }],
      selection: [{ anchor: 1, head: 1 }],
    },
  ];
  macro.replay(view, selectionFactory);
  assert.equal(view.state.doc.toString(), "xyz");
  assert.equal(view.count, 1);
  undo(view);
  assert.equal(view.state.doc.toString(), "z");
});
test("invalid later macro step leaves document and history untouched", () => {
  const view = fakeView("z");
  const macro = new MacroRecorder();
  macro.events = [
    {
      changes: [{ from: 0, to: 0, insert: "x" }],
      selection: [{ anchor: 1, head: 1 }],
    },
    {
      changes: [{ from: 30, to: 31, insert: "" }],
      selection: [{ anchor: 1, head: 1 }],
    },
  ];
  assert.throws(() => macro.replay(view, selectionFactory), /越界/);
  assert.equal(view.state.doc.toString(), "z");
  assert.equal(view.count, 0);
});

import { syntaxSymbols, localDefinition } from "./syntax-navigation.js";
import { javascript } from "@codemirror/lang-javascript";
test("JS syntax outline ignores declarations inside strings and comments", () => {
  const state = EditorState.create({
    doc: '// function fake() {}\nconst text="function imaginary() {}";\nfunction real() {}',
    extensions: [javascript()],
  });
  const names = syntaxSymbols(state, "a.js").symbols.map((s) => s.name);
  assert.ok(names.includes("real"));
  assert.ok(!names.includes("fake"));
  assert.ok(!names.includes("imaginary"));
});
test("local syntax navigation picks nearest lexical declaration", () => {
  const doc = "const value=1; function demo(){ const value=2; return value; }";
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.lastIndexOf("value") + 2 },
    extensions: [javascript()],
  });
  assert.equal(localDefinition(state, "a.js").from, doc.indexOf("value=2"));
});

import { restoreSession } from "./session-state.js";
import { fileFormat, applySaveResult } from "./core.js";
import { buildDiagnostics } from "./build-diagnostics.js";
test("session restores tabs, settings, independent pane cursors and scroll", () => {
  const files = [
    { id: "a", name: "a.js", content: "hello", saved: "hello" },
    { id: "b", name: "b.js", content: "world", saved: "world" },
  ];
  const data = restoreSession({
    files,
    active: "b",
    tabs: ["b"],
    settings: { fontSize: 18, indentSize: 4, wrap: true },
    split: true,
    paneFiles: ["a", "b"],
    viewStates: [
      {
        pane: 1,
        fileId: "b",
        selection: { ranges: [{ anchor: 2, head: 3 }], mainIndex: 0 },
        scrollTop: 300,
        scrollLeft: 20,
      },
    ],
  });
  assert.deepEqual(data.tabs, ["b"]);
  assert.equal(data.settings.fontSize, 18);
  assert.equal(data.settings.indentSize, 4);
  assert.equal(data.split, true);
  assert.deepEqual(data.paneFiles, ["a", "b"]);
  assert.equal(data.viewStates[0].selection.ranges[0].head, 3);
  assert.equal(data.viewStates[0].scrollTop, 300);
});
test("save completion preserves concurrent format choice and concurrent text", () => {
  const file = {
    name: "a",
    content: "before",
    saved: "old",
    encoding: "utf-8",
    lineEnding: "LF",
  };
  const captured = fileFormat(file);
  file.encoding = "utf-16le";
  file.content = "after";
  applySaveResult(file, "before", captured, {
    path: "/tmp/a",
    name: "a",
    encoding: "utf-8",
    lineEnding: "LF",
    bom: false,
    revision: { sha256: "x" },
  });
  assert.equal(file.encoding, "utf-16le");
  assert.equal(file.formatDirty, true);
  assert.equal(file.content, "after");
  assert.equal(file.saved, "before");
  assert.equal(dirty(file), true);
});
test("format-only modification is dirty and successful unchanged-format save clears it", () => {
  const file = {
    name: "a",
    content: "same",
    saved: "same",
    formatDirty: true,
    encoding: "utf-16le",
    lineEnding: "CRLF",
  };
  assert.equal(dirty(file), true);
  applySaveResult(file, "same", fileFormat(file), {
    path: "/tmp/a",
    name: "a",
    encoding: "utf-16le",
    lineEnding: "CRLF",
    bom: true,
    revision: { sha256: "x" },
  });
  assert.equal(dirty(file), false);
});
test("compiler diagnostics retain source positions and reject outside-project paths", () => {
  const rows = buildDiagnostics(
    "sample.js:2:3: example diagnostic\n../../secret:1:2: bad\n/other/file.js:3:4: outside",
    "/project",
  );
  assert.deepEqual(
    rows.map((row) => [row.path, row.line, row.column]),
    [["/project/sample.js", 2, 3]],
  );
});

import { fuzzyMatch } from "./core.js";
test("fuzzy matcher chooses a better later contiguous path rather than first occurrences", () => {
  assert.deepEqual(fuzzyMatch("abc", "a---abc").indices, [4, 5, 6]);
});
test("Unicode fuzzy results highlight Chinese and whole emoji with original UTF-16 offsets", () => {
  const text = "项目/😀测试.js";
  const result = fuzzyMatch("😀测", text);
  assert.deepEqual(result.ranges, [
    { from: 3, to: 5 },
    { from: 5, to: 6 },
  ]);
  assert.equal(
    result.ranges.map((range) => text.slice(range.from, range.to)).join(""),
    "😀测",
  );
  assert.ok(fuzzyMatch("项目测", text).score > -Infinity);
});
test("fuzzy score prefers CamelCase boundaries over internal lowercase matches", () => {
  assert.ok(
    fuzzyMatch("fb", "fooBar").score > fuzzyMatch("fb", "foobar").score,
  );
});
test("fuzzy long inputs obey operation budget and explicitly report truncation", () => {
  const result = fuzzyMatch("aa", "a".repeat(100000), { maxOperations: 1000 });
  assert.equal(result.limited, true);
  assert.ok(result.work <= 1000);
  assert.ok(result.score > -Infinity);
  assert.equal(fuzzyMatch("a".repeat(100000), "a").limited, true);
});
test("CodeMirror merges cursors converging after deletion and retains reverse range direction", () => {
  const state = EditorState.create({
    doc: "abcdef",
    selection: EditorSelection.create([
      EditorSelection.cursor(2),
      EditorSelection.cursor(4),
    ]),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  });
  const deleted = state.update({ changes: { from: 1, to: 5 } }).state;
  assert.equal(deleted.selection.ranges.length, 1);
  assert.equal(deleted.selection.main.head, 1);
  const reverse = EditorState.create({
    doc: "abcdef",
    selection: { anchor: 5, head: 2 },
  }).update({ changes: { from: 0, insert: "xy" } }).state.selection.main;
  assert.equal(reverse.anchor, 7);
  assert.equal(reverse.head, 4);
});
test("shared-document changes map a peer pane selection without adopting the source cursor", () => {
  const source = EditorState.create({
    doc: "abcdef",
    selection: { anchor: 0 },
    extensions: [history()],
  });
  const peer = EditorSelection.single(5, 3);
  const transaction = source.update({
    changes: { from: 1, insert: "XY" },
    selection: { anchor: 3 },
  });
  const mapped = transaction.state.update({
    selection: peer.map(transaction.changes),
  }).state;
  assert.equal(mapped.doc.toString(), "aXYbcdef");
  assert.equal(mapped.selection.main.anchor, 7);
  assert.equal(mapped.selection.main.head, 5);
  assert.equal(transaction.state.selection.main.head, 3);
});
