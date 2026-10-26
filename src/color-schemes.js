import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Shared palette tokens drive both the workbench and the actual editor renderer.
export const COLOR_SCHEMES = [
  { id: 'dark', label: 'Monokai', dark: true, colors: {
    bg: '#272822', panel: '#30312b', text: '#f8f8f2', muted: '#a6a79e',
    line: '#49483e', hover: '#34352e', accent: '#a6e22e', selection: '#49483e',
    keyword: '#f92672', string: '#e6db74', number: '#ae81ff', comment: '#96927d',
    type: '#66d9ef', function: '#a6e22e',
  } },
  { id: 'light', label: '浅色', dark: false, colors: {
    bg: '#ffffff', panel: '#f4f5f7', text: '#24292f', muted: '#57606a',
    line: '#d0d7de', hover: '#eef1f5', accent: '#0969da', selection: '#cce2ff',
    keyword: '#cf222e', string: '#0a3069', number: '#8250df', comment: '#6e7781',
    type: '#953800', function: '#6639ba',
  } },
  { id: 'ocean', label: '深海蓝', dark: true, colors: {
    bg: '#0f2033', panel: '#162b42', text: '#dceaf7', muted: '#94adc5',
    line: '#304b65', hover: '#1b334b', accent: '#66c9f2', selection: '#2b506e',
    keyword: '#82b5ff', string: '#aad89c', number: '#e5b4fa', comment: '#8aabc1',
    type: '#73d5ca', function: '#f5ce8b',
  } },
  { id: 'graphite', label: '石墨灰', dark: true, colors: {
    bg: '#252629', panel: '#2d2f33', text: '#e6e7eb', muted: '#aaadb5',
    line: '#484b52', hover: '#34363c', accent: '#a7bce8', selection: '#454f63',
    keyword: '#c3a8ec', string: '#b9ce9f', number: '#e4b58e', comment: '#989da7',
    type: '#8ecbd2', function: '#e0ce9b',
  } },
  { id: 'aurora', label: '极光紫', dark: true, colors: {
    bg: '#241c35', panel: '#2e2442', text: '#eee6fb', muted: '#b6a5cc',
    line: '#514260', hover: '#382c4c', accent: '#c3a0ff', selection: '#59416f',
    keyword: '#f19aca', string: '#b8e29c', number: '#eac08c', comment: '#aa96be',
    type: '#86dfd6', function: '#c9b0ff',
  } },
  { id: 'paper', label: '暖纸', dark: false, colors: {
    bg: '#faf6ed', panel: '#f1eadc', text: '#423c32', muted: '#776b58',
    line: '#d9cfbc', hover: '#eee7d7', accent: '#97612a', selection: '#e4d5b8',
    keyword: '#9e3654', string: '#4d6d2b', number: '#8156a5', comment: '#807563',
    type: '#246c78', function: '#8c5523',
  } },
  { id: 'mint', label: '薄荷白', dark: false, colors: {
    bg: '#f4fbf7', panel: '#e8f3ed', text: '#263e35', muted: '#5d766a',
    line: '#c6ddd0', hover: '#e2efe7', accent: '#167253', selection: '#c5e4d5',
    keyword: '#a33770', string: '#3e702b', number: '#7250a3', comment: '#647e70',
    type: '#1b6f83', function: '#8b5c20',
  } },
];

export function resolveColorScheme(settings = {}) {
  return COLOR_SCHEMES.find(scheme => scheme.id === settings?.colorScheme)
    ?? COLOR_SCHEMES.find(scheme => scheme.id === (settings?.light === true ? 'light' : 'dark'));
}

export function colorSchemeExtension(settings = {}) {
  const { colors: c, dark } = resolveColorScheme(settings);
  return [
    EditorView.theme({
      '&': { color: c.text, backgroundColor: c.bg },
      '.cm-content': { caretColor: c.text },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.text },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: c.selection,
      },
      '.cm-activeLine': { backgroundColor: c.hover },
      '.cm-gutters': { backgroundColor: c.bg, color: c.muted, border: 'none' },
      '.cm-activeLineGutter': { backgroundColor: c.hover, color: c.text },
      '.cm-foldPlaceholder': { backgroundColor: c.panel, color: c.muted, borderColor: c.line },
      '&.cm-focused .cm-matchingBracket, .cm-matchingBracket': {
        backgroundColor: c.selection, outline: `1px solid ${c.accent}`,
      },
      '.cm-selectionMatch, .cm-searchMatch': { backgroundColor: c.selection },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: c.selection, outline: `1px solid ${c.accent}` },
      '.cm-panels, .cm-tooltip': { backgroundColor: c.panel, color: c.text, borderColor: c.line },
      '.cm-panels-top': { borderBottom: `1px solid ${c.line}` },
      '.cm-panels-bottom': { borderTop: `1px solid ${c.line}` },
      '.cm-panel.cm-search': { backgroundColor: c.panel, color: c.text },
      '.cm-textfield': { backgroundColor: c.bg, color: c.text, border: `1px solid ${c.line}` },
      '.cm-button': { backgroundImage: 'none', backgroundColor: c.hover, color: c.text, border: `1px solid ${c.line}` },
      '.cm-panel.cm-search button[name=close]': { color: c.text },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: c.selection, color: c.text },
    }, { dark }),
    // A non-fallback style disables basicSetup's defaultHighlightStyle fallback.
    syntaxHighlighting(HighlightStyle.define([
      { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: c.keyword },
      { tag: [tags.string, tags.regexp], color: c.string },
      { tag: [tags.number, tags.bool, tags.null, tags.atom], color: c.number },
      { tag: tags.comment, color: c.comment },
      { tag: [tags.typeName, tags.className, tags.tagName, tags.namespace], color: c.type },
      { tag: [tags.variableName, tags.propertyName, tags.operator, tags.punctuation], color: c.text },
      { tag: [tags.definition(tags.variableName), tags.function(tags.variableName), tags.function(tags.propertyName), tags.attributeName], color: c.function },
      { tag: tags.special(tags.variableName), color: c.number },
      { tag: tags.heading, color: c.function, fontWeight: 'bold' },
      { tag: [tags.link, tags.url], color: c.type, textDecoration: 'underline' },
      { tag: tags.emphasis, fontStyle: 'italic' },
      { tag: tags.strong, fontWeight: 'bold' },
      { tag: tags.strikethrough, textDecoration: 'line-through' },
      { tag: tags.invalid, color: c.keyword, textDecoration: 'underline' },
    ])),
  ];
}
