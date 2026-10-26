import { normalizeDisplayOptions } from "./display-options.js";
export function validateEditorPreferences(input) {
  const fontSize = Number(input.fontSize), indentSize = Number(input.indentSize);
  if (!Number.isInteger(fontSize) || fontSize < 10 || fontSize > 24) throw new Error('字号请选择 10 至 24 的整数');
  if (![2, 4, 8].includes(indentSize)) throw new Error('请选择有效的缩进宽度');
  if (!['dark', 'light'].includes(input.theme)) throw new Error('请选择有效的主题');
  if (!['spaces', 'tabs'].includes(input.indentStyle)) throw new Error('请选择空格或 Tab 缩进');
  if (!['single', 'split'].includes(input.layout)) throw new Error('请选择有效的编辑布局');
  for (const key of ['wrap', 'minimap']) if (typeof input[key] !== 'boolean') throw new Error('显示选项必须为开关');
  const display = normalizeDisplayOptions(input);
  return { ...display, fontSize, indentSize, light: input.theme === 'light', useTabs: input.indentStyle === 'tabs', split: input.layout === 'split', wrap: input.wrap, minimap: input.minimap };
}

export function validateFilePreferences(input, { allowMixed = false } = {}) {
  if (!['utf-8', 'utf-16le', 'utf-16be'].includes(input.encoding)) throw new Error('请选择支持的文件编码');
  if (!['LF', 'CRLF', 'CR', ...(allowMixed ? ['mixed'] : [])].includes(input.lineEnding)) throw new Error('请明确选择 LF、CRLF 或 CR 换行格式');
  if (typeof input.bom !== 'boolean') throw new Error('请选择是否保存 BOM');
  return { encoding: input.encoding, lineEnding: input.lineEnding, bom: input.encoding !== 'utf-8' || input.bom };
}

