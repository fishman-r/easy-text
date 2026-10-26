/**
 * easy text's own bounded dynamic-programming matcher.
 * Scores and UTF-16 highlight ranges come from the same chosen code-point path.
 * The weights are local product decisions, not Sublime compatibility constants.
 */
export function fuzzyMatch(query, value, options = {}) {
  const maxQuery = Math.max(1, Math.min(128, options.maxQueryCodePoints || 64));
  const maxValue = Math.max(
    1,
    Math.min(8192, options.maxValueCodePoints || 4096),
  );
  const budget = Math.max(1, Math.min(262144, options.maxOperations || 65536));
  const queryPoints = [];
  for (const character of String(query).trim()) {
    if (queryPoints.length === maxQuery)
      return {
        score: -Infinity,
        indices: [],
        ranges: [],
        limited: true,
        work: 0,
      };
    queryPoints.push(character);
  }
  if (!queryPoints.length)
    return { score: 0, indices: [], ranges: [], limited: false, work: 0 };
  const characters = [];
  const offsets = [];
  let offset = 0;
  let limited = false;
  const allowed = Math.min(maxValue, Math.floor(budget / queryPoints.length));
  for (const character of String(value)) {
    if (characters.length === allowed) {
      limited = true;
      break;
    }
    offsets.push(offset);
    characters.push(character);
    offset += character.length;
  }
  const size = characters.length;
  const miss = (work) => ({
    score: -Infinity,
    indices: [],
    ranges: [],
    limited,
    work,
  });
  if (size < queryPoints.length) return miss(0);
  const folded = characters.map((character) => character.toLowerCase());
  const boundary = characters.map((character, index) => {
    if (index === 0) return 14;
    const previous = characters[index - 1];
    if (/[\s/\\._-]/u.test(previous)) return 9;
    const upper =
      character !== character.toLowerCase() &&
      character === character.toUpperCase();
    const previousLower =
      previous !== previous.toUpperCase() &&
      previous === previous.toLowerCase();
    const next = characters[index + 1];
    const acronym =
      upper &&
      next &&
      next !== next.toUpperCase() &&
      next === next.toLowerCase();
    return upper && (previousLower || acronym) ? 7 : 0;
  });
  const parents = [];
  let previous = new Float64Array(size).fill(-Infinity);
  let work = 0;
  for (let row = 0; row < queryPoints.length; row++) {
    const current = new Float64Array(size).fill(-Infinity);
    const parent = new Int32Array(size).fill(-1);
    const wanted = queryPoints[row].toLowerCase();
    let bestPrefix = -Infinity,
      bestIndex = -1;
    for (let position = 0; position < size; position++) {
      work++;
      if (row > 0 && position > 0) {
        const candidate = previous[position - 1] + (position - 1) * 0.4;
        if (candidate > bestPrefix) {
          bestPrefix = candidate;
          bestIndex = position - 1;
        }
      }
      if (folded[position] !== wanted) continue;
      const quality =
        10 +
        boundary[position] +
        (characters[position] === queryPoints[row] ? 0.5 : 0);
      if (row === 0) {
        current[position] = quality - position * 0.2;
        continue;
      }
      if (bestIndex >= 0) {
        current[position] = bestPrefix - (position - 1) * 0.4 + quality;
        parent[position] = bestIndex;
      }
      const adjacent =
        position > 0 ? previous[position - 1] + quality + 15 : -Infinity;
      if (adjacent > current[position]) {
        current[position] = adjacent;
        parent[position] = position - 1;
      }
    }
    parents.push(parent);
    previous = current;
  }
  let last = -1,
    score = -Infinity;
  for (let position = 0; position < size; position++)
    if (previous[position] > score) {
      score = previous[position];
      last = position;
    }
  if (last < 0) return miss(work);
  const path = [];
  for (let row = queryPoints.length - 1; row >= 0; row--) {
    path.push(last);
    last = parents[row][last];
  }
  path.reverse();
  return {
    score: score - size * 0.015,
    indices: path.map((position) => offsets[position]),
    ranges: path.map((position) => ({
      from: offsets[position],
      to: offsets[position] + characters[position].length,
    })),
    limited,
    work,
  };
}

export function fuzzyScore(query, value) {
  return fuzzyMatch(query, value).score;
}
export function rankFiles(files, query) {
  return files
    .map((file, index) => ({
      file,
      index,
      match: fuzzyMatch(query, file.name),
    }))
    .filter((result) => result.match.score > -Infinity)
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index);
}
export function filterFiles(files, query) {
  return rankFiles(files, query).map((result) => result.file);
}
export function uniqueName(name, files) {
  if (!files.some((f) => f.name === name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (files.some((f) => f.name === `${base} (${i})${ext}`)) i++;
  return `${base} (${i})${ext}`;
}
export function dirty(file) {
  return file.content !== file.saved || file.formatDirty === true;
}
export function validSession(data) {
  return (
    data &&
    Array.isArray(data.files) &&
    data.files.length > 0 &&
    data.files.every(
      (f) =>
        typeof f.id === "string" &&
        typeof f.name === "string" &&
        typeof f.content === "string" &&
        typeof f.saved === "string",
    ) &&
    new Set(data.files.map((f) => f.id)).size === data.files.length
  );
}

export function fileFormat(file) {
  return {
    encoding: file.encoding || "utf-8",
    lineEnding: file.lineEnding || "LF",
    bom: file.bom === true,
  };
}

/** A completed save must not erase edits or format choices made while awaiting I/O. */
export function applySaveResult(file, capturedContent, capturedFormat, result) {
  const now = fileFormat(file);
  const formatUnchanged =
    now.encoding === capturedFormat.encoding &&
    now.lineEnding === capturedFormat.lineEnding &&
    now.bom === capturedFormat.bom;
  Object.assign(file, {
    path: result.path,
    name: result.name,
    revision: result.revision,
    saved: capturedContent,
    externalConflict: false,
  });
  if (formatUnchanged)
    Object.assign(file, {
      encoding: result.encoding,
      lineEnding: result.lineEnding,
      bom: result.bom,
      formatDirty: false,
    });
  else file.formatDirty = true;
}
