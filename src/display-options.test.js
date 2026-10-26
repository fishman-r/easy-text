import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, Compartment } from '@codemirror/state';
import { undoDepth } from '@codemirror/commands';
import { normalizeDisplayOptions, displayExtensions, baseEditorSetup, rulerOffset } from './display-options.js';

test('display defaults and invalid persisted values are normalized without truthy coercion', () => {
  const defaults = { lineNumbers: true, showWhitespace: false, highlightActiveLine: true, rulerColumn: 0 };
  for (const value of [undefined, null, [], 'invalid', {lineNumbers:'false',showWhitespace:1,highlightActiveLine:0,rulerColumn:81}]) assert.deepEqual(normalizeDisplayOptions(value), defaults);
  assert.deepEqual(normalizeDisplayOptions({lineNumbers:false,showWhitespace:true,highlightActiveLine:false,rulerColumn:'100'}), {lineNumbers:false,showWhitespace:true,highlightActiveLine:false,rulerColumn:100});
  for (const column of [0,80,100,120]) assert.equal(normalizeDisplayOptions({rulerColumn:column}).rulerColumn, column);
  for (const column of [true,'',Infinity,{},'80px',-80,81]) assert.equal(normalizeDisplayOptions({rulerColumn:column}).rulerColumn, 0);
});

test('ruler follows measured font width and line padding, independent of text encoding and tabs', () => {
  assert.equal(rulerOffset(80, 7.5, 8), 608);
  assert.equal(rulerOffset(100, 9, 8), 908);
  assert.equal(rulerOffset(120, 10.25, 0), 1230);
  assert.equal(rulerOffset(80, 7.5, NaN), 600);
  for (const args of [[0,7],[81,7],[80,0],[80,NaN],[80,Infinity]]) assert.equal(rulerOffset(...args), null);
});

test('all display combinations configure real CodeMirror states without losing edits, selection or undo history', () => {
  const display = new Compartment();
  let state = EditorState.create({doc:'a\t b\n😀', extensions:[baseEditorSetup, display.of(displayExtensions())]});
  state = state.update({changes:{from:1,insert:'x'}, selection:{anchor:2}}).state;
  const text = state.doc.toString(), history = undoDepth(state);
  assert.equal(history,1);
  for (const lineNumbers of [false,true]) for (const showWhitespace of [false,true]) for (const highlightActiveLine of [false,true]) for (const rulerColumn of [0,80,100,120]) {
    state = state.update({effects:display.reconfigure(displayExtensions({lineNumbers,showWhitespace,highlightActiveLine,rulerColumn}))}).state;
    assert.equal(state.doc.toString(),text); assert.equal(state.selection.main.head,2); assert.equal(undoDepth(state),history);
  }
});
