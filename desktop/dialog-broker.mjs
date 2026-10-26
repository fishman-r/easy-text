import crypto from 'node:crypto';

/** App-owned confirmations fail closed and belong to one exact renderer frame. */
export class DialogBroker {
 constructor({getWindow,timeoutMs=120000}){this.getWindow=getWindow;this.timeoutMs=timeoutMs;this.pending=new Map();}
 request({title='easy text',message,detail='',cancelLabel,confirmLabel,kind='confirm'}){
  const owner=this.getWindow();
  if(!owner||owner.isDestroyed()||owner.webContents.isDestroyed())return Promise.resolve(false);
  const sender=owner.webContents,frame=sender.mainFrame;
  if(!frame)return Promise.resolve(false);
  const requestId=crypto.randomUUID();
  return new Promise(resolve=>{
   const listeners=[];
   const finish=(approved,reason)=>{
    const entry=this.pending.get(requestId);if(!entry)return;
    this.pending.delete(requestId);clearTimeout(entry.timer);
    for(const [emitter,event,listener]of listeners)emitter.removeListener(event,listener);
    if(reason!=='response'&&!sender.isDestroyed()){
     try{sender.send('et:event',{type:'app-dialog-dismiss',requestId,reason});}catch{}
    }
    resolve(approved===true);
   };
   const cancel=()=>finish(false,'renderer-unavailable');
   for(const [emitter,event]of [[owner,'closed'],[sender,'destroyed'],[sender,'render-process-gone'],[sender,'did-start-loading']]){
    emitter.once(event,cancel);listeners.push([emitter,event,cancel]);
   }
   const timer=setTimeout(()=>finish(false,'timeout'),this.timeoutMs);
   this.pending.set(requestId,{owner,sender,frame,finish,timer});
   try{sender.send('et:event',{type:'app-dialog',requestId,title,message:String(message??''),detail:String(detail??''),kind,buttons:[{id:'cancel',label:cancelLabel??'取消'},{id:'confirm',label:confirmLabel??'继续'}],defaultId:'cancel',cancelId:'cancel'});}catch{finish(false,'delivery-failed');}
  });
 }
 respond(event,{requestId,choice}={}){
  const entry=this.pending.get(requestId);
  if(!entry||event.sender!==entry.sender||event.senderFrame!==entry.frame||entry.owner.isDestroyed()||entry.sender.isDestroyed()||!['cancel','confirm'].includes(choice))return{accepted:false};
  entry.finish(choice==='confirm','response');return{accepted:true};
 }
 cancelFor(owner,reason='window-closing'){for(const entry of [...this.pending.values()])if(entry.owner===owner)entry.finish(false,reason);}
 cancelAll(reason='app-quitting'){for(const entry of [...this.pending.values()])entry.finish(false,reason);}
}
