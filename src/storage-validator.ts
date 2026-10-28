import type {CoreState} from './domain';
export function validateState(value:unknown):CoreState{
 const fail=()=>{throw new Error('El registro local tiene datos o referencias incompatibles.');};
 if(!value||typeof value!=='object')return fail();const s=value as Record<string,unknown>;
 const names=['deliverables','versions','deliveries','observations','models','history'] as const;
 const list=(key:string)=>s[key] as Record<string,unknown>[];
 for(const name of names){if(!Array.isArray(s[name])||(s[name] as unknown[]).length>10000)return fail();const ids=new Set();for(const item of list(name)){if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||ids.has(item.id))return fail();ids.add(item.id);}}
 const text=(row:Record<string,unknown>,fields:string[])=>{for(const f of fields)if(typeof row[f]!=='string'||(row[f] as string).length>10000)fail();};
 const refs=(name:string)=>new Set(list(name).map(x=>x.id));const ds=refs('deliverables'),vs=refs('versions');
 for(const r of list('deliverables'))text(r,['code','name','discipline','specialist']);
 for(const r of list('versions')){text(r,['deliverableId','revision','date','fileName','location','declaredChanges','checkedChanges','status','submittedBy']);if(!ds.has(r.deliverableId)||!['received','approved'].includes(r.status as string))fail();}
 for(const r of list('deliveries')){text(r,['date','by']);if(!Array.isArray(r.versionIds)||!r.versionIds.every(id=>vs.has(id)))fail();}
 for(const r of list('observations')){text(r,['code','versionId','title','priority','assignee','dueDate','status']);if(!vs.has(r.versionId)||!['open','responded','closed'].includes(r.status as string)||!['low','medium','high'].includes(r.priority as string))fail();for(const f of ['response','evidence','resolvedVersionId','reviewedBy'])if(r[f]!==undefined&&typeof r[f]!=='string')fail();if(r.resolvedVersionId&&!vs.has(r.resolvedVersionId))fail();}
 for(const r of list('models')){text(r,['name','date']);if(!Array.isArray(r.inputVersionIds)||!r.inputVersionIds.every(id=>vs.has(id)))fail();}
 for(const r of list('history'))text(r,['at','actor','action','target']);
 return value as CoreState;
}
