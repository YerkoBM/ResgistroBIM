import { date as validDate } from './document-register.ts';
import type { Register } from './document-register.ts';

/** Explicit outbound event for an available base version; availability never implies dispatch. */
export interface BaseDispatch {
  id: string;
  versionId: string;
  recipient: string;
  date: string;
  /** Plain reference text; this module neither resolves nor opens locations. */
  location: string;
  note: string;
  /** Historical snapshots, retained when a document fiche is later edited. */
  documentCode: string;
  fileName: string;
  identifier: string;
}
export interface BaseDispatchInput {
  versionId: string;
  recipient: string;
  date: string;
  location?: string;
  note?: string;
}
const MAX_DISPATCHES = 10_000;
const normalizedRecipient = (recipient: string) => recipient.trim().toLowerCase();

function bounded(value: unknown, label: string, maximum: number, required = false): string {
  if (typeof value !== 'string' || value.length > maximum || required && !value.trim()) throw new Error(`${label}: ${required ? 'obligatorio y ' : ''}maximo ${maximum} caracteres.`);
  return value;
}
function dispatchDate(value: unknown): string {
  return validDate(bounded(value, 'Fecha real de envio', 10, true));
}

/** Legacy absence remains absent: this getter never injects a collection or derives events. */
export function dispatchList(register: Register): BaseDispatch[] {
  if (register.baseDispatches === undefined) return [];
  if (!Array.isArray(register.baseDispatches) || register.baseDispatches.length > MAX_DISPATCHES) throw new Error('Registro de envios de bases incompatible: maximo 10000 envios.');
  return register.baseDispatches;
}

export function validateBaseDispatches(register: Register): void {
  if (register.baseDispatches === undefined) return;
  if (!Array.isArray(register.baseDispatches) || register.baseDispatches.length > MAX_DISPATCHES) throw new Error('Registro de envios de bases incompatible: maximo 10000 envios.');
  const versions = new Map(register.versions.map(version => [version.id, version]));
  const documents = new Set(register.documents.map(document => document.id));
  const ids = new Set<string>();
  for (const dispatch of register.baseDispatches) {
    if (!dispatch || typeof dispatch !== 'object' || Array.isArray(dispatch)) throw new Error('Envio de base incompatible.');
    bounded(dispatch.id, 'ID de envio de base', 100, true);
    if (ids.has(dispatch.id)) throw new Error('ID de envio de base duplicado.');
    ids.add(dispatch.id);
    bounded(dispatch.versionId, 'Version de base', 100, true);
    bounded(dispatch.recipient, 'Empresa destinataria', 120, true);
    bounded(dispatch.location, 'Ubicacion del envio', 2048);
    bounded(dispatch.note, 'Nota del envio', 2000);
    bounded(dispatch.documentCode, 'Codigo documental del envio', 80, true);
    bounded(dispatch.fileName, 'Nombre original del envio', 240, true);
    bounded(dispatch.identifier, 'Identificador de la version enviada', 40, true);
    dispatchDate(dispatch.date);
    const version = versions.get(dispatch.versionId);
    if (!version || !documents.has(version.documentId)) throw new Error('Envio de base sin una version documental valida.');
    validDate(version.date);
    if (dispatch.date < version.date) throw new Error('El envio no puede ser anterior a la disponibilidad de la version de base.');
    if (dispatch.fileName !== version.fileName || dispatch.identifier !== version.revision) throw new Error('Los datos del envio no coinciden con la version de base referenciada.');
    // documentCode is historical: the current fiche may have been legitimately renamed.
    // It cannot be compared to today's document.code without rewriting valid old events.
  }
}

export function addBaseDispatch(register: Register, input: BaseDispatchInput): Register {
  validateBaseDispatches(register);
  const existing = dispatchList(register);
  if (existing.length >= MAX_DISPATCHES) throw new Error('Limite de 10000 envios de bases alcanzado; los anteriores se conservan.');
  const versionId = bounded(input.versionId, 'Version de base', 100, true).trim();
  const version = register.versions.find(version => version.id === versionId);
  const document = version && register.documents.find(document => document.id === version.documentId);
  if (!version || !document) throw new Error('Selecciona una version de base disponible.');
  const sent = dispatchDate(input.date);
  validDate(version.date);
  if (sent < version.date) throw new Error('El envio no puede ser anterior a la disponibilidad de la version de base.');
  const ids = new Set(existing.map(dispatch => dispatch.id));
  let sequence = existing.length + 1;
  while (ids.has(`base-dispatch-${sequence}`)) sequence++;
  const dispatch: BaseDispatch = {
    id: `base-dispatch-${sequence}`, versionId,
    recipient: bounded(input.recipient, 'Empresa destinataria', 120, true).trim(),
    date: sent,
    location: bounded(input.location === undefined ? '' : input.location, 'Ubicacion del envio', 2048).trim(),
    note: bounded(input.note === undefined ? '' : input.note, 'Nota del envio', 2000).trim(),
    documentCode: bounded(document.code, 'Codigo documental del envio', 80, true),
    fileName: bounded(version.fileName, 'Nombre original del envio', 240, true),
    // Revision/identifier is a literal string: never parse date-looking values or filenames.
    identifier: bounded(version.revision, 'Identificador de la version enviada', 40, true),
  };
  // Repeated sends, including the same company/version/date, are independent explicit events.
  return { ...register, baseDispatches: [...existing, dispatch] };
}

/** Latest actual send date for this document and exact normalized recipient; ties use append order. */
export function latestBaseDispatchForCompany(register: Register, documentId: string, recipient: string): BaseDispatch | undefined {
  const company = normalizedRecipient(recipient);
  if (!company) return undefined;
  const versions = new Set(register.versions.filter(version => version.documentId === documentId).map(version => version.id));
  let latest: BaseDispatch | undefined;
  for (const dispatch of dispatchList(register)) {
    if (!versions.has(dispatch.versionId) || normalizedRecipient(dispatch.recipient) !== company) continue;
    if (!latest || dispatch.date >= latest.date) latest = dispatch;
  }
  return latest;
}
