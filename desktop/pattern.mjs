import {Worker} from 'node:worker_threads';
export class PatternWorker {
 constructor(timeout=1000){this.timeout=timeout;this.worker=new Worker(new URL('./pattern-worker.mjs',import.meta.url),{resourceLimits:{maxOldGenerationSizeMb:128}});this.next=0;this.pending=new Map();this.worker.on('message',m=>{const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error('REGEX: '+m.error)):p.resolve(m);});this.worker.on('error',e=>this.fail(e));this.worker.on('exit',code=>{if(code)this.fail(new Error('REGEX: Worker terminated or memory limit reached.'));});}
 fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
 run(args){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.fail(new Error('REGEX_TIMEOUT: Pattern exceeded the per-file time limit; no writes performed by matching.'));void this.worker.terminate();},this.timeout);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({...args,id});});}
 async close(){this.fail(new Error('REGEX: Worker closed.'));await this.worker.terminate();}
}
