import { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightWhitespace, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, keymap } from '@codemirror/view';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

export function normalizeDisplayOptions(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const column = typeof value.rulerColumn === 'string' && /^(0|80|100|120)$/.test(value.rulerColumn) ? Number(value.rulerColumn) : value.rulerColumn;
  return {
    lineNumbers: typeof value.lineNumbers === 'boolean' ? value.lineNumbers : true,
    showWhitespace: typeof value.showWhitespace === 'boolean' ? value.showWhitespace : false,
    highlightActiveLine: typeof value.highlightActiveLine === 'boolean' ? value.highlightActiveLine : true,
    rulerColumn: [0, 80, 100, 120].includes(column) ? column : 0,
  };
}

// CodeMirror's documented customizable basicSetup recipe, without the three
// display extensions supplied by displayExtensions. Keep this outside its Compartment
// so display changes never reset history, completion, search or folding.
export const baseEditorSetup = [
  highlightSpecialChars(), history(), foldGutter(), drawSelection(), dropCursor(),
  EditorState.allowMultipleSelections.of(true), indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }), bracketMatching(),
  closeBrackets(), autocompletion(), rectangularSelection(), crosshairCursor(),
  highlightSelectionMatches(), keymap.of([...closeBracketsKeymap, ...defaultKeymap,
    ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap]),
];

/** A ruler marks a visual monospace column boundary, not a UTF-16 offset.
 * Tabs occupy their configured visual width. No document text is decorated or changed.
 */
export function rulerOffset(column, characterWidth, linePadding = 0) {
  if (![80, 100, 120].includes(column) || !Number.isFinite(characterWidth) || characterWidth <= 0) return null;
  return column * characterWidth + (Number.isFinite(linePadding) ? linePadding : 0);
}

function columnRuler(column) {
  return [EditorView.theme({
    '.cm-content': {
      backgroundImage: 'linear-gradient(to right, var(--et-ruler-color, #88888866), var(--et-ruler-color, #88888866))',
      backgroundRepeat: 'no-repeat', backgroundSize: '1px 100%',
      backgroundPosition: 'var(--et-ruler-x, -1px) 0',
    },
  }), ViewPlugin.fromClass(class {
    constructor(view) { this.view = view; this.alive = true; this.measure(); }
    update(update) { if (update.geometryChanged || update.viewportChanged) this.measure(); }
    measure() {
      this.view.requestMeasure({ key: this,
        read: view => {
          const line = view.contentDOM.querySelector('.cm-line');
          const padding = line ? parseFloat(view.contentDOM.ownerDocument.defaultView.getComputedStyle(line).paddingLeft) : 0;
          return rulerOffset(column, view.defaultCharacterWidth, padding);
        },
        write: offset => { if (this.alive && offset !== null) this.view.contentDOM.style.setProperty('--et-ruler-x', offset + 'px'); },
      });
    }
    destroy() { this.alive = false; this.view.contentDOM.style.removeProperty('--et-ruler-x'); }
  })];
}

/** Combine with baseEditorSetup, never with unmodified basicSetup. */
export function displayExtensions(input) {
  const options = normalizeDisplayOptions(input);
  return [
    options.lineNumbers ? lineNumbers() : [],
    options.highlightActiveLine ? [highlightActiveLine(), highlightActiveLineGutter()] : [],
    options.showWhitespace ? highlightWhitespace() : [],
    options.rulerColumn ? columnRuler(options.rulerColumn) : [],
  ];
}
