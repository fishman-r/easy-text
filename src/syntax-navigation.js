import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { findSymbols } from "./text-tools.js";

const supported = /\.(?:[cm]?js|jsx|ts|tsx)$/i;
const definitionNodes = new Set([
  "VariableDefinition",
  "TypeDefinition",
  "PropertyDefinition",
]);
const scopeNodes = new Set([
  "Block",
  "Script",
  "ClassBody",
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunction",
  "MethodDeclaration",
]);

/** Syntax-based, same-document navigation. It is deliberately not a type checker. */
export function syntaxSymbols(state, filename) {
  if (!supported.test(filename))
    return {
      symbols: findSymbols(state.doc.toString(), filename),
      syntaxAware: false,
      complete: true,
    };
  const tree =
    ensureSyntaxTree(state, state.doc.length, 100) || syntaxTree(state);
  const symbols = [];
  tree.iterate({
    enter(reference) {
      if (!definitionNodes.has(reference.name)) return;
      const node = reference.node;
      const parent = node.parent;
      if (!parent) return;
      let scope = parent;
      // A function/class declaration's name belongs to the enclosing scope.
      if (
        [
          "FunctionDeclaration",
          "ClassDeclaration",
          "InterfaceDeclaration",
          "TypeAliasDeclaration",
          "EnumDeclaration",
        ].includes(parent.name)
      )
        scope = parent.parent;
      while (scope && !scopeNodes.has(scope.name)) scope = scope.parent;
      const kind =
        parent.name === "ParamList"
          ? "parameter"
          : /Function/.test(parent.name)
            ? "function"
            : /Class|Interface|TypeAlias|Enum/.test(parent.name)
              ? "type"
              : reference.name === "PropertyDefinition"
                ? "property"
                : "variable";
      symbols.push({
        name: state.sliceDoc(node.from, node.to),
        line: state.doc.lineAt(node.from).number,
        from: node.from,
        to: node.to,
        kind,
        scopeFrom: scope?.from || 0,
        scopeTo: scope?.to ?? state.doc.length,
      });
    },
  });
  return {
    symbols,
    syntaxAware: true,
    complete: tree.length >= state.doc.length,
  };
}

export function localDefinition(state, filename) {
  if (!supported.test(filename)) return null;
  const position = state.selection.main.head;
  const tree =
    ensureSyntaxTree(state, Math.min(state.doc.length, position + 1), 100) ||
    syntaxTree(state);
  const node = tree.resolveInner(position, -1);
  if (
    ![
      "VariableName",
      "TypeName",
      "VariableDefinition",
      "TypeDefinition",
    ].includes(node.name)
  )
    return null;
  const name = state.sliceDoc(node.from, node.to);
  const candidates = syntaxSymbols(state, filename).symbols.filter(
    (symbol) =>
      symbol.name === name &&
      symbol.scopeFrom <= position &&
      symbol.scopeTo >= position &&
      symbol.kind !== "property",
  );
  candidates.sort(
    (a, b) =>
      a.scopeTo - a.scopeFrom - (b.scopeTo - b.scopeFrom) ||
      Math.abs(position - a.from) - Math.abs(position - b.from),
  );
  return candidates[0] || null;
}
