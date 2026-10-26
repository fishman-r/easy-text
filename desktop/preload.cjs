const {contextBridge,ipcRenderer}=require('electron');
const names=['openFiles','openFolder','openProject','readFile','saveFile','saveAs','createFile','renameFile','listTree','search','previewReplace','applyReplace','undoReplace','symbols','gitStatus','gitDiff','gitLog','gitStage','gitCommit','startBuild','cancelBuild','saveSession','loadSession','closeReady','closePending','cancelClose','pluginList','pluginInstall','pluginEnable','pluginRemove','pluginStart','pluginStop','pluginRun','pluginEvent','pluginSetClipboard','getLocaleInfo','setLocale','respondDialog'];
const api={platform:process.platform,isDesktop:true};
for(const name of names)api[name]=args=>ipcRenderer.invoke('et:'+name,args);
api.onEvent=callback=>{if(typeof callback!=='function')throw new TypeError('Expected callback');const listener=(_,event)=>callback(event);ipcRenderer.on('et:event',listener);return()=>ipcRenderer.removeListener('et:event',listener);};
contextBridge.exposeInMainWorld('easyText',Object.freeze(api));
