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
