import {emptyInventory,validateInventory} from './inventory-domain.ts';
import type {InventoryState} from './inventory-domain.ts';
/** Dedicated IndexedDB store; atomic revision check prevents cross-tab lost updates. */
export class InventoryRepository{
 private db:IDBDatabase|null=null;private memory:InventoryState=emptyInventory();private revision=0;
 private listeners=new Set<(state:InventoryState)=>void>();
 subscribe(fn:(state:InventoryState)=>void){this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};}
 persistent=false;blocked=false;recovery:unknown=null;
 private opening:Promise<InventoryState>|null=null;
 async open():Promise<InventoryState>{if(this.opening)return this.opening;this.opening=this.load();try{return await this.opening;}finally{this.opening=null;}}
 private async load():Promise<InventoryState>{if(this.blocked)throw new Error('Almacenamiento CDE bloqueado.');if(this.db)return this.memory;if(typeof indexedDB==='undefined')return this.memory;
 try{this.db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('registro-cde-local-v1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('inventory'))r.result.createObjectStore('inventory');};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Cierra otras pestanas del registro para abrir el almacenamiento CDE.'));r.onsuccess=()=>resolve(r.result);});this.db.onversionchange=()=>{this.db?.close();this.db=null;this.persistent=false;this.blocked=true;};this.persistent=true;
 const loaded=await new Promise<{raw:unknown;revision:number}>((resolve,reject)=>{const tx=this.db!.transaction('inventory','readonly'),store=tx.objectStore('inventory'),r=store.get('state'),v=store.get('revision');tx.oncomplete=()=>resolve({raw:r.result,revision:v.result??0});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Lectura cancelada.'));});this.revision=loaded.revision;if(!Number.isSafeInteger(this.revision)||this.revision<0)throw new Error('Revision de almacenamiento incompatible.');if(loaded.raw===undefined)return this.memory;this.recovery=loaded.raw;this.memory=validateInventory(loaded.raw);return this.memory;
 }catch(e){this.blocked=true;throw e;}}
 async save(state:InventoryState):Promise<void>{if(this.blocked)throw new Error('Almacenamiento CDE bloqueado. No se han sobrescrito los datos.');validateInventory(state);if(this.db){const expected=this.revision;await new Promise<void>((resolve,reject)=>{const tx=this.db!.transaction('inventory','readwrite'),store=tx.objectStore('inventory'),r=store.get('revision');let reason='';r.onsuccess=()=>{if((r.result??0)!==expected){reason='Otra pestana actualizo el inventario. Recarga antes de guardar; tus datos no se han sobrescrito.';tx.abort();return;}try{store.put(state,'state');store.put(expected+1,'revision');}catch{reason='No se pudo guardar. Puede faltar espacio; exporta el respaldo.';tx.abort();}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error(reason||'No se pudo guardar el inventario local. Puede faltar espacio; se conserva el anterior.'));tx.onabort=()=>reject(new Error(reason||'Guardado cancelado. Se conserva el inventario anterior.'));});this.revision=expected+1;}this.memory=state;for(const fn of this.listeners)fn(state);}
 close(){this.db?.close();this.db=null;this.persistent=false;}
}
