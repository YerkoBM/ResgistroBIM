import {seedRegister,migrateLegacy,validateRegister} from './document-register';
import type {Register} from './document-register';
export const KEY='registro-documental-demo-v2';
export const LEGACY_KEY='registro-bim-demo-v1';
/** Local-only adapter. Legacy records remain untouched under their original key. */
export class LocalDemoRepository {
 private storage:Storage|null=null;
 private memory:Register|null=null;
 private observedRaw:string|null=null;
 readonly persistent:boolean;
 blocked=false; recoveryRaw=''; migrated=false;
 constructor(){try{const s=window.localStorage;s.getItem(KEY);this.storage=s;}catch{}this.persistent=this.storage!==null;}
 load():Register{try{const raw=this.storage?.getItem(KEY);this.observedRaw=raw??null;if(raw){this.recoveryRaw=raw;return validateRegister(JSON.parse(raw));}const legacy=this.storage?.getItem(LEGACY_KEY);if(legacy){this.recoveryRaw=legacy;const next=migrateLegacy(JSON.parse(legacy));this.migrated=true;return next;}return this.memory||seedRegister();}catch(e){this.blocked=true;throw e;}}
 save(state:Register){if(this.blocked)throw new Error('Registro local incompatible: la edicion esta bloqueada para conservar los datos originales. Descarga el respaldo.');validateRegister(state);const raw=JSON.stringify(state);if(raw.length>12_000_000)throw new Error('El registro supera el limite local (12 millones de caracteres). No se guardaron cambios; exporta un respaldo.');if(this.storage){if(this.storage.getItem(KEY)!==this.observedRaw)throw new Error('El registro cambio en otra pestaña. Recarga antes de guardar; no se reemplazaron los datos.');try{this.storage.setItem(KEY,raw);this.observedRaw=raw;}catch{throw new Error('No hay espacio disponible para guardar este registro. Datos anteriores conservados; exporta un respaldo o reduce el lote.');}}else this.memory=state;}
 legacyRaw(){return this.storage?.getItem(LEGACY_KEY)||'';}
}
