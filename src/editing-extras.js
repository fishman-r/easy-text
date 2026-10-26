import { isolateHistory, undoSelection, redoSelection } from '@codemirror/commands';
import { SearchCursor } from '@codemirror/search';
import { EditorSelection } from '@codemirror/state';

// Independently implemented operations over CodeMirror UTF-16 document positions.
export function titleCase(text) {
  return text.split(' ').map(word => {
    const [first, ...rest] = Array.from(word);
    return first === undefined ? '' : first.toUpperCase() + rest.join('').toLowerCase();
  }).join(' ');
}
export function swapCase(text) {
  return Array.from(text, character => character === character.toUpperCase()
    ? character.toLowerCase() : character.toUpperCase()).join('');
}
export function rot13(text) {
  return text.replace(/[a-z]/gi, character => {
    const base = character <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + (character.charCodeAt(0) - base + 13) % 26);
  });
}
export function reverseLines(text) {
  const trailing = text.endsWith('\n');
  const body = trailing ? text.slice(0, -1) : text;
  return body.split('\n').reverse().join('\n') + (trailing ? '\n' : '');
}

function mergeRanges(ranges) {
  const result = [];
  for (const range of ranges.sort((a, b) => a.from - b.from || a.to - b.to)) {
    const last = result.at(-1);
    if (last && range.from < last.to) last.to = Math.max(last.to, range.to);
    else if (!last || range.from !== last.from || range.to !== last.to) result.push({...range});
  }
  return result;
}
function commit(view, regions, transform) {
  if (view.state.readOnly) return false;
  const changes = mergeRanges(regions).map(({from, to}) => ({
    from, to, insert: transform(view.state.sliceDoc(from, to)),
  })).filter(change => change.insert !== view.state.sliceDoc(change.from, change.to));
  if (!changes.length) return false;
  view.dispatch({changes, annotations: isolateHistory.of('full'), userEvent: 'input.transform'});
  view.focus?.();
  return true;
}
function transformWords(view, transform) {
  const regions = view.state.selection.ranges.map(range => range.empty
    ? view.state.wordAt(range.head) : range).filter(Boolean);
  return commit(view, regions, transform);
}
function lineRegions(state, includeNext, ranges = state.selection.ranges) {
  return ranges.map(range => {
    const first = state.doc.lineAt(range.from);
    let last = state.doc.lineAt(range.to);
    if (!range.empty && range.to === last.from) last = state.doc.line(Math.max(first.number, last.number - 1));
    if (includeNext && first.number === last.number && last.number < state.doc.lines) last = state.doc.line(last.number + 1);
    return {from: first.from, to: last.to};
  });
}
export function reverseSelectedLines(view) {
  const selected = view.state.selection.ranges.filter(range => !range.empty);
  if (!selected.length) return commit(view, [{from:0,to:view.state.doc.length}], reverseLines);
  return commit(view, lineRegions(view.state, false, selected), reverseLines);
}
export function joinSelectedLines(view) {
  // Cursor/single-line selection joins the next line; a multi-line selection joins its lines.
  // Terminal empty line is excluded so a file's trailing newline survives.
  const regions = lineRegions(view.state, true).map(region => {
    if (region.to === view.state.doc.length && view.state.doc.lineAt(region.to).length === 0)
      return {...region, to: Math.max(region.from, region.to - 1)};
    return region;
  });
  return commit(view, regions, text => text.replace(/[\t ]*\n[\t ]*/g, ' '));
}
export function selectAllSameText(view) {
  const {state} = view;
  const primary = state.selection.main;
  const source = primary.empty ? state.wordAt(primary.head) : primary;
  if (!source || source.empty || source.from === source.to) return false;
  const cursor = new SearchCursor(state.doc, state.sliceDoc(source.from, source.to));
  const ranges = [];
  let mainIndex = 0;
  while (!cursor.next().done) {
    if (ranges.length >= 1000) return false;
    if (cursor.value.from === source.from) mainIndex = ranges.length;
    ranges.push(primary.anchor > primary.head
      ? EditorSelection.range(cursor.value.to, cursor.value.from)
      : EditorSelection.range(cursor.value.from, cursor.value.to));
  }
  if (!ranges.length) return false;
  view.dispatch({selection: EditorSelection.create(ranges, mainIndex), userEvent:'select.search.matches'});
  return true;
}
export function getExtraEditingCommands(ctx) {
  const run = operation => () => {
    const view = ctx.view();
    const changed = operation(view);
    if (!changed) ctx.toast?.('没有可执行的更改或选区历史');
    view.focus?.();
    return changed;
  };
  return [
    ['text.titleCase', '单词首字母大写', '', run(view => transformWords(view, titleCase))],
    ['text.swapCase', '交换大小写', '', run(view => transformWords(view, swapCase))],
    ['text.rot13', 'ROT13 字母转换', '', run(view => transformWords(view, rot13))],
    ['lines.reverse', '倒转行顺序', '', run(reverseSelectedLines)],
    ['lines.join', '合并行', '⌘ J', run(joinSelectedLines)],
    ['selection.allOccurrences', '选择全部相同文本', '⌃ ⌘ G', run(selectAllSameText)],
    ['selection.undo', '撤销选区变化', '⌘ U', run(undoSelection)],
    ['selection.redo', '重做选区变化', '⇧ ⌘ U', run(redoSelection)],
  ];
}

/** Convert only ASCII indentation, measuring mixed input against real tab stops. */
export function convertLeadingIndent(text, mode, tabSize) {
  if (mode !== 'tabs' && mode !== 'spaces') throw new Error('未知缩进转换模式');
  if (![2, 4, 8].includes(tabSize)) throw new Error('缩进宽度必须为 2、4 或 8');
  return text.replace(/^[\t ]+/gm, indentation => {
    let columns = 0;
    for (const character of indentation) {
      columns += character === '\t' ? tabSize - columns % tabSize : 1;
    }
    return mode === 'spaces' ? ' '.repeat(columns)
      : '\t'.repeat(Math.floor(columns / tabSize)) + ' '.repeat(columns % tabSize);
  });
}
