import {seedState} from './domain';
import type {CoreState} from './domain';
import {validateState} from './storage-validator';
const KEY='registro-bim-demo-v1';
export interface RegisterRepository { load():CoreState; save(state:CoreState):void; }
/** Adapter local de demostracion. No es autenticacion ni almacenamiento compartido. */
export class LocalDemoRepository implements RegisterRepository {
 private storage:Storage|null=null;
 private memory:CoreState|null=null;
 readonly persistent:boolean;
 blocked=false;
 recoveryRaw='';
 constructor(){try{const s=window.localStorage;s.setItem(KEY+'-probe','1');s.removeItem(KEY+'-probe');this.storage=s;}catch{/* file:// y privacidad pueden impedir almacenamiento. */}this.persistent=this.storage!==null;}
 load(){const raw=this.storage?.getItem(KEY);if(!raw)return this.memory||seedState();try{return validateState(JSON.parse(raw));}catch(e){this.blocked=true;this.recoveryRaw=raw;throw e;}}
 save(state:CoreState){if(this.blocked)throw new Error('Registro local incompatible: descarga el respaldo y restablece la demo desde Historial antes de editar.');validateState(state);if(this.storage)this.storage.setItem(KEY,JSON.stringify(state));else this.memory=state;}
 reset(){this.blocked=false;const next=seedState();this.save(next);this.recoveryRaw='';return next;}
}
