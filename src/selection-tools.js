import { EditorSelection } from "@codemirror/state";

export function selectionsByLine(state) {
  const ranges = [];
  for (const selection of state.selection.ranges) {
    if (selection.empty) {
      ranges.push(selection);
      continue;
    }
    const first = state.doc.lineAt(selection.from).number;
    const last = state.doc.lineAt(selection.to).number;
    for (let number = first; number <= last; number++) {
      const line = state.doc.line(number);
      if (number === last && selection.to === line.from && number > first)
        break;
      const from = Math.max(line.from, selection.from),
        to = Math.min(line.to, selection.to);
      ranges.push(
        selection.anchor > selection.head
          ? EditorSelection.range(to, from)
          : EditorSelection.range(from, to),
      );
      if (ranges.length > 10000)
        throw new Error("拆分选区超过 10000 行，请缩小选区");
    }
  }
  return EditorSelection.create(ranges);
}
