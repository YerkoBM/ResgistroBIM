import type {Register} from './document-register.ts';
import {date,text} from './document-register.ts';
import {validatePlanning} from './planning-domain.ts';
import type {PlanningRequest,ExpectedDeliverable} from './planning-domain.ts';
export const planImportFields=['requestKey','requestTitle','projectType','deliverableKey','title','scopeType','scopeName','relatedSector','specialty','type','contractor','targetIdentifier','plannedDate'] as const;
export type PlanImportField=typeof planImportFields[number];
export type PlanImportMapping=Partial<Record<PlanImportField,number>>;
export const planImportLabels:Record<PlanImportField,string>={requestKey:'Clave solicitud',requestTitle:'Solicitud',projectType:'Ambito',deliverableKey:'Clave entregable',title:'Entregable',scopeType:'Tipo alcance',scopeName:'Tramo / obra',relatedSector:'Sector relacionado',specialty:'Especialidad',type:'Tipo entregable',contractor:'Subcontrato',targetIdentifier:'Objetivo / identificador',plannedDate:'Fecha prevista'};
const required:PlanImportField[]=['requestKey','requestTitle','projectType','deliverableKey','title','scopeType','scopeName','specialty','type','contractor'];
const normalize=(s:string)=>s.trim().toLocaleLowerCase();
const cleanHeader=(s:string)=>normalize(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export function defaultPlanMapping(headers:string[]):PlanImportMapping {const out:PlanImportMapping={};for(const f of planImportFields){const i=headers.findIndex(h=>[cleanHeader(f),cleanHeader(planImportLabels[f])].includes(cleanHeader(h)));if(i>=0)out[f]=i;}return out;}
export interface PlanImportPreview {requests:PlanningRequest[];deliverables:ExpectedDeliverable[];errors:{row:number;message:string}[];duplicates:number;rows:number;addedSpecialties:string[]}
export function planCalendarDate(value:string){if(!value)return '';if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)){if(!Number.isFinite(Date.parse(value)))throw new Error('Fecha prevista no valida.');return date(value.slice(0,10));}return date(value);}
const identity=(d:ExpectedDeliverable)=>JSON.stringify([normalize(d.key),d.title,d.scopeType,d.scopeName,d.relatedSector,d.specialty,d.type,d.contractor,d.targetIdentifier||'',d.plannedDate]);
export function previewPlanImport(state:Register,rows:string[][],mapping:PlanImportMapping,firstDataRow=2):PlanImportPreview {
 const out:PlanImportPreview={requests:[],deliverables:[],errors:[],duplicates:0,rows:rows.length,addedSpecialties:[]};
 const fail=(row:number,error:unknown)=>out.errors.push({row,message:error instanceof Error?error.message:String(error)});
 if(!rows.length||rows.length>25000){fail(0,'Selecciona entre 1 y 25.000 filas.');return out;}
 for(const f of required)if(mapping[f]===undefined)fail(0,`Falta asignar ${planImportLabels[f]}.`);
 for(const [f,i] of Object.entries(mapping))if(!planImportFields.includes(f as PlanImportField)||i!==undefined&&(!Number.isInteger(i)||i<0||i>=100))fail(0,'Asignacion de columnas no valida.');
 if(out.errors.length)return out;
 const existingRequests=new Map((state.planningRequests||[]).map(r=>[normalize(r.key),r]));
 const requestById=new Map((state.planningRequests||[]).map(r=>[r.id,r]));
 const knownItems=new Map((state.expectedDeliverables||[]).map(d=>[normalize(requestById.get(d.requestId)?.key||'')+'\0'+normalize(d.key),d]));
 const newRequests=new Map<string,PlanningRequest>();const usedIds=new Set([...(state.planningRequests||[]),...(state.expectedDeliverables||[])].map(x=>x.id));let sequence=1;
 const id=(prefix:string)=>{while(usedIds.has(`${prefix}-import-${sequence}`))sequence++;const result=`${prefix}-import-${sequence++}`;usedIds.add(result);return result;};
 const specialties=new Map(state.specialties.map(s=>[normalize(s),s]));
 rows.forEach((row,index)=>{try{
  if(!Array.isArray(row)||row.length>100||row.some(c=>typeof c!=='string'||c.length>4000))throw new Error('Fila fuera de limites.');
  const value=(f:PlanImportField)=>mapping[f]===undefined?'':(row[mapping[f]!]||'').trim();
  const requestKey=text(value('requestKey'),'Clave solicitud',80),requestTitle=text(value('requestTitle'),'Solicitud',240),projectType=text(value('projectType'),'Ambito',80);
  const rk=normalize(requestKey),existing=existingRequests.get(rk);let request=existing||newRequests.get(rk);
  if(request&&(request.title!==requestTitle||request.projectType!==projectType))throw new Error('Conflicto de datos de solicitud; no se reemplazaran.');
  const rawSpecialty=text(value('specialty'),'Especialidad',100),specialty=specialties.get(normalize(rawSpecialty))||rawSpecialty;
  if(existing&&!existing.expectedSpecialties.includes(specialty))throw new Error('Especialidad no declarada en la solicitud existente. Agregala antes de importar.');
  const scope=value('scopeType').toLowerCase();if(!['lineal','puntual'].includes(scope))throw new Error('Tipo alcance debe ser Lineal o Puntual.');
  const item:ExpectedDeliverable={id:'',requestId:'',key:text(value('deliverableKey'),'Clave entregable',80),title:text(value('title'),'Entregable',240),scopeType:scope==='lineal'?'Lineal':'Puntual',scopeName:text(value('scopeName'),'Tramo / obra',120),relatedSector:value('relatedSector'),specialty,type:text(value('type'),'Tipo entregable',80),contractor:text(value('contractor'),'Subcontrato',120),targetIdentifier:value('targetIdentifier'),plannedDate:planCalendarDate(value('plannedDate')),baseDispatchIds:[],planVersion:1};
  if(item.relatedSector.length>120||(item.targetIdentifier||'').length>40)throw new Error('Sector o identificador demasiado largo.');
  const key=rk+'\0'+normalize(item.key),known=knownItems.get(key);
  if(known){if(identity(known)!==identity(item))throw new Error('Clave entregable existente con datos diferentes. No se reemplazara.');out.duplicates++;return;}
  if(!request){request={id:id('request'),key:requestKey,title:requestTitle,projectType,coverage:'Parcial',expectedSpecialties:[]};newRequests.set(rk,request);out.requests.push(request);}
  if(!request.expectedSpecialties.includes(specialty)&&!existing)request.expectedSpecialties.push(specialty);
  if(!specialties.has(normalize(specialty))){specialties.set(normalize(specialty),specialty);out.addedSpecialties.push(specialty);}
  item.id=id('expected');item.requestId=request.id;knownItems.set(key,item);out.deliverables.push(item);
 }catch(e){fail(index+firstDataRow,e);}});
 if(!out.errors.length){try{validatePlanning({...state,specialties:[...state.specialties,...out.addedSpecialties],planningRequests:[...(state.planningRequests||[]),...out.requests],expectedDeliverables:[...(state.expectedDeliverables||[]),...out.deliverables]});}catch(e){fail(0,e);}}
 return out;
}
export function applyPlanImport(state:Register,rows:string[][],mapping:PlanImportMapping,firstDataRow=2):Register {const preview=previewPlanImport(state,rows,mapping,firstDataRow);if(preview.errors.length)throw new Error(`Importacion bloqueada: ${preview.errors[0].message}`);if(!preview.deliverables.length)return state;return {...state,specialties:[...state.specialties,...preview.addedSpecialties],planningRequests:[...(state.planningRequests||[]),...preview.requests],expectedDeliverables:[...(state.expectedDeliverables||[]),...preview.deliverables]};}
export function planTemplateRows(){return [planImportFields.map(f=>planImportLabels[f]),['SOL-DEMO-01','Solicitud ficticia','Vialidad','ENT-001','Modelo tramo norte','Lineal','Tramo A','','Vialidad','Modelo','Subcontrato demo','F','2026-11-30'],['SOL-DEMO-02','Solicitud puente ficticio','Puentes','ENT-001','Modelo paso superior','Puntual','Obra 01','Sector norte','Estructuras','Modelo','Subcontrato demo','F','2026-11-30']];}
