import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreSession} from './session-state.js';
test('closed tabs restore only recoverable hidden buffers and preserve unsaved text',()=>{
 const files=[{id:'a',name:'a.txt',content:'live',saved:'live'},{id:'b',name:'b.txt',content:'unsaved',saved:'old'}];
 const result=restoreSession({files,active:'a',tabs:['a'],closedTabs:[{id:'a',index:0},{id:'b',index:1},{id:'missing',index:0},{id:'b',index:-1}],settings:{lineNumbers:false,showWhitespace:true,rulerColumn:80}});
 assert.deepEqual(result.closedTabs,[{id:'b',index:1}]);
 assert.equal(result.files[1].content,'unsaved');assert.equal(result.files[1].saved,'old');
 assert.equal(result.settings.lineNumbers,false);assert.equal(result.settings.showWhitespace,true);assert.equal(result.settings.rulerColumn,80);
});
