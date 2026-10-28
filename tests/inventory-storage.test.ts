import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory, IDBObjectStore} from 'fake-indexeddb';
import {InventoryRepository} from '../src/inventory-repository.ts';
import {addSnapshot,defaultMapping,emptyInventory} from '../src/inventory-domain.ts';

// Generated test data only. No user filenames, identifiers, people or project records.
function inventory(count=12_000,label='Synthetic inventory') {
 const headers=['File VID','Latest version VID','File name','File location','Size','Tags'];
 const rows=Array.from({length:count},(_,i)=>[`synthetic-file-${i}`,`synthetic-version-${i}`,`document-${i}-${'synthetic-'.repeat(12)}.ifc`,`1_WIP/Discipline-${i%4}/${'example-folder/'.repeat(6)}`,String(i+1),i%10===0?'Example':'']);
 return addSnapshot(emptyInventory(),{scope:'Synthetic project',label,exportDate:'2026-10-28',fileName:'synthetic.csv',sheet:'Files',headers,rows,mapping:defaultMapping(headers)});
}
function factory(){const indexedDB=new IDBFactory();Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,writable:true,configurable:true});return indexedDB;}
async function database(){return await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('registro-cde-local-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function rawState(){const db=await database();try{return await new Promise<unknown>((resolve,reject)=>{const r=db.transaction('inventory','readonly').objectStore('inventory').get('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}

test('IndexedDB round-trips 12000 synthetic rows without uploads or changing identifiers',async()=>{
 factory();let networkCalls=0;const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{networkCalls++;throw new Error('Unexpected network request');};
 try{const first=new InventoryRepository();assert.deepEqual(await first.open(),emptyInventory());assert.equal(first.persistent,true);const expected=inventory();assert.ok(JSON.stringify(expected).length>3_000_000);await first.save(expected);const second=new InventoryRepository();const loaded=await second.open();assert.deepEqual(loaded,expected);assert.equal(loaded.snapshots[0].rows.length,12000);assert.equal(loaded.snapshots[0].rows.at(-1)![0],'synthetic-file-11999');assert.equal(networkCalls,0);}finally{globalThis.fetch=originalFetch;}
});

test('stale tab cannot overwrite a newer inventory transaction',async()=>{
 factory();const first=new InventoryRepository(),second=new InventoryRepository();await first.open();await second.open();const expected=inventory(4,'First tab');await first.save(expected);await assert.rejects(second.save(inventory(5,'Stale tab')));const reader=new InventoryRepository();assert.deepEqual(await reader.open(),expected);
});

test('aborted IndexedDB transaction preserves prior stored and in-memory state',async()=>{
 factory();const repo=new InventoryRepository();await repo.open();const before=inventory(4,'Before');await repo.save(before);
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){const r=put.call(this,value,key);if(key==='state')this.transaction.abort();return r;};
 try{await assert.rejects(repo.save(inventory(5,'Aborted')));}finally{IDBObjectStore.prototype.put=put;}
 assert.deepEqual(await repo.open(),before);const reader=new InventoryRepository();assert.deepEqual(await reader.open(),before);
});

test('quota failure leaves old inventory available and does not silently fall back to memory',async()=>{
 factory();const repo=new InventoryRepository();await repo.open();const before=inventory(4,'Before');await repo.save(before);
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){if(key==='state')throw new DOMException('Synthetic quota limit','QuotaExceededError');return put.call(this,value,key);};
 try{await assert.rejects(repo.save(inventory(5,'No quota')));}finally{IDBObjectStore.prototype.put=put;}
 assert.deepEqual(await repo.open(),before);const reader=new InventoryRepository();assert.deepEqual(await reader.open(),before);
});

test('invalid persisted inventory is exposed for recovery without overwrite',async()=>{
 factory();const initial=new InventoryRepository();await initial.open();const bad={schema:1,snapshots:[{invalid:true}],links:[]};
 const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('inventory','readwrite');tx.objectStore('inventory').put(bad,'state');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 const broken=new InventoryRepository();await assert.rejects(broken.open());assert.equal(broken.blocked,true);assert.deepEqual(broken.recovery,bad);await assert.rejects(broken.save(inventory(2)));assert.deepEqual(await rawState(),bad);
});

test('without IndexedDB the local session remains usable and is explicitly nonpersistent',async()=>{
 Object.defineProperty(globalThis,'indexedDB',{value:undefined,writable:true,configurable:true});const repo=new InventoryRepository();await repo.open();assert.equal(repo.persistent,false);const expected=inventory(3);await repo.save(expected);assert.deepEqual(await repo.open(),expected);
});

test('database version change closes existing connection and blocks stale writes',async()=>{
 factory();const repo=new InventoryRepository();await repo.open();await repo.save(inventory(3));
 await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('registro-cde-local-v1',2);request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Existing connection failed to close'));});
 assert.equal(repo.blocked,true);assert.equal(repo.persistent,false);await assert.rejects(repo.save(inventory(4)));
});
