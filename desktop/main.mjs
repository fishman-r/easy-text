import {app,BrowserWindow,ipcMain,dialog,Menu,session,clipboard,shell} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {WorkspaceService} from './service.mjs';
import {PluginManager} from './plugin-manager.mjs';
import {LocaleStore} from './locale.mjs';
import {nativeMenuTemplate} from './native-menu.mjs';
import {DialogBroker} from './dialog-broker.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
let window,service,plugins,locale,closeAllowed=false,closeRequested=false,quitRequested=false,shutdownDone=false,shuttingDown=false,closeGeneration=0;const page=pathToFileURL(path.join(here,'../dist/index.html')).href;
app.setName('easy text');
app.commandLine.appendSwitch('lang','zh-CN');
if(process.env.ET_SMOKE_DATA||process.env.EASY_TEXT_USER_DATA)app.setPath('userData',process.env.ET_SMOKE_DATA||process.env.EASY_TEXT_USER_DATA);
const dialogs=new DialogBroker({getWindow:()=>window});
const confirm=(message,detail)=>dialogs.request({message,detail,cancelLabel:locale.t('nativeDialogs','Cancel'),confirmLabel:locale.t('nativeDialogs','Continue')});
app.whenReady().then(async()=>{
locale=new LocaleStore({dataDir:app.getPath('userData'),systemLocale:app.getPreferredSystemLanguages()[0]||app.getSystemLocale()});await locale.init();
const tr=(key,values)=>locale.t('nativeDialogs',key,values);
service=new WorkspaceService({dataDir:app.getPath('userData'),confirm,t:tr,emit:event=>{if(window&&!window.isDestroyed())window.webContents.send('et:event',event);}});await service.init();
plugins=new PluginManager({dataDir:app.getPath('userData'),confirm,t:tr,emit:event=>{if(window&&!window.isDestroyed())window.webContents.send('et:event',event);}});await plugins.init();
function trusted(event){if(event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==page)throw new Error('DENIED: untrusted IPC sender.');}
const handlers={
 openFiles:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile','multiSelections'],title:tr('Open text files (UTF-8 / UTF-16)'),message:tr('Open text files (UTF-8 / UTF-16)'),buttonLabel:tr('Open')});const files=[],errors=[];if(!r.canceled)for(const p of r.filePaths){try{files.push(await service.grantFile(p));}catch(e){errors.push({path:p,message:locale.error(e)});}}return{files,errors};},
 openFolder:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openDirectory'],title:tr('Open project folder'),message:tr('Choose a project folder'),buttonLabel:tr('Open')});return r.canceled?null:service.grantFolder(r.filePaths[0]);},
 saveAs:async(args)=>{const r=await dialog.showSaveDialog(window,{title:tr('Save file as'),message:tr('Save file as'),buttonLabel:tr('Save'),nameFieldLabel:tr('File name:'),defaultPath:path.basename(args?.suggestedName||args?.name||'untitled.txt'),properties:['showOverwriteConfirmation']});return r.canceled?null:service.saveAsPath(r.filePath,args);},
};handlers.openProject=handlers.openFolder;
handlers.revealPath=async({path:p}={})=>{const authorized=await service.authorized(p);shell.showItemInFolder(authorized);return{path:authorized};};
handlers.getLocaleInfo=()=>locale.info();handlers.setLocale=async args=>{const info=await locale.set(args);rebuildMenu();window?.webContents.send('et:event',{type:'locale-changed',...info});return info;};
handlers.pluginList=()=>plugins.list();handlers.pluginStart=()=>plugins.start();handlers.pluginStop=()=>plugins.stop();handlers.pluginEnable=args=>plugins.enable(args);handlers.pluginRemove=args=>plugins.remove(args);handlers.pluginRun=args=>plugins.run(args);handlers.pluginEvent=args=>plugins.event(args);handlers.pluginSetClipboard=({text})=>{if(typeof text!=='string'||text.length>1048576)throw Error('Clipboard text exceeds 1 MiB.');clipboard.writeText(text);return{};};handlers.pluginInstall=async({kind='archive'}={})=>{if(!['packages','archive','python'].includes(kind))throw Error('Unknown plugin source type');const result=await dialog.showOpenDialog(window,{title:tr(kind==='packages'?'Choose a trusted Packages folder':'Install a trusted Python plugin'),message:tr('Choose only plugin code you trust'),buttonLabel:tr('Select'),properties:[kind==='packages'?'openDirectory':'openFile'],...(kind==='packages'?{}:{filters:[{name:tr(kind==='archive'?'Sublime Package':'Python Plugin'),extensions:[kind==='archive'?'sublime-package':'py']}]})});return result.canceled?plugins.list():plugins.install(result.filePaths[0],kind);};
handlers.closePending=async()=>{closeGeneration++;return{};};
handlers.cancelClose=async()=>{closeGeneration++;closeRequested=false;quitRequested=false;return{};};
handlers.closeReady=async()=>{closeGeneration++;dialogs.cancelFor(window);closeAllowed=true;closeRequested=false;if(quitRequested)app.quit();else window?.close();return{};};
for(const name of ['readFile','saveFile','createFile','renameFile','listTree','search','previewReplace','applyReplace','undoReplace','symbols','gitStatus','gitDiff','gitLog','gitStage','gitCommit','startBuild','cancelBuild','saveSession','loadSession'])handlers[name]=args=>service[name](args||{});
ipcMain.handle('et:respondDialog',(event,args)=>{trusted(event);return dialogs.respond(event,args);});
for(const [name,fn]of Object.entries(handlers))ipcMain.handle('et:'+name,async(event,args)=>{trusted(event);try{return await fn(args);}catch(error){throw new Error(locale.error(error,{plugin:name.startsWith('plugin')}));}});
session.defaultSession.setPermissionRequestHandler((_,__,cb)=>cb(false));
session.defaultSession.setPermissionCheckHandler(()=>false);
session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{let ok=false;try{const url=new URL(details.url);ok=url.protocol==='file:'&&fileURLToPath(url).startsWith(path.resolve(here,'../dist')+path.sep)||url.protocol==='data:'||url.protocol==='blob:';}catch{}callback({cancel:!ok});});
session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"]}}));
function createWindow(){window=new BrowserWindow({width:1400,height:920,minWidth:820,minHeight:560,title:'easy text',backgroundColor:'#15181e',show:false,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false}});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});window.once('ready-to-show',()=>{if(!process.env.ET_SMOKE_DATA)window.show();});window.loadURL(page);window.on('close',event=>{if(!closeAllowed&&!process.env.ET_SMOKE_DATA){event.preventDefault();requestClose();}});window.on('closed',()=>{closeGeneration++;window=null;closeAllowed=false;closeRequested=false;});return window;}
function rebuildMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate(nativeMenuTemplate((...args)=>locale.t(...args),event=>window?.webContents.send('et:event',event))));}
rebuildMenu();

