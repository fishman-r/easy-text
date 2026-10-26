import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const SUPPORTED_LOCALES=Object.freeze(['zh-CN']);
export function resolveLocale(preference,systemLocale='zh-CN'){
 // This release ships one complete locale. Unknown system languages deliberately fall back.
 return 'zh-CN';
}
export function formatMessage(template,values={}){
 return String(template).replace(/\{([A-Za-z][\w]*)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]):match);
}
export function translate(catalog,section,key,values={}){
 return formatMessage(catalog?.[section]?.[key]??key,values);
}
export function localizeError(catalog,error,{plugin=false}={}){
 const raw=String(error?.message??error);
 const code=String(error?.code||raw.match(/^([A-Z][A-Z_]+):/)?.[1]||(plugin?'PLUGIN':'UNKNOWN'));
 const hint=catalog?.nativeErrors?.[code]||catalog?.nativeErrors?.UNKNOWN||'操作失败，请查看原始诊断。';
 const heading=code==='UNKNOWN'?hint:`${code}: ${hint}`;
 return `${heading}\n${translate(catalog,'nativeDialogs','Original diagnostic:')}\n${raw}`;
}
export class LocaleStore{
 constructor({dataDir,systemLocale='zh-CN',catalogURL=new URL('../src/locales/zh-CN.json',import.meta.url)}){
  this.dataDir=dataDir;this.systemLocale=systemLocale;this.catalogURL=catalogURL;this.preference='zh-CN';this.catalog=null;this.queue=Promise.resolve();
 }
 async init(){
  this.catalog=JSON.parse(await fs.readFile(this.catalogURL,'utf8'));
  try{const saved=JSON.parse(await fs.readFile(path.join(this.dataDir,'locale.json'),'utf8'));if(['zh-CN','system'].includes(saved.preference))this.preference=saved.preference;}catch{}
  return this.info();
 }
 info(){return{locale:resolveLocale(this.preference,this.systemLocale),preference:this.preference,systemLocale:this.systemLocale,supportedLocales:[...SUPPORTED_LOCALES],fallback:this.preference==='system'&&!/^zh(?:-|$)/i.test(this.systemLocale)};}
 t(section,key,values){return translate(this.catalog,section,key,values);}
 error(error,options){return localizeError(this.catalog,error,options);}
 set({locale}={}){
  if(!['zh-CN','system'].includes(locale))return Promise.reject(Object.assign(new Error('Only zh-CN or system is supported.'),{code:'LOCALE'}));
  const task=this.queue.catch(()=>{}).then(async()=>{
   await fs.mkdir(this.dataDir,{recursive:true,mode:0o700});
   const temp=path.join(this.dataDir,`locale-${crypto.randomUUID()}.tmp`);
   try{await fs.writeFile(temp,JSON.stringify({version:1,preference:locale}),{mode:0o600});await fs.rename(temp,path.join(this.dataDir,'locale.json'));this.preference=locale;return this.info();}finally{await fs.rm(temp,{force:true});}
  });this.queue=task;return task;
 }
}
