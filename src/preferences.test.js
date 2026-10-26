import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEditorPreferences, validateFilePreferences} from './preferences.js';

const defaults = {fontSize:'14',indentSize:'4',theme:'dark',indentStyle:'spaces',layout:'single',wrap:false,minimap:true};
test('settings form maps choices to typed editor settings without accepting arbitrary configuration', () => {
  assert.deepEqual(validateEditorPreferences({...defaults,layout:'split',indentStyle:'tabs',fontSize:'18',extra:'ignored'}), {lineNumbers:true,showWhitespace:false,highlightActiveLine:true,rulerColumn:0,fontSize:18,indentSize:4,light:false,useTabs:true,split:true,wrap:false,minimap:true});
  for (const input of [{fontSize:'Infinity'},{fontSize:'14.5'},{fontSize:'25'},{theme:'custom'},{indentStyle:'custom'},{layout:'grid'},{indentSize:'3'},{wrap:'true'}]) assert.throws(()=>validateEditorPreferences({...defaults,...input}));
});
test('file-format form enforces BOM for UTF16 and requires an explicit normalization choice for mixed endings', () => {
  assert.deepEqual(validateFilePreferences({encoding:'utf-16be',lineEnding:'CRLF',bom:false}),{encoding:'utf-16be',lineEnding:'CRLF',bom:true});
  assert.throws(()=>validateFilePreferences({encoding:'utf-8',lineEnding:'mixed',bom:false}),/明确选择/);
  assert.equal(validateFilePreferences({encoding:'utf-8',lineEnding:'mixed',bom:false},{allowMixed:true}).lineEnding,'mixed');
  assert.throws(()=>validateFilePreferences({encoding:'gbk',lineEnding:'LF',bom:false}));
  assert.throws(()=>validateFilePreferences({encoding:'utf-8',lineEnding:'LF',bom:'false'}));
});
