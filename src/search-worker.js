import { searchPattern } from "./text-tools.js";
self.onmessage = (event) => {
  try {
    const { files, query, regex, caseSensitive, replacement, preview } =
      event.data;
    const pattern = searchPattern(query, regex, caseSensitive, true);
    if (preview) {
      const changes = [];
      for (const file of files) {
        const after = file.content.replace(
          pattern,
          regex ? replacement : () => replacement,
        );
        if (after !== file.content)
          changes.push({ id: file.id, before: file.content, after });
      }
      self.postMessage({ changes });
    } else {
      const matches = [];
      outer: for (const file of files) {
        const lines = file.content.split("\n");
        for (let index = 0; index < lines.length; index++) {
          pattern.lastIndex = 0;
          for (const match of lines[index].matchAll(pattern)) {
            matches.push({
              fileId: file.id,
              line: index + 1,
              column: match.index + 1,
              text: lines[index],
            });
            if (matches.length >= 1000) break outer;
          }
        }
      }
      self.postMessage({ matches });
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
