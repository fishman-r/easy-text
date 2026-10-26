export function nativeMenuTemplate(t,emit){
const m=label=>t('nativeMenu',label);
const role=name=>({role:name,label:m(name)});
const item=(label,command,accelerator)=>({label:m(label),...(accelerator?{accelerator}:{}),click:()=>emit({type:'menu-command',command})});
return [
 {label:'easy text',submenu:[item('about','app.about'),{type:'separator'},item('Preferences…','settings.open','CmdOrCtrl+,'),{type:'separator'},role('hide'),role('hideOthers'),role('unhide'),{type:'separator'},role('quit')]},
 {label:m('File'),submenu:[item('New File','file.new','CmdOrCtrl+N'),item('Open File…','file.open','CmdOrCtrl+O'),item('Open Folder…','folder.open'),{type:'separator'},item('Save','file.save','CmdOrCtrl+S'),item('Save As…','file.saveAs','CmdOrCtrl+Shift+S'),item('Rename…','file.rename'),item('Revert from Disk…','file.reload'),{type:'separator'},item('Close Tab','file.close','CmdOrCtrl+W')]},
 {label:m('Edit'),submenu:[item('Undo','edit.undo','CmdOrCtrl+Z'),item('Redo','edit.redo','CmdOrCtrl+Shift+Z'),{type:'separator'},role('cut'),role('copy'),role('paste'),role('selectAll'),{type:'separator'},item('Toggle Comment','edit.comment','CmdOrCtrl+/'),item('Transpose','text.transpose'),item('Indent','indent.more'),item('Unindent','indent.less')]},
 {label:m('Selection'),submenu:[item('Select Next Occurrence','edit.next','CmdOrCtrl+D'),item('Select Line','line.select','CmdOrCtrl+L'),item('Split Selection into Lines','selection.split'),item('Add Cursor Above','selection.above'),item('Add Cursor Below','selection.below')]},
 {label:m('Find'),submenu:[item('Find / Replace…','edit.find','CmdOrCtrl+F'),item('Find in Project…','project.replace','CmdOrCtrl+Shift+F')]},
 {label:m('View'),submenu:[item('Side Bar','view.sidebar'),item('Minimap','view.minimap'),item('Split Layout','view.split'),item('Word Wrap','view.wrap'),item('Theme','view.theme'),{type:'separator'},item('Fold All','fold.all'),item('Unfold All','unfold.all'),role('togglefullscreen')]},
 {label:m('Goto'),submenu:[item('Goto Anything…','file.quick','CmdOrCtrl+P'),item('Goto Line…','goto.line','Ctrl+G'),item('Goto Definition','navigation.definition'),item('Go Back','navigation.back'),{type:'separator'},item('Toggle Bookmark','bookmark.toggle'),item('Next Bookmark','bookmark.next')]},
 {label:m('Tools'),submenu:[item('Command Palette…','commands.show','CmdOrCtrl+Shift+P'),item('Build System…','build.panel','CmdOrCtrl+B'),item('Git…','git.panel'),item('Snippets…','snippet.insert'),item('Record Macro','macro.record'),item('Play Macro','macro.play'),{type:'separator'},item('Python Plugins…','plugins.manage')]},
 {label:m('Project'),submenu:[item('Open Folder…','folder.open'),item('Export Workspace…','project.export'),item('Import Workspace…','project.import')]},
 {label:m('Preferences'),submenu:[item('Language…','language.configure'),item('Settings / Theme','settings.open'),item('Key Bindings…','keybindings.edit'),item('Indentation…','indent.configure'),item('File Encoding…','file.encoding'),item('Line Endings…','file.lineEnding'),item('Python Plugins…','plugins.manage')]},
 {role:'windowMenu',label:m('windowMenu'),submenu:[role('minimize'),role('zoom'),{type:'separator'},role('front')]},{label:m('Help'),submenu:[item('Editor Help','help')]}];
}

