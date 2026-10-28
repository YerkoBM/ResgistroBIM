import {seedRegister,migrateLegacy,validateRegister} from './document-register';
import type {Register} from './document-register';
export const KEY='registro-documental-demo-v2';
export const LEGACY_KEY='registro-bim-demo-v1';
/** Local-only adapter. Legacy records remain untouched under their original key. */
export class LocalDemoRepository {
 private storage:Storage|null=null;
 private memory:Register|null=null;
 readonly persistent:boolean;
 blocked=false; recoveryRaw=''; migrated=false;
 constructor(){try{const s=window.localStorage;s.setItem(KEY+'-probe','1');s.removeItem(KEY+'-probe');this.storage=s;}catch{}this.persistent=this.storage!==null;}
 load():Register{try{const raw=this.storage?.getItem(KEY);if(raw){this.recoveryRaw=raw;return validateRegister(JSON.parse(raw));}const legacy=this.storage?.getItem(LEGACY_KEY);if(legacy){this.recoveryRaw=legacy;const next=migrateLegacy(JSON.parse(legacy));this.migrated=true;return next;}return this.memory||seedRegister();}catch(e){this.blocked=true;throw e;}}
 save(state:Register){if(this.blocked)throw new Error('Registro local incompatible: la edicion esta bloqueada para conservar los datos originales. Descarga el respaldo.');validateRegister(state);if(this.storage)this.storage.setItem(KEY,JSON.stringify(state));else this.memory=state;}
 legacyRaw(){return this.storage?.getItem(LEGACY_KEY)||'';}
}