async function requestClose(){if(closeRequested||!window)return;const owner=window;const generation=++closeGeneration;closeRequested=true;window.webContents.send('et:event',{type:'app-close-request'});setTimeout(async()=>{if(!closeRequested||window!==owner||generation!==closeGeneration)return;const approved=await dialogs.request({kind:'warning',cancelLabel:tr('Keep editing'),confirmLabel:tr('Quit without session save'),message:tr('The editor has not confirmed that its session is saved.'),detail:tr('Keep editing to save your files or retry. Quit only if you have another copy of your changes.')});if(window!==owner||!window||window.isDestroyed()||generation!==closeGeneration)return;if(approved){dialogs.cancelFor(window);closeAllowed=true;closeRequested=false;if(quitRequested)app.quit();else window.close();}else if(!closeAllowed){closeRequested=false;quitRequested=false;}},5000);}
createWindow();app.on('activate',()=>{if(!window)createWindow();});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});app.on('before-quit',event=>{if(shutdownDone)return;event.preventDefault();quitRequested=true;if(window&&!closeAllowed&&!process.env.ET_SMOKE_DATA){requestClose();return;}if(shuttingDown)return;shuttingDown=true;dialogs.cancelAll();Promise.allSettled([service.dispose(),plugins.stop()]).finally(()=>{shutdownDone=true;app.quit();});});
if(process.env.ET_SMOKE_DATA){window.webContents.on('did-finish-load',async()=>{try{const result=await window.webContents.executeJavaScript(`({title:document.title,bridge:typeof window.easyText?.openFiles,body:document.body.innerText.slice(0,200),node:typeof window.require})`);await fs.writeFile(path.join(process.env.ET_SMOKE_DATA,'smoke-result.json'),JSON.stringify({...result,arch:process.arch,electron:process.versions.electron,locale:locale.info(),engineLocale:app.getLocale(),nativeMenu:Menu.getApplicationMenu()?.items.map(item=>({label:item.label,submenu:item.submenu?.items.map(child=>({label:child.label,role:child.role}))}))}));}catch(error){await fs.writeFile(path.join(process.env.ET_SMOKE_DATA,'smoke-error.txt'),error.stack);}app.quit();});setTimeout(()=>app.exit(2),20000).unref();}

}).catch(error=>{console.error(error);app.exit(1);});
