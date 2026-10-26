import test from "node:test";
import assert from "node:assert/strict";
import { validSession } from "./core.js";
import { restoreSession } from "./session-state.js";
import { createMemoryBuffer, durableSession } from "./memory-buffer.js";

const saved = { id: "saved", name: "example.txt", content: "kept", saved: "kept" };
const secret = {
  ...createMemoryBuffer([], "private-id"),
  name: "secret-name", content: "secret-content", saved: "secret-saved",
  customMetadata: "secret-metadata",
};
function session(files, active = files.at(-1).id, tabs = files.map(file => file.id)) {
  return { files, active, tabs, paneFiles: [active, active], settings: {} };
}

test("new memory buffers have unique untitled names", () => {
  const first = createMemoryBuffer([], "first");
  assert.deepEqual(first, { id: "first", name: "untitled", content: "", saved: "", version: 0, memoryOnly: true });
  assert.equal(createMemoryBuffer([first], "second").name, "untitled (2)");
});

test("session excludes unsaved content, metadata and associated state without mutation", () => {
  const input = {
    ...session([saved, secret]),
    closedTabs: [{ id: secret.id, index: 0 }, { id: saved.id, index: 1 }],
    viewStates: [{ fileId: secret.id, extra: "secret-view" }, { fileId: saved.id }],
    settings: { fontSize: 18, bookmarks: { [secret.id]: [5], [saved.id]: [1] } },
  };
  const before = structuredClone(input);
  const output = durableSession(input);
  assert.deepEqual(input, before);
  assert.doesNotMatch(JSON.stringify(output), /secret-|private-id/);
  assert.deepEqual(output.settings, { fontSize: 18, bookmarks: { saved: [1] } });
  assert.deepEqual(output.closedTabs, [{ id: saved.id, index: 1 }]);
  assert.deepEqual(output.viewStates, [{ fileId: saved.id }]);
  assert.equal(output.files.find(file => file.id === output.active).content, "");
  assert.deepEqual(output.paneFiles, [output.active, output.active]);
});

test("an entirely memory session remains valid and restores only a blank buffer", () => {
  const output = durableSession(session([secret]));
  assert.ok(validSession(output));
  const restored = restoreSession(output);
  assert.equal(restored.files.length, 1);
  assert.equal(restored.files[0].content, "");
  assert.equal(restored.files[0].memoryOnly, true);
  assert.deepEqual(restored.tabs, [restored.active]);
});

test("closed durable files are not reopened when no durable tabs remain", () => {
  const output = durableSession(session([saved, secret], secret.id, [secret.id]));
  assert.ok(output.files.some(file => file.id === saved.id));
  assert.deepEqual(restoreSession(output).tabs, [output.active]);
  assert.notEqual(output.active, saved.id);
});

test("saved memory files and legacy pathless files remain durable", () => {
  const disk = { ...secret, path: "/tmp/saved.txt" };
  const output = durableSession(session([saved, disk]));
  assert.deepEqual(output.files, [saved, disk]);
  assert.equal(output.active, disk.id);
});

test("placeholder IDs cannot collide with existing documents", () => {
  const existing = { ...saved, id: "memory-session-placeholder" };
  const output = durableSession(session([existing, secret]));
  assert.equal(output.active, "memory-session-placeholder-2");
  assert.ok(validSession(output));
});