/** Form-only settings. JSON is an internal storage format, never an editing surface. */
export function createPreferences(ctx) {
  const dialog = document.createElement('dialog');
  dialog.id = 'preferences-dialog'; dialog.className = 'app-dialog settings-dialog';
  dialog.setAttribute('aria-labelledby', 'preferences-title');
  dialog.innerHTML = `<form><div class="dialog-label"><h2 id="preferences-title">设置</h2><button type="button" data-close aria-label="关闭设置">×</button></div>
    <div class="dialog-body"><fieldset><legend>编辑器默认设置</legend><div class="form-grid">
    <label class="form-field">主题<select name="theme"><option value="dark">深色（Monokai）</option><option value="light">浅色</option></select></label>
    <label class="form-field">字体大小<input name="fontSize" type="number" min="10" max="24" step="1" required></label>
    <label class="form-field">缩进方式<select name="indentStyle"><option value="spaces">空格</option><option value="tabs">Tab 制表符</option></select></label>
    <label class="form-field">缩进宽度<select name="indentSize"><option value="2">2</option><option value="4">4</option><option value="8">8</option></select></label>
    <label class="form-field">编辑布局<select name="layout"><option value="single">单栏</option><option value="split">双栏</option></select></label>
    <div class="form-field"><label><input type="checkbox" name="wrap"> 自动换行</label><label><input type="checkbox" name="minimap"> 显示文档概览</label></div>
    <label class="form-field">列标尺<select name="rulerColumn"><option value="0">关闭</option><option value="80">80 列</option><option value="100">100 列</option><option value="120">120 列</option></select></label>
    <div class="form-field"><label><input type="checkbox" name="lineNumbers"> 显示行号</label><label><input type="checkbox" name="showWhitespace"> 显示空格与 Tab</label><label><input type="checkbox" name="highlightActiveLine"> 高亮当前行</label></div>
    </div><p class="panel-note">更改缩进设置不会自动改写已有文本。当前文件的插件设置可覆盖默认值。</p><button type="button" data-reset-overrides hidden>当前文件使用全局编辑设置</button></fieldset>
    <fieldset><legend>更多设置</legend><div class="settings-links"><button type="button" data-command="language.configure">界面语言</button><button type="button" data-command="keybindings.edit">快捷键</button><button type="button" data-command="snippet.manage">代码片段</button><button type="button" data-command="build.panel">构建配置</button><button type="button" data-command="plugins.manage">插件管理</button><button type="button" data-command="file.encoding">当前文件格式</button></div></fieldset>
    <p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" data-close>取消</button><button class="primary-button" type="submit">应用设置</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), field = name => form.elements.namedItem(name);
  function open(focusName) {
    const settings = ctx.getSettings();
    const display = normalizeDisplayOptions(settings);
    for (const key of ['lineNumbers','showWhitespace','highlightActiveLine']) field(key).checked = display[key];
    field('rulerColumn').value = String(display.rulerColumn);
    field('theme').value = settings.light ? 'light' : 'dark'; field('fontSize').value = settings.fontSize;
    field('indentStyle').value = settings.useTabs ? 'tabs' : 'spaces'; field('indentSize').value = settings.indentSize;
    field('layout').value = settings.split ? 'split' : 'single'; field('wrap').checked = !!settings.wrap; field('minimap').checked = settings.minimap !== false;
    dialog.querySelector('[data-reset-overrides]').hidden = !ctx.hasOverrides();
    dialog.querySelector('.form-error').hidden = true;
    dialog.showModal(); (field(focusName || 'theme') || field('theme')).focus();
  }
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-close')) dialog.close();
    if (button.dataset.command) { dialog.close(); ctx.navigate(button.dataset.command); }
    if (button.hasAttribute('data-reset-overrides')) { ctx.resetOverrides(); button.hidden = true; }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const input = Object.fromEntries(['theme', 'fontSize', 'indentStyle', 'indentSize', 'layout'].map(name => [name, field(name).value]));
      for (const key of ['lineNumbers','showWhitespace','highlightActiveLine']) input[key] = field(key).checked;
      input.rulerColumn = field('rulerColumn').value;
      input.wrap = field('wrap').checked; input.minimap = field('minimap').checked;
      ctx.apply(validateEditorPreferences(input)); dialog.close();
    } catch (error) { const output = dialog.querySelector('.form-error'); output.textContent = error.message; output.hidden = false; }
  });

  const formatDialog = document.createElement('dialog');
  formatDialog.id = 'file-format-dialog'; formatDialog.className = 'app-dialog'; formatDialog.setAttribute('aria-labelledby', 'file-format-title');
  formatDialog.innerHTML = `<form><div class="dialog-label"><h2 id="file-format-title">当前文件格式</h2><button type="button" data-close aria-label="关闭文件格式设置">×</button></div><div class="dialog-body"><p id="file-format-name"></p><p id="file-format-note" class="panel-note"></p><div class="form-grid">
    <label class="form-field">保存编码<select name="encoding"><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option></select></label>
    <label class="form-field">换行格式<select name="lineEnding"><option value="LF">LF（Unix / macOS）</option><option value="CRLF">CRLF（Windows）</option><option value="CR">CR</option><option value="mixed" disabled>混合换行（请选择规范化格式）</option></select></label>
    <label class="form-field"><span><input type="checkbox" name="bom"> 保存 BOM 标记</span><small>UTF-16 文件始终保存 BOM。</small></label></div><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" data-close>取消</button><button class="primary-button" type="submit">应用格式</button></div></form>`;
  document.body.append(formatDialog);
  const formatForm = formatDialog.querySelector('form'), formatField = name => formatForm.elements.namedItem(name);
  let target = null, formatOptions = {};
  function syncBom() { const utf16 = formatField('encoding').value !== 'utf-8'; formatField('bom').disabled = utf16; if (utf16) formatField('bom').checked = true; }
  function openFormat(file, options = {}) {
    target = file; formatOptions = options;
    formatDialog.querySelector('#file-format-name').textContent = file.name;
    formatDialog.querySelector('#file-format-note').textContent = options.requireLineEnding ? '文件含混合换行。请明确选择统一格式后继续保存；取消将保留原文件。' : '选择后仍需保存文件才会写入磁盘；取消不会更改当前格式。';
    formatField('encoding').value = file.encoding || 'utf-8'; formatField('lineEnding').value = file.lineEnding || 'LF'; formatField('bom').checked = !!file.bom; syncBom();
    formatDialog.querySelector('.form-error').hidden = true; formatDialog.showModal(); formatField(options.focus || (options.requireLineEnding ? 'lineEnding' : 'encoding')).focus();
  }
  formatField('encoding').addEventListener('change', syncBom);
  formatDialog.addEventListener('click', event => { if (event.target.closest('[data-close]')) { formatOptions.onCancel?.(); formatDialog.close(); } });
  formatDialog.addEventListener('cancel', () => formatOptions.onCancel?.());
  formatForm.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const patch = validateFilePreferences({ encoding: formatField('encoding').value, lineEnding: formatField('lineEnding').value, bom: formatField('bom').checked }, { allowMixed: !formatOptions.requireLineEnding });
      ctx.applyFormat(target, patch); formatDialog.close(); await formatOptions.onApply?.();
    } catch (error) { const output = formatDialog.querySelector('.form-error'); output.textContent = error.message; output.hidden = false; }
  });
  return { open, openFormat };
}
