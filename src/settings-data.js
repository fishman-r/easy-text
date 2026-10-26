/** Data migration and validation for form-based settings. Storage remains backwards compatible. */
const modifierAliases={mod:'Mod',ctrl:'Ctrl',control:'Ctrl',alt:'Alt',option:'Alt',shift:'Shift',meta:'Meta',cmd:'Meta',command:'Meta',super:'Meta'};
const keyAliases={space:'Space',spacebar:'Space',enter:'Enter',return:'Enter',esc:'Escape',escape:'Escape',tab:'Tab',backspace:'Backspace',delete:'Delete',del:'Delete',up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',arrowup:'ArrowUp',arrowdown:'ArrowDown',arrowleft:'ArrowLeft',arrowright:'ArrowRight',home:'Home',end:'End',pageup:'PageUp',pagedown:'PageDown',minus:'Minus','-':'Minus',equal:'Equal','=':'Equal',slash:'Slash','/':'Slash',backslash:'Backslash','\\':'Backslash',bracketleft:'BracketLeft','[':'BracketLeft',bracketright:'BracketRight',']':'BracketRight',semicolon:'Semicolon',';':'Semicolon',quote:'Quote',"'":'Quote',backquote:'Backquote','`':'Backquote',comma:'Comma',',':'Comma',period:'Period','.':'Period'};
const shiftedSymbols={'+':'Equal','_':'Minus','?':'Slash','|':'Backslash','{':'BracketLeft','}':'BracketRight',':':'Semicolon','"':'Quote','~':'Backquote','<':'Comma','>':'Period','!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0'};
const modifierOrder=['Mod','Ctrl','Alt','Shift','Meta'];
export const RESERVED_SHORTCUTS={
  'Mod-q':'native.quit','Mod-Comma':'settings.open','Mod-c':'native.copy','Mod-x':'native.cut','Mod-v':'native.paste','Mod-a':'native.selectAll','Mod-h':'native.hide','Mod-Alt-h':'native.hideOthers','Mod-m':'native.minimize','Ctrl-Meta-f':'native.fullscreen','Mod-n':'file.new','Mod-o':'file.open','Mod-s':'file.save','Mod-Shift-s':'file.saveAs','Mod-w':'file.close',
  'Mod-p':'file.quick','Mod-Shift-p':'commands.show','Mod-f':'edit.find','Mod-Shift-f':'project.replace',
  'Mod-z':'edit.undo','Mod-Shift-z':'edit.redo','Mod-/':'edit.comment','Mod-d':'edit.next',
  'Mod-l':'line.select','Mod-b':'build.panel','Ctrl-g':'goto.line',
};
export function canonicalShortcut(value){
  let source=String(value||'').trim();
  if(!source)throw new Error('请选择组合键');
  source=source.replace(/--$/,'-Minus');
  const parts=source.split('-');
  const rawKey=parts.pop();
  const modifiers=new Set();
  for(const part of parts){const modifier=modifierAliases[part.trim().toLowerCase()];if(!modifier)throw new Error('无法识别修饰键：'+part);if(modifiers.has(modifier))throw new Error('修饰键重复：'+modifier);modifiers.add(modifier);}
  let key;
  if(Object.hasOwn(shiftedSymbols,rawKey)){key=shiftedSymbols[rawKey];modifiers.add('Shift');}
  else key=keyAliases[rawKey.toLowerCase()]||(/^f(?:[1-9]|1\d|2[0-4])$/i.test(rawKey)?rawKey.toUpperCase():/^[\p{L}\p{N}]$/u.test(rawKey)?rawKey.toLowerCase():null);
  if(!key)throw new Error('无法识别按键：'+rawKey);
  if(!modifiers.size&&!/^F\d+$/.test(key))throw new Error('请使用修饰键组合，或功能键 F1–F24');
  return [...modifierOrder.filter(modifier=>modifiers.has(modifier)),key].join('-');
}
export function shortcutSignature(value,platform='Mac'){
  const parts=canonicalShortcut(value).split('-');const key=parts.pop();
  const physical=parts.map(modifier=>modifier==='Mod'?(/Mac|iPhone|iPad/.test(platform)?'Meta':'Ctrl'):modifier);
  if(new Set(physical).size!==physical.length)throw new Error('此平台上有重复的修饰键');
  return [...physical.sort(),key].join('-');
}
export function recordedShortcut(event,platform='Mac'){
  if(event.isComposing||['Shift','Control','Alt','Meta','Dead','Unidentified'].includes(event.key))return null;
  const mac=/Mac|iPhone|iPad/.test(platform);const modifiers=[];
  if(mac?event.metaKey:event.ctrlKey)modifiers.push('Mod');
  if(mac&&event.ctrlKey)modifiers.push('Ctrl');
  if(!mac&&event.metaKey)modifiers.push('Meta');
  if(event.altKey)modifiers.push('Alt');if(event.shiftKey)modifiers.push('Shift');
  let key=event.code?.startsWith('Key')?event.code.slice(3).toLowerCase():event.code?.startsWith('Digit')?event.code.slice(5):event.code&&Object.values(keyAliases).includes(event.code)?event.code:event.key===' '?'Space':event.key;
  try{return canonicalShortcut([...modifiers,key].join('-'));}catch{return null;}
}
export function shortcutMatches(event,binding,platform='Mac'){
  const recorded=recordedShortcut(event,platform);if(!recorded)return false;
  try{return shortcutSignature(recorded,platform)===shortcutSignature(binding,platform);}catch{return false;}
}
export function shortcutRows(bindings){
  if(!bindings||Array.isArray(bindings)||typeof bindings!=='object')return[];
  return Object.entries(bindings).map(([binding,command])=>({binding,command:typeof command==='string'?command:''}));
}
export function validateShortcutRows(rows,commands,{platform='Mac',originalBindings={}}={}){
  const known=new Set(commands.map(command=>command[0]));
  const oldIds=new Set(Object.values(originalBindings));
  const signatures=new Map();const result={};
  const reserved=new Map(Object.entries(RESERVED_SHORTCUTS).map(([key,id])=>[shortcutSignature(key,platform),id]));
  rows.forEach((row,index)=>{
    try{
      const binding=canonicalShortcut(row.binding);const signature=shortcutSignature(binding,platform);
      if(!row.command)throw new Error('请选择命令');
      if(!known.has(row.command)&&!oldIds.has(row.command))throw new Error('命令不可用');
      if(signatures.has(signature))throw new Error('与第 '+(signatures.get(signature)+1)+' 条快捷键冲突');
      const occupied=reserved.get(signature);if(occupied&&occupied!==row.command)throw new Error('该组合已由内置命令占用：'+(commands.find(command=>command[0]===occupied)?.[1]||occupied));
      signatures.set(signature,index);result[binding]=row.command;
    }catch(error){throw new Error('第 '+(index+1)+' 条：'+error.message);}
  });
  return result;
}
export function migrateSnippets(value){
  if(!Array.isArray(value))return[];
  return value.map(item=>({...item,name:typeof item?.name==='string'?item.name:'',prefix:typeof item?.prefix==='string'?item.prefix:'',body:typeof item?.body==='string'?item.body:''}));
}
export function validateSnippets(rows){
  const prefixes=new Set();
  return rows.map((row,index)=>{
    const name=row.name.trim(),prefix=row.prefix.trim();
    if(!name)throw new Error('第 '+(index+1)+' 个片段需要名称');
    if(typeof row.body!=='string'||!row.body.length)throw new Error('第 '+(index+1)+' 个片段需要代码内容');
    if(prefix.length>80||/\s/.test(prefix))throw new Error('第 '+(index+1)+' 个片段的前缀不能包含空白，且不能超过 80 个字符');
    if(prefix&&prefixes.has(prefix))throw new Error('片段前缀重复：'+prefix);
    if(prefix)prefixes.add(prefix);
    return{...row,name,prefix,body:row.body};
  });
}
export function matchingSnippetPrefix(snippets,text,position){
  const candidates=snippets.filter(item=>item.prefix&&position>=item.prefix.length&&text.slice(position-item.prefix.length,position)===item.prefix).sort((a,b)=>b.prefix.length-a.prefix.length);
  return candidates.find(item=>{const before=position-item.prefix.length;return before===0||/[\s([{;,:]/.test(text[before-1]);})||null;
}
export function normalizeBuildSettings(value){
  return{...(value&&typeof value==='object'&&!Array.isArray(value)?value:{}),command:typeof value?.command==='string'?value.command:'node',args:Array.isArray(value?.args)?value.args.filter(argument=>typeof argument==='string'):['--version']};
}
export function validateBuildSettings(command,args,previous={}){
  const executable=String(command).trim();
  if(!executable||executable.includes('\0'))throw new Error('请输入有效的可执行程序');
  if(!Array.isArray(args)||args.length>256||args.some(argument=>typeof argument!=='string'||argument.includes('\0')))throw new Error('参数必须是有效的文本，最多 256 项');
  return{...previous,command:executable,args:[...args]};
}
export function persistSettingsWithBackup(storage,key,value){
  const previous=storage.getItem(key);const backup=key+'.before-forms-v1';
  if(previous!==null&&storage.getItem(backup)===null)storage.setItem(backup,previous);
  storage.setItem(key,JSON.stringify(value));
}
