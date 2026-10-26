/** Convert imported paths and an authorized disk inventory into a compact tree. */
export function folderNodes(files, diskTree, workspace, query = "") {
  const root = { children: new Map() };
  const rootPath = workspace?.path?.replace(/\/$/, "");
  function add(relative, data) {
    const parts = relative.split("/").filter(Boolean);
    if (!parts.length) return;
    let node = root;
    let key = "";
    parts.forEach((part, index) => {
      key += (key ? "/" : "") + part;
      if (!node.children.has(part))
        node.children.set(part, {
          name: part,
          key,
          children: new Map(),
          kind: "directory",
        });
      node = node.children.get(part);
      if (index === parts.length - 1) Object.assign(node, data, { name: part });
    });
  }
  for (const entry of diskTree) {
    const relative =
      rootPath && entry.path?.startsWith(rootPath + "/")
        ? entry.path.slice(rootPath.length + 1)
        : entry.name;
    add(relative, {
      ...entry,
      loadedId: files.find((file) => file.path === entry.path)?.id,
    });
  }
  for (const file of files) {
    if (rootPath && (!file.path || !file.path.startsWith(rootPath + "/")))
      continue;
    const relative = rootPath
      ? file.path.slice(rootPath.length + 1)
      : file.name;
    add(relative, { kind: "file", path: file.path, loadedId: file.id });
  }
  const needle = query.trim().toLowerCase();
  const result = [];
  function visit(node, depth, parents) {
    const children = [...node.children.values()].sort(
      (a, b) =>
        (a.kind === "directory" ? 0 : 1) - (b.kind === "directory" ? 0 : 1) ||
        a.name.localeCompare(b.name),
    );
    for (const child of children) {
      if (
        needle &&
        !child.key.toLowerCase().includes(needle) &&
        child.kind === "file"
      )
        continue;
      const descendants = [];
      if (child.kind === "directory") {
        const before = result.length;
        result.push({ ...child, depth, parents });
        visit(child, depth + 1, [...parents, child.key]);
        if (needle && result.length === before + 1) result.pop();
      } else result.push({ ...child, depth, parents });
    }
  }
  visit(root, 0, []);
  return result;
}
