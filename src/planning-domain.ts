import { date as validDate } from './document-register.ts';
import type { Register } from './document-register.ts';

/** Coverage describes only the declared request scope, never the whole contract. */
export interface PlanningRequest {
  id: string; key: string; title: string; projectType: string;
  coverage: 'Parcial' | 'Completa'; expectedSpecialties: string[];
}
export interface ExpectedDeliverable {
  id: string; requestId: string; key: string; title: string;
  scopeType: 'Lineal' | 'Puntual'; scopeName: string; relatedSector: string;
  specialty: string; type: string; contractor: string;
  targetIdentifier?: string; plannedDate: string; baseDispatchIds: string[];
  planVersion: number;
}
/** Append-only explicit assessment. Neither a file nor a matching revision implies coverage. */
export interface PlanningReceipt {
  id: string; expectedId: string; date: string;
  evidenceType: 'model' | 'document' | 'manual'; evidenceId: string;
  identifier: string; assessment: 'Parcial' | 'Cubre lo solicitado';
  note: string; reviewer: string;
  planVersion: number; targetIdentifier: string; plannedDate: string;
}
export interface PlanningChange {
  id: string; expectedId: string; previous: ExpectedDeliverable; newPlanVersion: number; changedAt: string;
}
export type PlanningRequestInput = Omit<PlanningRequest, 'id'>;
export type ExpectedDeliverableInput = Omit<ExpectedDeliverable, 'id' | 'planVersion'>;
export type ExpectedDeliverablePatch = Partial<Omit<ExpectedDeliverable, 'id' | 'requestId' | 'key' | 'planVersion'>>;
export interface PlanningReceiptInput {
  expectedId: string; date: string; evidenceType: PlanningReceipt['evidenceType'];
  evidenceId: string; identifier?: string; assessment: PlanningReceipt['assessment'];
  note: string; reviewer: string;
}
export const PLANNING_LIMITS = Object.freeze({ requests: 1000, expected: 25000, receipts: 25000, changes: 50000, specialties: 1000, specialtiesTotal: 25000, linksPerExpected: 1000, linksTotal: 100000 });
const normalized = (value: string) => value.trim().toLowerCase();
const matches = (left: string, right: string) => normalized(left) === normalized(right);
function bounded(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new Error(`${label}: ${required ? 'obligatorio; ' : ''}maximo ${max} caracteres.`);
  return value;
}
function isoDate(value: unknown, optional = false): string {
  return validDate(bounded(value, 'Fecha de planificacion', 10, !optional), optional);
}
function collection<T>(value: unknown, max: number, label: string): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}: coleccion incompatible o limite ${max} excedido.`);
  return value as T[];
}
export function requestList(s: Register): PlanningRequest[] { return collection(s.planningRequests, PLANNING_LIMITS.requests, 'Solicitudes'); }
export function expectedList(s: Register): ExpectedDeliverable[] { return collection(s.expectedDeliverables, PLANNING_LIMITS.expected, 'Entregables esperados'); }
export function receiptList(s: Register): PlanningReceipt[] { return collection(s.planningReceipts, PLANNING_LIMITS.receipts, 'Recepciones'); }
export function changeList(s: Register): PlanningChange[] { return collection(s.planningChanges, PLANNING_LIMITS.changes, 'Historial del plan'); }
export const planningChangeList = changeList;
export const planningRequestList = requestList;
export const expectedDeliverableList = expectedList;
export const planningReceiptList = receiptList;
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Fila de planificacion incompatible.');
}
function rowId(value: unknown, ids: Set<string>): void {
  const id = bounded(value, 'Identificador', 100);
  if (id !== id.trim() || ids.has(id)) throw new Error('Identificador duplicado o incompatible.');
  ids.add(id);
}
function planVersion(value: unknown): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('Version del plan incompatible.');
}
function nextId(prefix: string, rows: { id: string }[]): string {
  const ids = new Set(rows.map(row => row.id));
  let n = rows.length + 1;
  while (ids.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function stringArray(value: unknown, label: string, max: number, width: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}: lista incompatible.`);
  const seen = new Set<string>();
  for (const item of value) {
    bounded(item, label, width);
    if (seen.has(item)) throw new Error(`${label}: valor duplicado.`);
    seen.add(item);
  }
  return value;
}

