import {app,BrowserWindow,ipcMain,dialog,Menu,session} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {WorkspaceService} from './service.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
let window,service,closeAllowed=false,closeRequested=false,quitRequested=false,shutdownDone=false,shuttingDown=false;const page=pathToFileURL(path.join(here,'../dist/index.html')).href;
app.setName('easy text');
if(process.env.ET_SMOKE_DATA||process.env.EASY_TEXT_USER_DATA)app.setPath('userData',process.env.ET_SMOKE_DATA||process.env.EASY_TEXT_USER_DATA);
const confirm=async(message,detail)=>{const r=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Continue'],defaultId:0,cancelId:0,message,detail});return r.response===1;};
app.whenReady().then(async()=>{
service=new WorkspaceService({dataDir:app.getPath('userData'),confirm,emit:event=>{if(window&&!window.isDestroyed())window.webContents.send('et:event',event);}});await service.init();
function trusted(event){if(event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==page)throw new Error('DENIED: untrusted IPC sender.');}
const handlers={
 openFiles:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile','multiSelections'],title:'Open UTF-8 text files'});const files=[],errors=[];if(!r.canceled)for(const p of r.filePaths){try{files.push(await service.grantFile(p));}catch(e){errors.push({path:p,message:e.message});}}return{files,errors};},
 openFolder:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openDirectory'],title:'Open project folder'});return r.canceled?null:service.grantFolder(r.filePaths[0]);},
 saveAs:async(args)=>{const r=await dialog.showSaveDialog(window,{title:'Save file as',defaultPath:path.basename(args?.suggestedName||args?.name||'untitled.txt'),properties:['showOverwriteConfirmation']});return r.canceled?null:service.saveAsPath(r.filePath,args);},
};handlers.openProject=handlers.openFolder;
handlers.closeReady=async()=>{closeAllowed=true;closeRequested=false;if(quitRequested)app.quit();else window?.close();return{};};
for(const name of ['readFile','saveFile','createFile','renameFile','listTree','search','previewReplace','applyReplace','undoReplace','symbols','gitStatus','gitDiff','gitLog','gitStage','gitCommit','startBuild','cancelBuild','saveSession','loadSession'])handlers[name]=args=>service[name](args||{});
for(const [name,fn]of Object.entries(handlers))ipcMain.handle('et:'+name,async(event,args)=>{trusted(event);return fn(args);});
session.defaultSession.setPermissionRequestHandler((_,__,cb)=>cb(false));
session.defaultSession.setPermissionCheckHandler(()=>false);
session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{let ok=false;try{const url=new URL(details.url);ok=url.protocol==='file:'&&fileURLToPath(url).startsWith(path.resolve(here,'../dist')+path.sep)||url.protocol==='data:'||url.protocol==='blob:';}catch{}callback({cancel:!ok});});
session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"]}}));
function createWindow(){window=new BrowserWindow({width:1400,height:920,minWidth:820,minHeight:560,title:'easy text',backgroundColor:'#15181e',show:false,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false}});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});window.once('ready-to-show',()=>{if(!process.env.ET_SMOKE_DATA)window.show();});window.loadURL(page);window.on('close',event=>{if(!closeAllowed&&!process.env.ET_SMOKE_DATA){event.preventDefault();requestClose();}});window.on('closed',()=>{window=null;closeAllowed=false;});return window;}
Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'easy text',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'View',submenu:[{role:'reload'},{role:'togglefullscreen'}]},{role:'windowMenu'}]));
async function requestClose(){if(closeRequested||!window)return;closeRequested=true;window.webContents.send('et:event',{type:'app-close-request'});setTimeout(async()=>{if(!closeRequested||!window)return;const r=await dialog.showMessageBox(window,{type:'warning',buttons:['Keep editing','Quit without session save'],defaultId:0,cancelId:0,message:'The editor has not confirmed that its session is saved.',detail:'Keep editing to save your files or retry. Quit only if you have another copy of your changes.'});if(r.response===1){closeAllowed=true;closeRequested=false;if(quitRequested)app.quit();else window.close();}else{closeRequested=false;quitRequested=false;}},5000);}
createWindow();app.on('activate',()=>{if(!window)createWindow();});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});app.on('before-quit',event=>{if(shutdownDone)return;event.preventDefault();quitRequested=true;if(window&&!closeAllowed&&!process.env.ET_SMOKE_DATA){requestClose();return;}if(shuttingDown)return;shuttingDown=true;service.dispose().finally(()=>{shutdownDone=true;app.quit();});});
if(process.env.ET_SMOKE_DATA){window.webContents.on('did-finish-load',async()=>{try{const result=await window.webContents.executeJavaScript(`({title:document.title,bridge:typeof window.easyText?.openFiles,body:document.body.innerText.slice(0,200),node:typeof window.require})`);await fs.writeFile(path.join(process.env.ET_SMOKE_DATA,'smoke-result.json'),JSON.stringify({...result,arch:process.arch,electron:process.versions.electron}));}catch(error){await fs.writeFile(path.join(process.env.ET_SMOKE_DATA,'smoke-error.txt'),error.stack);}app.quit();});setTimeout(()=>app.exit(2),20000).unref();}

}).catch(error=>{console.error(error);app.exit(1);});
