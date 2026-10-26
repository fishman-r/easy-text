import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalShortcut,shortcutSignature,shortcutMatches,validateShortcutRows,migrateSnippets,validateSnippets,matchingSnippetPrefix,normalizeBuildSettings,validateBuildSettings,persistSettingsWithBackup} from './settings-data.js';

test('shortcut aliases and platform modifiers identify conflicts',()=>{
 assert.equal(canonicalShortcut('command-Shift-K'),'Shift-Meta-k');
 assert.equal(shortcutSignature('Mod-k','Mac'),shortcutSignature('Meta-k','Mac'));
 assert.equal(shortcutSignature('Mod-k','Linux'),shortcutSignature('Ctrl-k','Linux'));
 assert.throws(()=>validateShortcutRows([{binding:'Mod-k',command:'x'},{binding:'Meta-k',command:'x'}],[['x']],{platform:'Mac'}),/冲突/);
 assert.throws(()=>validateShortcutRows([{binding:'Mod-s',command:'x'}],[['x']]),/内置/);
 assert.throws(()=>validateShortcutRows([{binding:'Mod-q',command:'x'}],[['x']]),/内置/);
});
test('unavailable existing commands survive forms without losing binding',()=>{
 assert.deepEqual(validateShortcutRows([{binding:'Mod-k',command:'plugin.old'}],[],{originalBindings:{'Mod-k':'plugin.old'}}),{'Mod-k':'plugin.old'});
 assert.throws(()=>validateShortcutRows([{binding:'Mod-k',command:'plugin.new'}],[]),/不可用/);
});
test('shortcut dispatch requires exact physical modifiers',()=>{
 const event={key:'K',code:'KeyK',metaKey:true,ctrlKey:false,altKey:false,shiftKey:true};
 assert.equal(shortcutMatches(event,'Mod-Shift-k','Mac'),true);
 assert.equal(shortcutMatches({...event,ctrlKey:true},'Mod-Shift-k','Mac'),false);
});
test('legacy snippets preserve source and metadata while adding optional prefixes',()=>{
 const old=[{name:'旧片段',body:'  ${1:x}\n\tend',language:'js'}];
 const rows=migrateSnippets(old);
 assert.deepEqual(validateSnippets(rows),[{...old[0],prefix:''}]);
 assert.equal(old[0].prefix,undefined);
 assert.throws(()=>validateSnippets([{name:'A',prefix:'fn',body:'a'},{name:'B',prefix:'fn',body:'b'}]),/重复/);
});
test('snippet triggers respect boundaries and longest prefix',()=>{
 const snippets=[{prefix:'fn'},{prefix:'.fn'}];
 assert.equal(matchingSnippetPrefix(snippets,' .fn',4).prefix,'.fn');
 assert.equal(matchingSnippetPrefix(snippets,'myfn',4),null);
 assert.equal(matchingSnippetPrefix(snippets,'fn',2).prefix,'fn');
});
test('build argument fields preserve literal argv and legacy metadata',()=>{
 const args=['run','a b','"quoted"','$(touch nope)','',"a'b"];
 const old={command:'node',args,custom:'keep'};
 assert.deepEqual(validateBuildSettings(' node ',args,normalizeBuildSettings(old)),old);
 assert.throws(()=>validateBuildSettings('node',['bad\0']),/参数/);
});
test('first form save keeps original storage backup and later saves preserve it',()=>{
 const values=new Map([['key','{"legacy": true}']]);
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 persistSettingsWithBackup(storage,'key',{first:1});
 persistSettingsWithBackup(storage,'key',{second:2});
 assert.equal(values.get('key.before-forms-v1'),'{"legacy": true}');
 assert.equal(values.get('key'),'{"second":2}');
});