/** Linear indexed validation, including imported collections with 12,000+ expected rows. */
export function validatePlanning(s: Register): void {
  const requests = requestList(s), expected = expectedList(s), receipts = receiptList(s), changes = changeList(s);
  if (!requests.length && !expected.length && !receipts.length && !changes.length) return;
  const catalog = new Set(s.specialties);
  const requestIds = new Set<string>(), requestKeys = new Set<string>();
  const requestMap = new Map<string, PlanningRequest>(), declared = new Map<string, Set<string>>();
  let specialtyDeclarations = 0;
  for (const request of requests) {
    object(request); rowId(request.id, requestIds);
    bounded(request.key, 'Clave de solicitud', 80); bounded(request.title, 'Solicitud', 240); bounded(request.projectType, 'Tipo de proyecto', 80);
    if (!['Parcial', 'Completa'].includes(request.coverage)) throw new Error('Cobertura de solicitud incompatible.');
    const key = normalized(request.key);
    if (requestKeys.has(key)) throw new Error('Clave de solicitud duplicada.');
    requestKeys.add(key);
    const specialties = stringArray(request.expectedSpecialties, 'Especialidades esperadas', PLANNING_LIMITS.specialties, 100);
    specialtyDeclarations += specialties.length;
    if (specialtyDeclarations > PLANNING_LIMITS.specialtiesTotal) throw new Error('Limite de 25000 declaraciones de especialidad en todas las solicitudes.');
    if (new Set(specialties.map(normalized)).size !== specialties.length || specialties.some(specialty => !catalog.has(specialty))) throw new Error('Declara especialidades existentes en el catalogo, sin duplicados.');
    requestMap.set(request.id, request); declared.set(request.id, new Set(specialties));
  }
  const dispatches = new Set((s.baseDispatches ?? []).map(dispatch => dispatch.id));
  const expectedIds = new Set<string>(), expectedKeys = new Set<string>(), expectedMap = new Map<string, ExpectedDeliverable>();
  let links = 0;
  function checkExpected(item: ExpectedDeliverable, historical: boolean): number {
    object(item); bounded(item.id, 'Identificador del entregable', 100);
    bounded(item.requestId, 'Solicitud del entregable', 100);
    if (!requestMap.has(item.requestId)) throw new Error('Entregable sin solicitud declarada.');
    bounded(item.key, 'Clave del entregable', 80); bounded(item.title, 'Entregable', 240);
    if (!['Lineal', 'Puntual'].includes(item.scopeType)) throw new Error('Alcance del entregable incompatible.');
    bounded(item.scopeName, 'Tramo o punto', 120); bounded(item.relatedSector, 'Sector relacionado', 120, false);
    bounded(item.specialty, 'Especialidad', 100); bounded(item.type, 'Tipo de entregable', 80); bounded(item.contractor, 'Responsable del entregable', 120, false);
    if (!historical && !declared.get(item.requestId)!.has(item.specialty)) throw new Error('La especialidad del entregable no esta declarada en la solicitud.');
    if (item.targetIdentifier !== undefined) bounded(item.targetIdentifier, 'Identificador objetivo', 40, false);
    isoDate(item.plannedDate, true); planVersion(item.planVersion);
    const ids = stringArray(item.baseDispatchIds, 'Envios de bases vinculados', PLANNING_LIMITS.linksPerExpected, 100);
    if (ids.some(id => !dispatches.has(id))) throw new Error('Envio de base vinculado inexistente.');
    return ids.length;
  }
  for (const item of expected) {
    object(item); rowId(item.id, expectedIds);
    links += checkExpected(item, false);
    const key = JSON.stringify([item.requestId, normalized(item.key)]);
    if (expectedKeys.has(key)) throw new Error('Clave de entregable duplicada en la solicitud.');
    expectedKeys.add(key);
    if (links > PLANNING_LIMITS.linksTotal) throw new Error('Demasiados vinculos de bases en el plan.');
    expectedMap.set(item.id, item);
  }
  const plans = new Map<string, ExpectedDeliverable>(expected.map(item => [JSON.stringify([item.id, item.planVersion]), item]));
  const changeIds = new Set<string>(), changeCounts = new Map<string, number>();
  for (const change of changes) {
    object(change); rowId(change.id, changeIds); bounded(change.expectedId, 'Entregable del cambio', 100);
    const current = expectedMap.get(change.expectedId);
    if (!current) throw new Error('Cambio sin entregable esperado.');
    object(change.previous); links += checkExpected(change.previous, true);
    if (links > PLANNING_LIMITS.linksTotal) throw new Error('Demasiados vinculos de bases en el historial del plan.');
    planVersion(change.newPlanVersion);
    if (change.previous.id !== change.expectedId || change.previous.key !== current.key || change.previous.requestId !== current.requestId || change.newPlanVersion !== change.previous.planVersion + 1 || change.newPlanVersion > current.planVersion) throw new Error('Version o identidad del historial del plan incompatible.');
    bounded(change.changedAt, 'Fecha del cambio de plan', 24);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(change.changedAt) || !Number.isFinite(Date.parse(change.changedAt)) || new Date(change.changedAt).toISOString() !== change.changedAt) throw new Error('Fecha del cambio de plan incompatible.');
    const key = JSON.stringify([change.expectedId, change.previous.planVersion]);
    if (plans.has(key)) throw new Error('Version historica del plan duplicada.');
    plans.set(key, change.previous); changeCounts.set(change.expectedId, (changeCounts.get(change.expectedId) ?? 0) + 1);
  }
  for (const item of expected) if ((changeCounts.get(item.id) ?? 0) !== item.planVersion - 1) throw new Error('Falta historial de versiones del plan.');
  const versions = new Map(s.versions.map(version => [version.id, version]));
  const documents = new Set(s.documents.map(document => document.id));
  const deliveries = new Map((s.modelDeliveries ?? []).map(delivery => [delivery.id, delivery]));
  const models = new Set((s.outgoingModels ?? []).map(model => model.id));
  const receiptIds = new Set<string>(), snapshots = new Map<string, string>();
  for (const receipt of receipts) {
    object(receipt); rowId(receipt.id, receiptIds);
    bounded(receipt.expectedId, 'Entregable recibido', 100);
    const item = expectedMap.get(receipt.expectedId);
    if (!item) throw new Error('Recepcion sin entregable esperado.');
    isoDate(receipt.date); isoDate(receipt.plannedDate, true); planVersion(receipt.planVersion);
    if (receipt.planVersion > item.planVersion) throw new Error('Recepcion de una version futura del plan.');
    bounded(receipt.identifier, 'Identificador recibido', 40, false); bounded(receipt.targetIdentifier, 'Objetivo historico', 40, false);
    bounded(receipt.evidenceId, 'Referencia de evidencia', 100, false);
    bounded(receipt.note, 'Nota de recepcion', 2000, false); bounded(receipt.reviewer, 'Declarado por', 120);
    if (!['model', 'document', 'manual'].includes(receipt.evidenceType) || !['Parcial', 'Cubre lo solicitado'].includes(receipt.assessment)) throw new Error('Evidencia o evaluacion de recepcion incompatible.');
    if (receipt.evidenceType === 'manual') {
      if (receipt.evidenceId !== '' || !receipt.note.trim()) throw new Error('La declaracion manual requiere nota y ninguna referencia de archivo.');
    } else {
      const evidence = receipt.evidenceType === 'model' ? deliveries.get(receipt.evidenceId) : versions.get(receipt.evidenceId);
      if (!evidence || receipt.evidenceType === 'model' && !models.has(deliveries.get(receipt.evidenceId)!.modelId) || receipt.evidenceType === 'document' && !documents.has(versions.get(receipt.evidenceId)!.documentId)) throw new Error('Evidencia de recepcion inexistente o incompatible.');
      if (receipt.identifier !== evidence.revision) throw new Error('El identificador no coincide con la evidencia referenciada.');
      isoDate(evidence.date);
      if (receipt.date < evidence.date) throw new Error('La recepcion no puede ser anterior a la disponibilidad de su evidencia.');
    }
    const mismatch = !!receipt.targetIdentifier.trim() && !matches(receipt.identifier, receipt.targetIdentifier);
    if (mismatch && receipt.assessment === 'Cubre lo solicitado') throw new Error('No puede confirmar cobertura: el identificador recibido difiere del objetivo. Registra recepcion parcial o cambia explicitamente el objetivo del plan.');
    if (mismatch && !receipt.note.trim()) throw new Error('La diferencia frente al objetivo requiere un motivo explicito.');
    const plan = plans.get(JSON.stringify([receipt.expectedId, receipt.planVersion]));
    if (!plan || receipt.targetIdentifier !== (plan.targetIdentifier ?? '') || receipt.plannedDate !== plan.plannedDate) throw new Error('La recepcion no conserva el objetivo y plazo de su version del plan.');
    const snapshotKey = JSON.stringify([receipt.expectedId, receipt.planVersion]);
    const snapshot = JSON.stringify([receipt.targetIdentifier, receipt.plannedDate]);
    if (snapshots.has(snapshotKey) && snapshots.get(snapshotKey) !== snapshot) throw new Error('Recepciones de una misma version del plan con objetivos incompatibles.');
    snapshots.set(snapshotKey, snapshot);
  }
}

