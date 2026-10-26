/** Parse common compiler file:line:column records without granting new paths. */
export function buildDiagnostics(output, root) {
  if (!root) return [];
  root = root.replace(/\/$/, "");
  const results = [];
  for (const raw of output.split("\n")) {
    const text = raw.replace(/\u001b\[[0-9;]*m/g, "");
    const match = /^\s*(.+?):(\d+):(\d+)(?::|\s|$)(.*)$/.exec(text);
    if (!match) continue;
    const relative = match[1].replace(/^\.\//, "");
    if (relative.split("/").includes("..")) continue;
    const path = relative.startsWith("/") ? relative : root + "/" + relative;
    if (!path.startsWith(root + "/")) continue;
    results.push({
      path,
      line: Math.max(1, Number(match[2])),
      column: Math.max(1, Number(match[3])),
      text,
    });
    if (results.length >= 200) break;
  }
  return results;
}
