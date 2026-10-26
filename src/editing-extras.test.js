import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState, EditorSelection} from '@codemirror/state';
import {history,undo,redo,undoSelection,redoSelection} from '@codemirror/commands';
import {getExtraEditingCommands,titleCase,swapCase,rot13,reverseLines,reverseSelectedLines,joinSelectedLines,selectAllSameText} from './editing-extras.js';
function editor(doc,ranges=[[0,0]]) {
 const view={state:EditorState.create({doc,selection:EditorSelection.create(ranges.map(([a,b])=>EditorSelection.range(a,b))),extensions:[history(),EditorState.allowMultipleSelections.of(true)]}),focus(){}};
 view.dispatch=transaction=>{view.state=transaction.state||view.state.update(transaction).state;};
 return view;
}
function command(view,id){return getExtraEditingCommands({view:()=>view}).find(c=>c[0]===id)[3]();}
test('Unicode case conversions and ASCII-only ROT13 preserve other characters',()=>{
 assert.equal(titleCase('hELLO  wORLD\nNEXT'),'Hello  World\nnext');
 assert.equal(swapCase('Straße 😀 中文'),'sTRASSE 😀 中文');
 assert.equal(rot13('AbZ! 中文 😀'),'NoM! 中文 😀');
 assert.equal(rot13(rot13('Hello 世界')),'Hello 世界');
});
test('empty selection transforms its word only',()=>{
 const view=editor('one tWO three',[[6,6]]);command(view,'text.titleCase');
 assert.equal(view.state.doc.toString(),'one Two three');
});
test('multiple reversed selections transform atomically and undo once',()=>{
 const view=editor('straße hello',[[6,0],[12,7]]);command(view,'text.swapCase');
 assert.equal(view.state.doc.toString(),'STRASSE HELLO');
 assert.equal(undo(view),true);assert.equal(view.state.doc.toString(),'straße hello');
 assert.equal(redo(view),true);assert.equal(view.state.doc.toString(),'STRASSE HELLO');
});
test('two cursors in one word do not produce overlapping edits',()=>{
 const view=editor('hello',[[1,1],[3,3]]);command(view,'text.swapCase');
 assert.equal(view.state.doc.toString(),'HELLO');
});
test('reverse lines preserves trailing newline and intentional blank lines',()=>{
 assert.equal(reverseLines('a\nb\n'),'b\na\n');
 assert.equal(reverseLines('a\n\nb\n'),'b\n\na\n');
 const view=editor('a\nb\nc\n');reverseSelectedLines(view);
 assert.equal(view.state.doc.toString(),'c\nb\na\n');
});
test('line selection ending at next line start excludes that line',()=>{
 const view=editor('a\nb\nc\n',[[0,4]]);reverseSelectedLines(view);
 assert.equal(view.state.doc.toString(),'b\na\nc\n');
});
test('join selected blocks once and keep terminal newline',()=>{
 const view=editor('a  \n  b\nc\n',[[0,8]]);joinSelectedLines(view);
 assert.equal(view.state.doc.toString(),'a b\nc\n');
 undo(view);assert.equal(view.state.doc.toString(),'a  \n  b\nc\n');
 const last=editor('a\n',[[0,0]]);assert.equal(joinSelectedLines(last),false);
});
test('join cursors sharing a line boundary produces one merged operation',()=>{
 const view=editor('a\nb\nc\n',[[0,0],[2,2]]);joinSelectedLines(view);
 assert.equal(view.state.doc.toString(),'a b c\n');
});
test('select all same text and selection history preserve document',()=>{
 const view=editor('cat cat dog',[[0,3]]);selectAllSameText(view);
 assert.deepEqual(view.state.selection.ranges.map(r=>[r.from,r.to]),[[0,3],[4,7]]);
 assert.equal(undoSelection(view),true);assert.equal(view.state.selection.ranges.length,1);
 assert.equal(redoSelection(view),true);assert.equal(view.state.selection.ranges.length,2);
 assert.equal(view.state.doc.toString(),'cat cat dog');
});
test('read-only state rejects modifying commands',()=>{
 const view=editor('abc',[[0,3]]);view.state=EditorState.create({doc:'abc',selection:{anchor:0,head:3},extensions:[EditorState.readOnly.of(true)]});
 assert.equal(command(view,'text.swapCase'),false);assert.equal(view.state.doc.toString(),'abc');
});

test('all occurrences uses primary word for cursors and preserves reverse direction',()=>{
 const view=editor('cat cat',[[1,1]]);assert.equal(selectAllSameText(view),true);
 assert.equal(view.state.selection.ranges.length,2);
 const reverse=editor('cat cat',[[3,0]]);selectAllSameText(reverse);
 assert.deepEqual(reverse.state.selection.ranges.map(r=>[r.anchor,r.head]),[[3,0],[7,4]]);
});
test('excessive matches do not apply a partial selection',()=>{
 const view=editor('x '.repeat(1001),[[0,1]]);assert.equal(selectAllSameText(view),false);
 assert.equal(view.state.selection.ranges.length,1);
});

test('indent conversion uses configured 2/4/8 tab stops with mixed whitespace',async()=>{
 const {convertLeadingIndent}=await import('./editing-extras.js');
 for(const size of [2,4,8]) {
  assert.equal(convertLeadingIndent(' \t x\n','spaces',size),' '.repeat(size+1)+'x\n');
  assert.equal(convertLeadingIndent(' '.repeat(size+1)+'x\n','tabs',size),'\t x\n');
  assert.equal(convertLeadingIndent('\t \tx','spaces',size),' '.repeat(size*2)+'x');
 }
});
test('indent conversion preserves non-leading text, blank lines, newline styles and remainder',async()=>{
 const {convertLeadingIndent}=await import('./editing-extras.js');
 assert.equal(convertLeadingIndent('     x \t y\r\n  \r\n\tend\n','tabs',4),'\t x \t y\r\n  \r\n\tend\n');
 assert.equal(convertLeadingIndent('abc\t xyz\n\n','spaces',8),'abc\t xyz\n\n');
 assert.equal(convertLeadingIndent('', 'tabs',2),'');
 assert.throws(()=>convertLeadingIndent('  x','bad',4),/模式/);
 assert.throws(()=>convertLeadingIndent('  x','tabs',3),/宽度/);
});
