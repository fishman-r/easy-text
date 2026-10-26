import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState, Compartment} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {history, undoDepth} from '@codemirror/commands';
import {COLOR_SCHEMES, resolveColorScheme, colorSchemeExtension} from './color-schemes.js';
import {normalizeSettings} from './session-state.js';
import {validateEditorPreferences} from './preferences.js';

test('schemes migrate legacy light setting and persist each valid GUI selection', () => {
  assert.equal(resolveColorScheme({light:true}).id, 'light');
  assert.equal(resolveColorScheme({colorScheme:'missing'}).id, 'dark');
  assert.equal(new Set(COLOR_SCHEMES.map(s => s.id)).size, 7);
  for (const scheme of COLOR_SCHEMES) {
    const setting = validateEditorPreferences({theme:scheme.id,fontSize:14,indentSize:4,indentStyle:'spaces',layout:'single',wrap:false,minimap:true});
    assert.equal(setting.colorScheme, scheme.id);
    assert.equal(setting.light, !scheme.dark);
    assert.equal(normalizeSettings(JSON.parse(JSON.stringify(setting))).colorScheme, scheme.id);
    for (const value of Object.values(scheme.colors)) assert.match(value, /^#[0-9a-f]{6}$/i);
  }
});

test('changing schemes keeps document, selection and undo history intact', () => {
  const compartment = new Compartment();
  let state = EditorState.create({doc:'const answer = 42;',extensions:[history(),compartment.of(colorSchemeExtension())]});
  state = state.update({changes:{from:0,insert:'// 中文\n'},selection:{anchor:3}}).state;
  const text = state.doc.toString();
  for (const scheme of COLOR_SCHEMES) {
    state = state.update({effects:compartment.reconfigure(colorSchemeExtension({colorScheme:scheme.id}))}).state;
    assert.equal(state.doc.toString(), text);
    assert.equal(state.selection.main.head, 3);
    assert.equal(undoDepth(state), 1);
    assert.equal(state.facet(EditorView.darkTheme), scheme.dark);
  }
});