function requestInput(input: PlanningRequestInput): PlanningRequestInput {
  object(input);
  return {
    key: bounded(input.key, 'Clave de solicitud', 80).trim(), title: bounded(input.title, 'Solicitud', 240).trim(),
    projectType: bounded(input.projectType, 'Tipo de proyecto', 80).trim(), coverage: input.coverage,
    expectedSpecialties: [...stringArray(input.expectedSpecialties, 'Especialidades esperadas', PLANNING_LIMITS.specialties, 100)],
  };
}
function expectedInput(input: ExpectedDeliverableInput): ExpectedDeliverableInput {
  object(input);
  return {
    requestId: bounded(input.requestId, 'Solicitud', 100).trim(), key: bounded(input.key, 'Clave del entregable', 80).trim(),
    title: bounded(input.title, 'Entregable', 240).trim(), scopeType: input.scopeType,
    scopeName: bounded(input.scopeName, 'Tramo o punto', 120).trim(), relatedSector: bounded(input.relatedSector, 'Sector relacionado', 120, false).trim(),
    specialty: bounded(input.specialty, 'Especialidad', 100), type: bounded(input.type, 'Tipo de entregable', 80).trim(),
    contractor: bounded(input.contractor, 'Responsable', 120, false).trim(),
    ...(input.targetIdentifier === undefined ? {} : { targetIdentifier: bounded(input.targetIdentifier, 'Objetivo', 40, false).trim() }),
    plannedDate: isoDate(input.plannedDate, true), baseDispatchIds: [...stringArray(input.baseDispatchIds, 'Envios de bases', PLANNING_LIMITS.linksPerExpected, 100)],
  };
}
export function addPlanningRequest(s: Register, input: PlanningRequestInput): Register {
  validatePlanning(s);
  const row: PlanningRequest = { id: nextId('request', requestList(s)), ...requestInput(input) };
  const next = { ...s, planningRequests: [...requestList(s), row] };
  validatePlanning(next); return next;
}
export function editPlanningRequest(s: Register, requestId: string, input: PlanningRequestInput): Register {
  validatePlanning(s);
  const original = requestList(s).find(request => request.id === requestId);
  if (!original) throw new Error('Solicitud no encontrada.');
  const values = requestInput(input);
  if (!matches(values.key, original.key)) throw new Error('La clave estable de la solicitud no puede cambiarse.');
  const row = { id: requestId, ...values, key: original.key };
  if (row.title === original.title && row.projectType === original.projectType && row.coverage === original.coverage && JSON.stringify([...row.expectedSpecialties].sort()) === JSON.stringify([...original.expectedSpecialties].sort())) return s;
  const next = { ...s, planningRequests: requestList(s).map(request => request.id === requestId ? row : request) };
  // Removing an in-use specialty fails validation; no expected rows are silently reassigned.
  validatePlanning(next); return next;
}
export function addExpectedDeliverable(s: Register, input: ExpectedDeliverableInput): Register {
  validatePlanning(s);
  const row: ExpectedDeliverable = { id: nextId('expected', expectedList(s)), ...expectedInput(input), planVersion: 1 };
  const next = { ...s, expectedDeliverables: [...expectedList(s), row] };
  validatePlanning(next); return next;
}
function sameExpected(left: ExpectedDeliverableInput, right: ExpectedDeliverableInput): boolean {
  const canonical = (value: ExpectedDeliverableInput) => {
    const clean = expectedInput(value);
    return [clean.requestId, clean.key, clean.title, clean.scopeType, clean.scopeName, clean.relatedSector, clean.specialty, clean.type, clean.contractor, clean.targetIdentifier ?? '', clean.plannedDate, [...clean.baseDispatchIds].sort()];
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
function changedPlan(original: ExpectedDeliverable, newPlanVersion: number, id: string, changedAt: string): PlanningChange {
  return { id, expectedId: original.id, previous: { ...original, baseDispatchIds: [...original.baseDispatchIds] }, newPlanVersion, changedAt };
}
export function editExpectedDeliverable(s: Register, expectedId: string, input: ExpectedDeliverableInput): Register {
  validatePlanning(s);
  const original = expectedList(s).find(item => item.id === expectedId);
  if (!original) throw new Error('Entregable esperado no encontrado.');
  const values = expectedInput(input);
  if (!matches(values.key, original.key) || !matches(values.requestId, original.requestId)) throw new Error('La clave y solicitud estables del entregable no pueden cambiarse.');
  values.key = original.key; values.requestId = original.requestId;
  if (sameExpected(original, values)) return s;
  const row: ExpectedDeliverable = { id: original.id, ...values, planVersion: original.planVersion + 1 };
  const change = changedPlan(original, row.planVersion, nextId('plan-change', changeList(s)), new Date().toISOString());
  const next = { ...s, expectedDeliverables: expectedList(s).map(item => item.id === expectedId ? row : item), planningChanges: [...changeList(s), change] };
  validatePlanning(next); return next;
}
/** One validation/one indexed pass for the whole batch; errors leave the input entirely untouched. */
export function batchUpdateExpectedDeliverables(s: Register, ids: string[], patch: ExpectedDeliverablePatch): Register {
  validatePlanning(s); object(patch);
  const selected = new Set(stringArray(ids, 'Entregables seleccionados', PLANNING_LIMITS.expected, 100));
  const allowed = new Set(['title', 'scopeType', 'scopeName', 'relatedSector', 'specialty', 'type', 'contractor', 'targetIdentifier', 'plannedDate', 'baseDispatchIds']);
  if (Object.keys(patch).some(key => !allowed.has(key))) throw new Error('El lote no puede cambiar identidades ni solicitudes.');
  const found = new Set<string>(), existingChanges = changeList(s), newChanges: PlanningChange[] = [];
  const changeIds = new Set(existingChanges.map(change => change.id)); let sequence = existingChanges.length + 1;
  const changedAt = new Date().toISOString();
  const rows = expectedList(s).map(item => {
    if (!selected.has(item.id)) return item;
    found.add(item.id);
    const values = expectedInput({ ...item, ...patch });
    if (sameExpected(item, values)) return item;
    while (changeIds.has(`plan-change-${sequence}`)) sequence++;
    const changeId = `plan-change-${sequence++}`; changeIds.add(changeId);
    newChanges.push(changedPlan(item, item.planVersion + 1, changeId, changedAt));
    return { id: item.id, ...values, planVersion: item.planVersion + 1 };
  });
  if (found.size !== selected.size) throw new Error('El lote contiene entregables inexistentes.');
  if (!newChanges.length) return s;
  const next = { ...s, expectedDeliverables: rows, planningChanges: [...existingChanges, ...newChanges] };
  validatePlanning(next); return next;
}
export function addPlanningReceipt(s: Register, input: PlanningReceiptInput): Register {
  validatePlanning(s); object(input);
  const expectedId = bounded(input.expectedId, 'Entregable esperado', 100).trim();
  const item = expectedList(s).find(item => item.id === expectedId);
  if (!item) throw new Error('Entregable esperado no encontrado.');
  const evidenceId = bounded(input.evidenceId, 'Referencia de evidencia', 100, false).trim();
  const evidence = input.evidenceType === 'model' ? (s.modelDeliveries ?? []).find(delivery => delivery.id === evidenceId) : input.evidenceType === 'document' ? s.versions.find(version => version.id === evidenceId) : undefined;
  let identifier = input.identifier === undefined ? '' : bounded(input.identifier, 'Identificador recibido', 40, false);
  if (input.evidenceType !== 'manual') {
    if (!evidence) throw new Error('Selecciona una evidencia existente.');
    if (input.identifier !== undefined && identifier !== evidence.revision) throw new Error('El identificador no coincide con la evidencia referenciada.');
    identifier = evidence.revision;
  }
  const receipt: PlanningReceipt = {
    id: nextId('receipt', receiptList(s)), expectedId, date: isoDate(input.date), evidenceType: input.evidenceType, evidenceId,
    identifier, assessment: input.assessment, note: bounded(input.note, 'Nota de recepcion', 2000, false).trim(), reviewer: bounded(input.reviewer, 'Declarado por', 120).trim(),
    planVersion: item.planVersion, targetIdentifier: item.targetIdentifier ?? '', plannedDate: item.plannedDate,
  };
  const next = { ...s, planningReceipts: [...receiptList(s), receipt] };
  validatePlanning(next); return next;
}

export interface PlanningRow extends ExpectedDeliverable {
  received: boolean; receivedCurrent: boolean; covered: boolean; pendingTarget: boolean; overdue: boolean;
  targetMatch: 'Coincide' | 'Distinta' | 'Sin recepcion' | 'Sin objetivo';
  latestReceipt?: PlanningReceipt; latestCurrentReceipt?: PlanningReceipt;
}
export interface PlanningCounters {
  total: number; received: number; receivedCurrent: number; covered: number; pending: number;
  pendingTarget: number; overdue: number; withoutDeadline: number;
  denominatorKnown: boolean; percent: number | null;
}
export interface PlanningSpecialtyStats extends PlanningCounters {
  requestId: string; specialty: string; status: 'Entregables por definir' | 'Definidos';
}
export interface PlanningRequestStats extends PlanningCounters {
  request: PlanningRequest; specialties: PlanningSpecialtyStats[]; undefinedSpecialties: number;
}
export interface PlanningStats extends PlanningCounters {
  rows: PlanningRow[]; requests: PlanningRequestStats[]; specialties: PlanningSpecialtyStats[]; undefinedSpecialties: number;
}
function counters(): PlanningCounters { return { total: 0, received: 0, receivedCurrent: 0, covered: 0, pending: 0, pendingTarget: 0, overdue: 0, withoutDeadline: 0, denominatorKnown: false, percent: null }; }
function count(target: PlanningCounters, row: PlanningRow): void {
  target.total++; target.received += Number(row.received); target.receivedCurrent += Number(row.receivedCurrent);
  target.covered += Number(row.covered); target.pending += Number(!row.covered); target.pendingTarget += Number(row.pendingTarget);
  target.overdue += Number(row.overdue); target.withoutDeadline += Number(!row.plannedDate);
}
function finish(target: PlanningCounters, known: boolean): void {
  target.denominatorKnown = known && target.total > 0;
  target.percent = target.denominatorKnown ? target.covered / target.total * 100 : null;
}
/** Latest actual receipt date, append-order ties; current-plan evidence is never inferred from old plans. */
export function planningStats(s: Register, today: string, requestId?: string): PlanningStats {
  isoDate(today);
  const requests = requestList(s).filter(request => requestId === undefined || request.id === requestId);
  const requestIds = new Set(requests.map(request => request.id));
  const expected = expectedList(s).filter(item => requestIds.has(item.requestId));
  const expectedById = new Map(expected.map(item => [item.id, item]));
  const latest = new Map<string, PlanningReceipt>(), current = new Map<string, PlanningReceipt>();
  for (const receipt of receiptList(s)) {
    const item = expectedById.get(receipt.expectedId);
    if (!item) continue;
    if (!latest.has(item.id) || receipt.date >= latest.get(item.id)!.date) latest.set(item.id, receipt);
    if (receipt.planVersion === item.planVersion && (!current.has(item.id) || receipt.date >= current.get(item.id)!.date)) current.set(item.id, receipt);
  }
  const rows: PlanningRow[] = expected.map(item => {
    const latestReceipt = latest.get(item.id), latestCurrentReceipt = current.get(item.id);
    const hasTarget = !!item.targetIdentifier?.trim();
    const targetMatch = !hasTarget ? 'Sin objetivo' : !latestCurrentReceipt ? 'Sin recepcion' : matches(latestCurrentReceipt.identifier, item.targetIdentifier!) ? 'Coincide' : 'Distinta';
    const pendingTarget = hasTarget && targetMatch !== 'Coincide';
    const covered = latestCurrentReceipt?.assessment === 'Cubre lo solicitado' && !pendingTarget;
    return { ...item, received: !!latestReceipt, receivedCurrent: !!latestCurrentReceipt, covered, pendingTarget, targetMatch,
      overdue: !!item.plannedDate && item.plannedDate < today && (!covered || pendingTarget), latestReceipt, latestCurrentReceipt };
  });
  const requestStats = requests.map(request => ({ ...counters(), request, specialties: request.expectedSpecialties.map(specialty => ({ ...counters(), requestId: request.id, specialty, status: 'Entregables por definir' as PlanningSpecialtyStats['status'] })), undefinedSpecialties: 0 }));
  const requestMap = new Map(requestStats.map(stats => [stats.request.id, stats]));
  const specialtyMap = new Map(requestStats.flatMap(stats => stats.specialties.map(specialty => [JSON.stringify([specialty.requestId, specialty.specialty]), specialty] as const)));
  const result: PlanningStats = { ...counters(), rows, requests: requestStats, specialties: [], undefinedSpecialties: 0 };
  for (const row of rows) {
    count(result, row); count(requestMap.get(row.requestId)!, row);
    const specialty = specialtyMap.get(JSON.stringify([row.requestId, row.specialty]));
    if (specialty) count(specialty, row);
  }
  for (const stats of requestStats) {
    for (const specialty of stats.specialties) {
      specialty.status = specialty.total ? 'Definidos' : 'Entregables por definir'; finish(specialty, specialty.total > 0);
      if (!specialty.denominatorKnown) stats.undefinedSpecialties++;
    }
    finish(stats, stats.specialties.length > 0 && stats.undefinedSpecialties === 0);
    result.undefinedSpecialties += stats.undefinedSpecialties;
    result.specialties.push(...stats.specialties);
  }
  finish(result, requestStats.length > 0 && requestStats.every(stats => stats.denominatorKnown));
  return result;
}
export function expectedSpecialtyStats(s: Register, today: string, requestId?: string): PlanningSpecialtyStats[] { return planningStats(s, today, requestId).specialties; }

/** Explicit opt-in only. Appends synthetic planned work, never infers receipts from available files. */
export function seedPlanningExample(s: Register): Register {
  validatePlanning(s);
  if (requestList(s).some(request => normalized(request.key) === 'demo-plan')) return s;
  const specialty = s.specialties[0] ?? 'Especialidad de ejemplo';
  let undefinedSpecialty = s.specialties.find(value => value !== specialty) ?? 'Especialidad pendiente de ejemplo';
  if (undefinedSpecialty === specialty) undefinedSpecialty = 'Otra especialidad pendiente de ejemplo';
  const catalog = [...new Set([...s.specialties, specialty, undefinedSpecialty])];
  let next = catalog.length === s.specialties.length ? s : { ...s, specialties: catalog };
  next = addPlanningRequest(next, { key: 'DEMO-PLAN', title: 'Solicitud sintetica de ejemplo', projectType: 'Infraestructura de ejemplo', coverage: 'Parcial', expectedSpecialties: [specialty, undefinedSpecialty] });
  const requestId = requestList(next).at(-1)!.id;
  next = addExpectedDeliverable(next, { requestId, key: 'DEMO-TRAMO', title: 'Modelo del tramo de ejemplo', scopeType: 'Lineal', scopeName: 'Tramo de ejemplo', relatedSector: '', specialty, type: 'Modelo', contractor: 'Equipo de ejemplo', targetIdentifier: 'F', plannedDate: '', baseDispatchIds: [] });
  next = addExpectedDeliverable(next, { requestId, key: 'DEMO-PUNTO', title: 'Obra puntual de ejemplo', scopeType: 'Puntual', scopeName: 'Paso superior de ejemplo', relatedSector: 'Tramo de ejemplo', specialty, type: 'Modelo', contractor: '', targetIdentifier: 'F', plannedDate: '', baseDispatchIds: [] });
  return next;
}
