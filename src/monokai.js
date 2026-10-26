import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Independently defined colors; this is not a Sublime theme asset or renderer.
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
    color: "#f92672",
  },
  { tag: [tags.string, tags.regexp], color: "#e6db74" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "#ae81ff" },
  { tag: tags.comment, color: "#75715e" },
  { tag: [tags.typeName, tags.className, tags.tagName], color: "#66d9ef" },
  {
    tag: [
      tags.definition(tags.variableName),
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
    ],
    color: "#a6e22e",
  },
  { tag: [tags.operator, tags.punctuation], color: "#f8f8f2" },
  { tag: tags.attributeName, color: "#a6e22e" },
  { tag: tags.variableName, color: "#f8f8f2" },
  { tag: tags.special(tags.variableName), color: "#fd971f" },
  { tag: tags.heading, color: "#a6e22e", fontWeight: "bold" },
  { tag: tags.link, color: "#66d9ef", textDecoration: "underline" },
]);
export const monokai = [
  EditorView.theme(
    {
      "&": { color: "#f8f8f2", backgroundColor: "#272822" },
      ".cm-content": { caretColor: "#f8f8f0" },
      ".cm-cursor,.cm-dropCursor": { borderLeftColor: "#f8f8f0" },
      ".cm-selectionBackground,&.cm-focused .cm-selectionBackground,::selection":
        { backgroundColor: "#49483e" },
      ".cm-activeLine": { backgroundColor: "#ffffff05" },
      ".cm-gutters": {
        backgroundColor: "#272822",
        color: "#8f908a",
        border: "none",
      },
      ".cm-activeLineGutter": { backgroundColor: "#3e3d32", color: "#bfc0b7" },
      ".cm-matchingBracket": {
        backgroundColor: "#49483e",
        outline: "1px solid #75715e",
      },
      ".cm-tooltip": {
        backgroundColor: "#3b3c35",
        border: "1px solid #77786e",
        color: "#f8f8f2",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "#57594a",
        color: "#fff",
      },
    },
    { dark: true },
  ),
  syntaxHighlighting(highlight),
];
