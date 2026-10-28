/** Local demonstration rules only. These role checks are not authentication or security. */
export type Role = 'specialist' | 'reviewer';
export interface Actor { name: string; role: Role }
export interface Deliverable { id: string; code: string; name: string; discipline: string; specialist: string }
export interface Version { id: string; deliverableId: string; revision: string; date: string; fileName: string; location: string; declaredChanges: string; checkedChanges: string; status: 'received' | 'approved'; submittedBy: string }
export interface Delivery { id: string; date: string; versionIds: string[]; by: string }
export interface Observation { id: string; code: string; versionId: string; title: string; priority: 'low' | 'medium' | 'high'; assignee: string; dueDate: string; status: 'open' | 'responded' | 'closed'; response?: string; resolvedVersionId?: string; evidence?: string; reviewedBy?: string }
export interface Model { id: string; name: string; inputVersionIds: string[]; date: string }
export interface AuditEvent { id: string; at: string; actor: string; action: string; target: string }
export interface CoreState { deliverables: Deliverable[]; versions: Version[]; deliveries: Delivery[]; observations: Observation[]; models: Model[]; history: AuditEvent[] }
export type NewVersion = Pick<Version, 'deliverableId' | 'revision' | 'date' | 'fileName' | 'declaredChanges' | 'checkedChanges'> & { location?: string };
export type NewObservation = Pick<Observation, 'versionId' | 'title' | 'priority' | 'assignee' | 'dueDate'>;
export interface ObservationResponse { response: string; resolvedVersionId: string; evidence: string }
function required(value: unknown, label: string, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label}: obligatorio, máximo ${max} caracteres.`);
  return value.trim();
}
function date(value: string): string { const v = required(value, 'Fecha', 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw new Error('Fecha no válida.'); return v; }
function role(actor: Actor, expected: Role): void { required(actor.name, 'Nombre', 120); if (actor.role !== expected) throw new Error(`Esta acción requiere el rol ${expected === 'reviewer' ? 'revisor' : 'especialista'} (simulado).`); }
function id(prefix: string, items: { id: string }[]): string { let n = items.length + 1; while (items.some(item => item.id === `${prefix}-${n}`)) n++; return `${prefix}-${n}`; }
function audit(state: CoreState, actor: Actor, action: string, target: string): AuditEvent[] { return [...state.history, { id: id('evt', state.history), at: new Date().toISOString(), actor: actor.name, action, target }]; }
function getVersion(state: CoreState, versionId: string): Version { const v = state.versions.find(v => v.id === versionId); if (!v) throw new Error('Versión no encontrada.'); return v; }
function getObservation(state: CoreState, observationId: string): Observation { const o = state.observations.find(o => o.id === observationId); if (!o) throw new Error('Observación no encontrada.'); return o; }
export function safeLocation(value = ''): string { const v = value.trim(); if (!v) return ''; if (v.length > 2048) throw new Error('URL demasiado larga.'); let url: URL; try { url = new URL(v); } catch { throw new Error('La ubicación debe ser una URL HTTPS o quedar vacía.'); } if (url.protocol !== 'https:' || url.username || url.password) throw new Error('La ubicación debe ser una URL HTTPS sin credenciales.'); return v; }
/** Latest received means most recently registered, not most recently approved. */
export function latestVersion(state: CoreState, deliverableId: string): Version | undefined { return state.versions.filter(v => v.deliverableId === deliverableId).at(-1); }
export function approvedVersion(state: CoreState, deliverableId: string): Version | undefined { return state.versions.filter(v => v.deliverableId === deliverableId && v.status === 'approved').at(-1); }
export function modelNeedsUpdate(state: CoreState, modelOrId: Model | string): boolean { const model = typeof modelOrId === 'string' ? state.models.find(m => m.id === modelOrId) : modelOrId; if (!model) throw new Error('Modelo no encontrado.'); return model.inputVersionIds.some(versionId => { const v = state.versions.find(v => v.id === versionId); return !v || latestVersion(state, v.deliverableId)?.id !== versionId; }); }
export function addVersion(state: CoreState, actor: Actor, input: NewVersion): CoreState {
  role(actor, 'specialist');
  if (!state.deliverables.some(d => d.id === input.deliverableId)) throw new Error('Entregable no encontrado.');
  const revision = required(input.revision, 'Revisión', 40);
  if (state.versions.some(v => v.deliverableId === input.deliverableId && v.revision.toLowerCase() === revision.toLowerCase())) throw new Error('La revisión ya existe. Registre una nueva revisión.');
  const version: Version = { id: id('ver', state.versions), deliverableId: input.deliverableId, revision, date: date(input.date), fileName: required(input.fileName, 'Archivo', 240), location: safeLocation(input.location), declaredChanges: required(input.declaredChanges, 'Cambios declarados'), checkedChanges: required(input.checkedChanges, 'Cambios comprobados'), status: 'received', submittedBy: actor.name };
  const delivery: Delivery = { id: id('del', state.deliveries), date: version.date, versionIds: [version.id], by: actor.name };
  return { ...state, versions: [...state.versions, version], deliveries: [...state.deliveries, delivery], history: audit(state, actor, 'Nueva versión recibida', version.id) };
}
export function approveVersion(state: CoreState, actor: Actor, versionId: string): CoreState {
  role(actor, 'reviewer'); const v = getVersion(state, versionId); if (v.status === 'approved') throw new Error('Esta versión ya está aprobada.');
  return { ...state, versions: state.versions.map(v => v.id === versionId ? { ...v, status: 'approved' as const } : v), history: audit(state, actor, 'Versión aprobada', versionId) };
}
export function addObservation(state: CoreState, actor: Actor, input: NewObservation): CoreState {
  role(actor, 'reviewer'); getVersion(state, input.versionId);
  if (!['low', 'medium', 'high'].includes(input.priority)) throw new Error('Prioridad no válida.');
  const observation: Observation = { id: id('obs', state.observations), code: `OBS-${String(state.observations.length + 1).padStart(3, '0')}`, versionId: input.versionId, title: required(input.title, 'Observación', 500), priority: input.priority, assignee: required(input.assignee, 'Responsable', 120), dueDate: date(input.dueDate), status: 'open' };
  return { ...state, observations: [...state.observations, observation], history: audit(state, actor, 'Observación creada', observation.id) };
}
export function respondObservation(state: CoreState, actor: Actor, observationId: string, input: ObservationResponse): CoreState {
  role(actor, 'specialist'); const observation = getObservation(state, observationId);
  if (observation.status === 'closed') throw new Error('Una observación cerrada no se puede modificar.');
  const source = getVersion(state, observation.versionId); const resolution = getVersion(state, input.resolvedVersionId);
  if (source.deliverableId !== resolution.deliverableId) throw new Error('La versión de resolución debe pertenecer al mismo entregable.');
  if (state.versions.indexOf(resolution) < state.versions.indexOf(source)) throw new Error('La versión de resolución no puede ser anterior a la observada.');
  const updated: Observation = { ...observation, response: required(input.response, 'Respuesta'), resolvedVersionId: resolution.id, evidence: required(input.evidence, 'Evidencia'), status: 'responded' };
  return { ...state, observations: state.observations.map(o => o.id === observationId ? updated : o), history: audit(state, actor, 'Observación respondida', observationId) };
}
export function closeObservation(state: CoreState, actor: Actor, observationId: string): CoreState {
  role(actor, 'reviewer'); const o = getObservation(state, observationId);
  if (o.status !== 'responded') throw new Error('Solo se puede cerrar una observación respondida.');
  required(o.response, 'Respuesta'); required(o.evidence, 'Evidencia');
  const original = getVersion(state, o.versionId); const resolved = getVersion(state, required(o.resolvedVersionId, 'Versión de resolución'));
  if (original.deliverableId !== resolved.deliverableId || state.versions.indexOf(resolved) < state.versions.indexOf(original)) throw new Error('Versión de resolución incompatible.');
  return { ...state, observations: state.observations.map(item => item.id === observationId ? { ...item, status: 'closed' as const, reviewedBy: actor.name } : item), history: audit(state, actor, 'Observación cerrada por revisor', observationId) };
}
/** Quote every CSV cell and neutralize spreadsheet formulas, including whitespace prefixes. */
export function exportCSVsafeinjection(rows: unknown[][]): string { return '\uFEFF' + rows.map(row => row.map(value => { let text = String(value ?? ''); if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; }).join(',')).join('\r\n'); }
export { seedState } from './seed.ts';
