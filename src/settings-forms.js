import {shortcutRows,validateShortcutRows,canonicalShortcut,migrateSnippets,validateSnippets} from './settings-data.js';
const escapeHTML=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

/** Accessible controls edit the existing persisted model; no configuration source editor. */
export function createSettingsForms(ctx){
  document.body.insertAdjacentHTML('beforeend',`
    <dialog id="shortcut-dialog" class="settings-dialog" aria-labelledby="shortcut-title"><form id="shortcut-form">
      <div class="dialog-label"><h2 id="shortcut-title">自定义快捷键</h2><button type="button" data-dismiss="shortcut-dialog" aria-label="关闭快捷键设置">×</button></div>
      <div class="settings-body"><p>选择命令、修饰键与主键，无需实际按组合键。Mod 在 macOS 上表示 Command，在其他系统上表示 Ctrl。内置组合键不能分配给其他命令。</p>
      <div class="settings-toolbar"><button type="button" data-shortcut-action="add">添加快捷键</button><span id="shortcut-record-status" role="status" aria-live="polite"></span></div>
      <div id="shortcut-rows" class="settings-list"></div><p id="shortcut-error" class="settings-error" role="alert" hidden></p></div>
      <div class="settings-actions"><button type="button" data-dismiss="shortcut-dialog">取消</button><button type="submit">保存快捷键</button></div>
    </form></dialog>
    <dialog id="snippet-dialog" class="settings-dialog" aria-labelledby="snippet-title"><form id="snippet-form">
      <div class="dialog-label"><h2 id="snippet-title">管理代码片段</h2><button type="button" data-dismiss="snippet-dialog" aria-label="关闭代码片段设置">×</button></div>
      <div class="settings-body"><p>前缀可选：在编辑器输入前缀后按 Tab 插入。占位字段可写 \${1:名称}，插入后用 Tab 跳转。</p>
      <div class="settings-toolbar"><button type="button" data-snippet-action="add">添加代码片段</button></div><div id="snippet-rows" class="settings-list"></div><p id="snippet-error" class="settings-error" role="alert" hidden></p></div>
      <div class="settings-actions"><button type="button" data-dismiss="snippet-dialog">取消</button><button type="submit">保存代码片段</button></div>
    </form></dialog>`);
  const shortcutDialog=document.querySelector('#shortcut-dialog');
  const snippetDialog=document.querySelector('#snippet-dialog');
  let shortcuts=[];
  let originalBindings={};
  
  let snippets=[];
  function error(id,message=''){const node=document.getElementById(id);node.textContent=message;node.hidden=!message;}
  function renderShortcuts(){
    const commands=ctx.getCommands();
    document.querySelector('#shortcut-rows').innerHTML=shortcuts.map((row,index)=>{
      const unavailable=row.command&&!commands.some(command=>command[0]===row.command);
      let parts;try{parts=canonicalShortcut(row.binding).split('-');}catch{parts=['k'];}
      const key=parts.pop();
      const keys=[...new Set([..."abcdefghijklmnopqrstuvwxyz0123456789",...Array.from({length:24},(_,i)=>'F'+(i+1)),'Space','Enter','Tab','Escape','Backspace','Delete','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Minus','Equal','Slash','Backslash','BracketLeft','BracketRight','Semicolon','Quote','Backquote','Comma','Period',key])];
      return `<div class="settings-row shortcut-row"><label class="settings-field" for="shortcut-command-${index}"><span>命令 ${index+1}</span><select id="shortcut-command-${index}" data-shortcut-field="command" data-index="${index}"><option value="">请选择命令</option>${unavailable?`<option value="${escapeHTML(row.command)}" selected>暂不可用：${escapeHTML(row.command)}（保留现有设置）</option>`:''}${commands.map(command=>`<option value="${escapeHTML(command[0])}" ${row.command===command[0]?'selected':''}>${escapeHTML(command[1])}</option>`).join('')}</select></label><fieldset><legend>修饰键</legend>${['Mod','Ctrl','Alt','Shift','Meta'].map(modifier=>`<label><input type="checkbox" data-modifier="${modifier}" data-index="${index}" ${parts.includes(modifier)?'checked':''}>${modifier}</label>`).join('')}</fieldset><label class="settings-field" for="shortcut-key-${index}"><span>主键</span><select id="shortcut-key-${index}" data-primary-key data-index="${index}">${keys.map(value=>`<option value="${escapeHTML(value)}" ${value===key?'selected':''}>${escapeHTML(value)}</option>`).join('')}</select></label><button type="button" data-shortcut-action="remove" data-index="${index}" aria-label="删除第 ${index+1} 条快捷键">删除</button></div>`;
    }).join('')||'<p class="settings-empty">还没有自定义快捷键。内置快捷键仍然可用。</p>';

  }
  function openShortcuts(){originalBindings={...ctx.getBindings()};shortcuts=shortcutRows(originalBindings);error('shortcut-error');renderShortcuts();shortcutDialog.showModal();}
  shortcutDialog.addEventListener('input',event=>{const field=event.target.dataset.shortcutField;if(field){shortcuts[Number(event.target.dataset.index)][field]=event.target.value;error('shortcut-error');}});
  shortcutDialog.addEventListener('change',event=>{const field=event.target.dataset.shortcutField;if(field){shortcuts[Number(event.target.dataset.index)][field]=event.target.value;error('shortcut-error');}});
  shortcutDialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-shortcut-action]');if(!button)return;
    const index=Number(button.dataset.index);
    if(button.dataset.shortcutAction==='add'){shortcuts.push({binding:'Mod-Shift-k',command:''});renderShortcuts();document.querySelector('#shortcut-command-'+(shortcuts.length-1)).focus();}
    if(button.dataset.shortcutAction==='remove'){shortcuts.splice(index,1);renderShortcuts();}
    error('shortcut-error');
  });
  shortcutDialog.addEventListener('change',event=>{
    if(!event.target.matches('[data-modifier],[data-primary-key]'))return;
    const index=Number(event.target.dataset.index),row=event.target.closest('.shortcut-row');
    shortcuts[index].binding=[...Array.from(row.querySelectorAll('[data-modifier]:checked'),node=>node.dataset.modifier),row.querySelector('[data-primary-key]').value].join('-');
    error('shortcut-error');
  });
  document.querySelector('#shortcut-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{const value=validateShortcutRows(shortcuts,ctx.getCommands(),{platform:navigator.platform,originalBindings});ctx.saveBindings(value);shortcutDialog.close();ctx.notify('快捷键已保存');}
    catch(reason){error('shortcut-error',reason.message);}
  });

  function renderSnippets(){
    document.querySelector('#snippet-rows').innerHTML=snippets.map((item,index)=>`<article class="settings-row snippet-row"><div class="settings-toolbar"><strong>代码片段 ${index+1}</strong><button type="button" data-snippet-action="remove" data-index="${index}" aria-label="删除第 ${index+1} 个代码片段">删除</button></div><label class="settings-field" for="snippet-name-${index}"><span>名称</span><input id="snippet-name-${index}" data-snippet-field="name" data-index="${index}" value="${escapeHTML(item.name)}" autocomplete="off"></label><label class="settings-field" for="snippet-prefix-${index}"><span>触发前缀（可选）</span><input id="snippet-prefix-${index}" data-snippet-field="prefix" data-index="${index}" value="${escapeHTML(item.prefix)}" autocomplete="off" spellcheck="false" placeholder="例如 fn"></label><label class="settings-field" for="snippet-body-${index}"><span>代码（可多行）</span><textarea id="snippet-body-${index}" class="settings-code" data-snippet-field="body" data-index="${index}" rows="6" spellcheck="false">${escapeHTML(item.body)}</textarea></label></article>`).join('')||'<p class="settings-empty">还没有代码片段。添加后可从命令面板或前缀插入。</p>';
  }
  function openSnippets(){snippets=migrateSnippets(ctx.getSnippets());error('snippet-error');renderSnippets();snippetDialog.showModal();}
  snippetDialog.addEventListener('input',event=>{const field=event.target.dataset.snippetField;if(field){snippets[Number(event.target.dataset.index)][field]=event.target.value;error('snippet-error');}});
  snippetDialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-snippet-action]');if(!button)return;
    if(button.dataset.snippetAction==='add'){snippets.push({name:'',prefix:'',body:''});renderSnippets();document.querySelector('#snippet-name-'+(snippets.length-1)).focus();}
    if(button.dataset.snippetAction==='remove'){snippets.splice(Number(button.dataset.index),1);renderSnippets();}
    error('snippet-error');
  });
  document.querySelector('#snippet-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{ctx.saveSnippets(validateSnippets(snippets));snippetDialog.close();ctx.notify('代码片段已保存');}
    catch(reason){error('snippet-error',reason.message);}
  });
  return{openShortcuts,openSnippets};
}
