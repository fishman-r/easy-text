/** A real, clickable document overview. Not Sublime's rendering implementation. */
export function attachMinimap(view, parent) {
  const canvas = document.createElement("canvas");
  canvas.className = "minimap";
  canvas.title = "文档概览：点击跳转";
  canvas.setAttribute("aria-label", "文档概览，点击定位到行");
  parent.append(canvas);
  function draw() {
    if (!canvas.isConnected) return;
    const height = parent.clientHeight || 300;
    const width = 92;
    const ratio = devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const style = getComputedStyle(view.dom);
    const color = (key, fallback) => style.getPropertyValue(`--scheme-${key}`).trim() || fallback;
    ctx.fillStyle = color("bg", "#272822");
    ctx.fillRect(0, 0, width, height);
    const lines = view.state.doc.lines;
    const step = Math.min(3, (height - 12) / Math.max(lines, 1));
    const stride = Math.max(1, Math.ceil(lines / 3000));
    for (let index = 1; index <= lines; index += stride) {
      const line = view.state.doc.line(index).text;
      const indent = (line.match(/^\s*/)?.[0].length || 0) * 1.2;
      const length = Math.min(80 - indent, line.trim().length * 1.1);
      ctx.fillStyle = /^\s*(\/\/|#|\*)/.test(line)
        ? color("comment", "#75715e")
        : /\b(function|class|const|def|return)\b/.test(line)
          ? color("type", "#66d9ef")
          : color("muted", "#a6a69c");
      if (length > 0)
        ctx.fillRect(
          5 + indent,
          6 + (index - 1) * step,
          length,
          Math.max(0.6, Math.min(1.5, step * 0.65)),
        );
    }
    const first = view.state.doc.lineAt(view.viewport.from).number;
    const last = view.state.doc.lineAt(view.viewport.to).number;
    ctx.fillStyle = color("selection", "#ffffff") + "55";
    ctx.fillRect(
      0,
      6 + (first - 1) * step,
      width,
      Math.max(5, (last - first + 1) * step),
    );
    const selected = view.state.doc.lineAt(
      view.state.selection.main.head,
    ).number;
    ctx.fillStyle = color("accent", "#a6a69c");
    ctx.fillRect(0, 6 + (selected - 1) * step, 3, 3);
  }
  canvas.addEventListener("click", (event) => {
    const step = Math.min(
      3,
      (canvas.clientHeight - 12) / Math.max(view.state.doc.lines, 1),
    );
    const number = Math.max(
      1,
      Math.min(
        view.state.doc.lines,
        Math.floor((event.offsetY - 6) / step) + 1,
      ),
    );
    view.dispatch({
      selection: { anchor: view.state.doc.line(number).from },
      scrollIntoView: true,
    });
    view.focus();
    draw();
  });
  view.scrollDOM.addEventListener("scroll", draw);
  const observer = new ResizeObserver(draw);
  observer.observe(parent);
  requestAnimationFrame(draw);
  return {
    draw,
    destroy() {
      observer.disconnect();
      view.scrollDOM.removeEventListener("scroll", draw);
      canvas.remove();
    },
  };
}
