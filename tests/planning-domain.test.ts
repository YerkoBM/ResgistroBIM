import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { addBaseDispatch } from '../src/base-dispatch.ts';
import { addRevision, seedRegister, validateRegister } from '../src/document-register.ts';
import type { Register } from '../src/document-register.ts';
import { addExpectedDeliverable, addPlanningReceipt, addPlanningRequest, batchUpdateExpectedDeliverables, changeList, editExpectedDeliverable, editPlanningRequest, expectedList, expectedSpecialtyStats, planningStats, receiptList, requestList, seedPlanningExample, validatePlanning } from '../src/planning-domain.ts';
import type { ExpectedDeliverableInput, PlanningReceiptInput, PlanningRequestInput } from '../src/planning-domain.ts';

// Entirely synthetic demonstration data; no private workbook, company or project input.
const today = '2026-10-28';
const seed = () => seedRegister(new Date(today + 'T12:00:00Z'));
const requestInput = (overrides: Partial<PlanningRequestInput> = {}): PlanningRequestInput => ({ key: 'REQ-A', title: 'Synthetic expected scope', projectType: 'Synthetic infrastructure', coverage: 'Parcial', expectedSpecialties: ['Vialidad', 'Estructuras'], ...overrides });
const itemInput = (overrides: Partial<ExpectedDeliverableInput> = {}): ExpectedDeliverableInput => ({ requestId: 'request-1', key: 'ROW-A', title: 'Synthetic planned model', scopeType: 'Lineal', scopeName: 'Synthetic segment 1', relatedSector: '', specialty: 'Vialidad', type: 'Modelo', contractor: 'Synthetic company', targetIdentifier: 'F', plannedDate: '2026-10-20', baseDispatchIds: [], ...overrides });
const withRequest = () => addPlanningRequest(seed(), requestInput());
const planned = () => addExpectedDeliverable(withRequest(), itemInput());
const receiptInput = (overrides: Partial<PlanningReceiptInput> = {}): PlanningReceiptInput => ({ expectedId: 'expected-1', date: today, evidenceType: 'model', evidenceId: 'mdl-1', assessment: 'Parcial', note: 'Synthetic reason: available E, requested F remains pending.', reviewer: 'Synthetic reviewer', ...overrides });
const manual = (overrides: Partial<PlanningReceiptInput> = {}): PlanningReceiptInput => receiptInput({ evidenceType: 'manual', evidenceId: '', identifier: 'F', note: 'Explicit synthetic declaration without a linked file.', ...overrides });

function mutate(register: Register, action: (register: Register) => void): Register { const copy = structuredClone(register); action(copy); return copy; }

test('legacy undefined planning is preserved; existing available, sent and approved files do not invent a plan or receipt', () => {
  const s = seed(), before = structuredClone(s);
  assert.ok(s.versions.length && s.modelDeliveries!.length && s.modelSubmissions!.length);
  assert.deepEqual(requestList(s), []); assert.deepEqual(expectedList(s), []); assert.deepEqual(receiptList(s), []);
  validatePlanning(s); assert.equal(validateRegister(s), s);
  const stats = planningStats(s, today);
  assert.equal(stats.total, 0); assert.equal(stats.received, 0); assert.equal(stats.covered, 0);
  assert.equal(stats.percent, null); assert.equal(stats.denominatorKnown, false);
  assert.deepEqual(s, before);
  for (const key of ['planningRequests', 'expectedDeliverables', 'planningReceipts', 'planningChanges']) assert.equal(Object.hasOwn(s, key), false);
});

test('declared specialty with no rows is Entregables por definir with unknown denominator, never zero percent', () => {
  const s = withRequest(); const before = structuredClone(s);
  for (const stats of expectedSpecialtyStats(s, today)) {
    assert.equal(stats.total, 0); assert.equal(stats.status, 'Entregables por definir'); assert.equal(stats.percent, null);
  }
  assert.equal(planningStats(s, today).undefinedSpecialties, 2);
  const partial = planned(), stats = planningStats(partial, today);
  assert.equal(stats.total, 1); assert.equal(stats.percent, null); assert.equal(stats.denominatorKnown, false);
  assert.equal(stats.specialties.find(row => row.specialty === 'Vialidad')!.percent, 0);
  assert.equal(stats.specialties.find(row => row.specialty === 'Estructuras')!.percent, null);
  assert.deepEqual(s, before);
});

test('empty declared specialties are allowed for creation but cannot assert coverage or admit undeclared rows', () => {
  const s = addPlanningRequest(seed(), requestInput({ expectedSpecialties: [], coverage: 'Completa' }));
  assert.equal(planningStats(s, today).percent, null);
  assert.equal(planningStats(s, today).requests[0].denominatorKnown, false);
  assert.throws(() => addExpectedDeliverable(s, itemInput()), /especialidad.*declarada/);
  for (const expectedSpecialties of [['Vialidad', 'Vialidad'], ['vialidad'], ['Missing']]) assert.throws(() => addPlanningRequest(seed(), requestInput({ expectedSpecialties })));
  assert.deepEqual(s.planningRequests![0].expectedSpecialties, []);
});

test('specialties are declared explicitly; edits cannot remove in-use declarations or silently expand catalog', () => {
  const s = planned(), before = structuredClone(s);
  assert.throws(() => addExpectedDeliverable(s, itemInput({ key: 'ROW-B', specialty: 'Drenaje' })), /declarada/);
  assert.throws(() => editPlanningRequest(s, 'request-1', requestInput({ expectedSpecialties: ['Estructuras'] })), /declarada/);
  const expanded = editPlanningRequest(s, 'request-1', requestInput({ expectedSpecialties: ['Vialidad', 'Drenaje'] }));
  assert.equal(addExpectedDeliverable(expanded, itemInput({ key: 'ROW-B', specialty: 'Drenaje' })).expectedDeliverables!.length, 2);
  assert.deepEqual(s, before); assert.deepEqual(expanded.specialties, s.specialties);
});

test('request keys are global; expected keys are request-scoped, trim/case matching only', () => {
  let s = planned();
  assert.throws(() => addPlanningRequest(s, requestInput({ key: '  req-a  ' })), /duplicada/);
  assert.throws(() => addExpectedDeliverable(s, itemInput({ key: ' row-a ' })), /duplicada/);
  s = addPlanningRequest(s, requestInput({ key: 'REQ-B' }));
  s = addExpectedDeliverable(s, itemInput({ requestId: 'request-2' }));
  assert.equal(s.expectedDeliverables!.length, 2);
  s = addExpectedDeliverable(s, itemInput({ key: 'ROW  A' }));
  s = addExpectedDeliverable(s, itemInput({ key: 'ROW A' }));
  assert.equal(s.expectedDeliverables!.length, 4); validatePlanning(s);
});

test('lineal and punctual scopes remain literal and pending targets/dates are never guessed from filenames', () => {
  const s = addExpectedDeliverable(planned(), itemInput({ key: 'ROW-B', scopeType: 'Puntual', scopeName: 'Synthetic bridge', relatedSector: 'Synthetic sector', targetIdentifier: '2099-12-31', plannedDate: '' }));
  const stats = planningStats(s, today);
  assert.equal(stats.rows[0].scopeType, 'Lineal'); assert.equal(stats.rows[1].scopeType, 'Puntual');
  assert.equal(stats.rows[1].targetIdentifier, '2099-12-31'); assert.equal(stats.rows[1].plannedDate, '');
  assert.equal(stats.rows[1].overdue, false); assert.equal(stats.withoutDeadline, 1);
  assert.equal(stats.received, 0); assert.equal(stats.covered, 0);
  assert.equal(stats.rows[0].pendingTarget, true);
});

test('base links select explicit existing outbound events, not available versions; no external actions', () => {
  const s = planned(), before = structuredClone(s);
  for (const baseDispatchIds of [['ver-1'], ['missing'], ['base-dispatch-1']]) assert.throws(() => editExpectedDeliverable(s, 'expected-1', itemInput({ baseDispatchIds })), /Envio.*inexistente/);
  const sent = addBaseDispatch(s, { versionId: 'ver-1', recipient: 'Synthetic company', date: today });
  const linked = editExpectedDeliverable(sent, 'expected-1', itemInput({ baseDispatchIds: ['base-dispatch-1'] }));
  assert.deepEqual(linked.expectedDeliverables![0].baseDispatchIds, ['base-dispatch-1']);
  assert.equal(linked.expectedDeliverables![0].planVersion, 2); assert.deepEqual(receiptList(linked), []);
  assert.throws(() => editExpectedDeliverable(sent, 'expected-1', itemInput({ baseDispatchIds: ['base-dispatch-1', 'base-dispatch-1'] })), /duplicado/);
  assert.deepEqual(s, before);
});

test('E receipt for F is received but not covered automatically; partial matching F also is not covered', () => {
  const s = planned(), before = structuredClone(s);
  const received = addPlanningReceipt(s, receiptInput());
  const stats = planningStats(received, today), row = stats.rows[0];
  assert.equal(stats.received, 1); assert.equal(stats.receivedCurrent, 1); assert.equal(stats.covered, 0);
  assert.equal(row.targetMatch, 'Distinta'); assert.equal(row.pendingTarget, true); assert.equal(row.overdue, true);
  assert.equal(row.targetIdentifier, 'F'); assert.equal(row.plannedDate, '2026-10-20');
  assert.deepEqual(s, before); assert.deepEqual(received.expectedDeliverables, s.expectedDeliverables);
  const matchingPartial = addPlanningReceipt(s, receiptInput({ evidenceId: 'mdl-2', note: '' }));
  assert.equal(planningStats(matchingPartial, today).rows[0].targetMatch, 'Coincide');
  assert.equal(planningStats(matchingPartial, today).covered, 0);
});

test('only explicit matching current-plan coverage counts; E/F cannot be declared covered even with a reason', () => {
  const s = planned();
  assert.throws(() => addPlanningReceipt(s, receiptInput({ assessment: 'Parcial', note: '' })), /diferencia.*motivo/);
  for (const note of ['', 'Explicit reason is not a replacement for the required F']) assert.throws(() => addPlanningReceipt(s, receiptInput({ assessment: 'Cubre lo solicitado', note })), /No puede confirmar cobertura/);
  const coveredF = addPlanningReceipt(s, receiptInput({ evidenceId: 'mdl-2', assessment: 'Cubre lo solicitado', note: '' }));
  const rowF = planningStats(coveredF, today).rows[0];
  assert.equal(rowF.covered, true); assert.equal(rowF.pendingTarget, false); assert.equal(rowF.overdue, false);
  assert.equal(coveredF.expectedDeliverables![0].plannedDate, s.expectedDeliverables![0].plannedDate);
  assert.equal(coveredF.versions[0].status, s.versions[0].status);
  const corrupt = mutate(coveredF, value => { value.planningReceipts![0].identifier = 'E'; value.planningReceipts![0].evidenceId = 'mdl-1'; });
  assert.throws(() => validatePlanning(corrupt), /No puede confirmar cobertura/);
  assert.equal(planningStats(corrupt, today).covered, 0);
});

test('manual receipt is an explicit declaration requiring note and reviewer, without any implied file evidence', () => {
  const s = planned();
  assert.throws(() => addPlanningReceipt(s, manual({ note: ' ' })), /declaracion manual/);
  assert.throws(() => addPlanningReceipt(s, manual({ evidenceId: 'mdl-2' })), /declaracion manual/);
  assert.throws(() => addPlanningReceipt(s, manual({ reviewer: '' })), /Declarado por/);
  const next = addPlanningReceipt(s, manual({ identifier: '', assessment: 'Parcial' }));
  const receipt = receiptList(next)[0];
  assert.equal(receipt.evidenceType, 'manual'); assert.equal(receipt.evidenceId, '');
  assert.equal(receipt.identifier, ''); assert.equal(planningStats(next, today).rows[0].pendingTarget, true);
  assert.deepEqual(next.modelDeliveries, s.modelDeliveries); assert.deepEqual(next.versions, s.versions);
});

test('linked receipt pins exact model/document evidence, literal identifier and availability chronology', () => {
  const s = planned();
  assert.throws(() => addPlanningReceipt(s, receiptInput({ evidenceId: 'ver-1' })), /evidencia existente/);
  assert.throws(() => addPlanningReceipt(s, receiptInput({ evidenceId: 'missing' })), /evidencia existente/);
  assert.throws(() => addPlanningReceipt(s, receiptInput({ date: '2026-10-01' })), /anterior/);
  assert.throws(() => addPlanningReceipt(s, receiptInput({ identifier: 'F' })), /no coincide/);
  const sameDay = addPlanningReceipt(s, receiptInput({ date: '2026-10-27' }));
  assert.equal(receiptList(sameDay)[0].identifier, 'E');
  const document = addPlanningReceipt(s, receiptInput({ evidenceType: 'document', evidenceId: 'ver-1' }));
  assert.equal(receiptList(document)[0].identifier, 'A');
  const dateIdentifier = mutate(s, value => { value.versions[0].revision = '2099-12-31'; value.versions[0].fileName = 'synthetic_2099-12-31.isa'; });
  const literal = addPlanningReceipt(dateIdentifier, receiptInput({ evidenceType: 'document', evidenceId: 'ver-1' }));
  assert.equal(receiptList(literal)[0].identifier, '2099-12-31'); assert.equal(receiptList(literal)[0].date, today);
});

test('latest actual date then append order decides assessment; later partial reopens and never deletes history', () => {
  let s = addPlanningReceipt(planned(), manual({ date: '2026-10-28', assessment: 'Cubre lo solicitado' }));
  s = addPlanningReceipt(s, manual({ date: '2026-10-27', assessment: 'Parcial' }));
  assert.equal(planningStats(s, today).covered, 1); // backdated append must not win
  s = addPlanningReceipt(s, manual({ date: '2026-10-28', assessment: 'Parcial' }));
  assert.equal(planningStats(s, today).covered, 0); assert.equal(receiptList(s).length, 3);
  assert.equal(planningStats(s, today).rows[0].latestCurrentReceipt!.id, 'receipt-3');
});

test('target comparison trims/case-folds only and does not guess progression or parse revision labels', () => {
  let s = planned();
  s = addPlanningReceipt(s, manual({ identifier: ' f ', note: 'Explicit declaration' }));
  assert.equal(planningStats(s, today).rows[0].targetMatch, 'Coincide');
  s = addPlanningReceipt(s, manual({ identifier: 'G' }));
  assert.equal(planningStats(s, today).rows[0].targetMatch, 'Distinta');
  s = editExpectedDeliverable(s, 'expected-1', itemInput({ targetIdentifier: undefined }));
  assert.equal(planningStats(s, today).rows[0].targetMatch, 'Sin objetivo');
  assert.equal(planningStats(s, today).rows[0].pendingTarget, false);
});

test('meaningful expected edit versions commitments; unchanged edit preserves current coverage and historical receipts', () => {
  const s = addPlanningReceipt(planned(), manual({ assessment: 'Cubre lo solicitado' }));
  const oldReceipts = structuredClone(s.planningReceipts), before = structuredClone(s);
  const next = editExpectedDeliverable(s, 'expected-1', itemInput({ targetIdentifier: 'G', plannedDate: '2027-01-01' }));
  const stats = planningStats(next, today);
  assert.equal(next.expectedDeliverables![0].planVersion, 2);
  assert.equal(stats.received, 1); assert.equal(stats.receivedCurrent, 0); assert.equal(stats.covered, 0);
  assert.equal(stats.rows[0].targetMatch, 'Sin recepcion'); assert.equal(stats.pendingTarget, 1); assert.equal(stats.overdue, 0);
  assert.deepEqual(next.planningReceipts, oldReceipts); assert.deepEqual(s, before);
  assert.equal(next.planningReceipts![0].targetIdentifier, 'F'); assert.equal(next.planningReceipts![0].plannedDate, '2026-10-20');
  const noOpEdit = editExpectedDeliverable(next, 'expected-1', next.expectedDeliverables![0]);
  assert.equal(noOpEdit, next); assert.equal(noOpEdit.expectedDeliverables![0].planVersion, 2); validatePlanning(noOpEdit);
  assert.equal(changeList(next).length, 1); assert.deepEqual(changeList(next)[0].previous, s.expectedDeliverables![0]);
  assert.equal(changeList(next)[0].newPlanVersion, 2); assert.match(changeList(next)[0].changedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('batch update is atomic, changes selected rows once, preserves receipts and rejects undeclared specialty or identities', () => {
  let s = addExpectedDeliverable(planned(), itemInput({ key: 'ROW-B', specialty: 'Estructuras' }));
  s = addPlanningReceipt(s, manual({ assessment: 'Cubre lo solicitado' }));
  const before = structuredClone(s);
  const next = batchUpdateExpectedDeliverables(s, ['expected-1', 'expected-2'], { contractor: 'New synthetic team', plannedDate: '' });
  assert.deepEqual(next.expectedDeliverables!.map(item => item.planVersion), [2, 2]);
  assert.deepEqual(next.expectedDeliverables!.map(item => item.contractor), ['New synthetic team', 'New synthetic team']);
  assert.deepEqual(next.planningReceipts, s.planningReceipts); assert.equal(planningStats(next, today).covered, 0);
  for (const ids of [['expected-1', 'missing'], ['expected-1', 'expected-1']]) assert.throws(() => batchUpdateExpectedDeliverables(s, ids, { plannedDate: '' }));
  assert.throws(() => batchUpdateExpectedDeliverables(s, ['expected-1'], { specialty: 'Drenaje' }), /declarada/);
  assert.throws(() => batchUpdateExpectedDeliverables(s, ['expected-1'], { requestId: 'request-2' } as never), /identidades/);
  assert.deepEqual(s, before);
});

test('request/specialty totals reconcile only against defined requested scope, not available inventory or contract completeness', () => {
  let s = addExpectedDeliverable(planned(), itemInput({ key: 'ROW-B', specialty: 'Estructuras', plannedDate: '' }));
  s = addPlanningReceipt(s, manual({ assessment: 'Cubre lo solicitado' }));
  let stats = planningStats(s, today);
  assert.equal(stats.total, 2); assert.equal(stats.covered, 1); assert.equal(stats.pending, 1); assert.equal(stats.percent, 50);
  assert.equal(stats.denominatorKnown, true); assert.equal(stats.requests[0].request.coverage, 'Parcial');
  assert.equal(stats.specialties.reduce((sum, row) => sum + row.total, 0), stats.total);
  assert.equal(stats.specialties.reduce((sum, row) => sum + row.covered, 0), stats.covered);
  s = addPlanningRequest(s, requestInput({ key: 'REQ-B', coverage: 'Completa', expectedSpecialties: ['Drenaje'] }));
  stats = planningStats(s, today);
  assert.equal(stats.percent, null); assert.equal(stats.undefinedSpecialties, 1);
  assert.equal(planningStats(s, today, 'request-1').percent, 50);
  assert.equal(planningStats(s, today, 'request-2').percent, null);
  assert.equal(planningStats(s, today, 'missing').percent, null);
  assert.throws(() => planningStats(s, '2026-02-30'));
});

test('persisted malformed arrays, ids, enums, dates, references and snapshots are rejected without mutation', () => {
  const valid = addPlanningReceipt(planned(), receiptInput());
  const mutations: ((s: Register) => void)[] = [
    s => { s.planningRequests = null as never; }, s => { s.expectedDeliverables = {} as never; }, s => { s.planningReceipts = false as never; },
    s => { s.planningRequests![0] = null as never; }, s => { s.expectedDeliverables![0] = [] as never; }, s => { s.planningReceipts![0] = 'bad' as never; },
    s => { s.planningRequests!.push({ ...s.planningRequests![0] }); }, s => { s.expectedDeliverables!.push({ ...s.expectedDeliverables![0] }); }, s => { s.planningReceipts!.push({ ...s.planningReceipts![0] }); },
    s => { s.planningRequests![0].coverage = 'Contract complete' as never; }, s => { s.planningRequests![0].expectedSpecialties = ['Missing']; },
    s => { s.expectedDeliverables![0].requestId = 'missing'; }, s => { s.expectedDeliverables![0].scopeType = 'Guessed' as never; }, s => { s.expectedDeliverables![0].plannedDate = '2026-02-30'; },
    s => { s.expectedDeliverables![0].targetIdentifier = null as never; }, s => { s.expectedDeliverables![0].baseDispatchIds = ['ver-1']; },
    s => { s.expectedDeliverables![0].planVersion = 0; }, s => { s.expectedDeliverables![0].planVersion = 1.5; }, s => { s.expectedDeliverables![0].planVersion = Number.MAX_SAFE_INTEGER + 1; },
    s => { s.planningReceipts![0].expectedId = 'missing'; }, s => { s.planningReceipts![0].date = '2026-01-01T00:00:00Z'; },
    s => { s.planningReceipts![0].planVersion = 2; }, s => { s.planningReceipts![0].targetIdentifier = 'tampered'; }, s => { s.planningReceipts![0].plannedDate = ''; },
    s => { s.planningReceipts![0].identifier = 'tampered'; }, s => { s.planningReceipts![0].evidenceId = 'missing'; }, s => { s.planningReceipts![0].evidenceType = 'auto' as never; },
    s => { s.planningReceipts![0].assessment = 'Aprobado' as never; }, s => { s.planningReceipts![0].reviewer = ''; }, s => { s.planningReceipts![0].note = null as never; },
    s => { s.outgoingModels = []; }, s => { s.planningReceipts![0].date = '2020-01-01'; },
  ];
  for (const mutation of mutations) {
    const invalid = mutate(valid, mutation), before = structuredClone(invalid);
    assert.throws(() => validatePlanning(invalid)); assert.deepEqual(invalid, before);
  }
  assert.equal(validateRegister(valid), valid);
});

test('historical same-plan snapshots must agree, while later edited plan legitimately has different target and date', () => {
  let s = addPlanningReceipt(planned(), manual());
  s = addPlanningReceipt(s, manual({ date: '2026-10-29' }));
  s = editExpectedDeliverable(s, 'expected-1', itemInput({ targetIdentifier: 'G', plannedDate: '2027-01-01' }));
  validatePlanning(s);
  const invalid = mutate(s, value => { value.planningReceipts![1].targetIdentifier = 'H'; });
  assert.throws(() => validatePlanning(invalid), /no conserva.*version del plan/);
  const newer = addPlanningReceipt(s, manual({ identifier: 'G', date: '2027-01-01' }));
  assert.equal(newer.planningReceipts![2].planVersion, 2); validatePlanning(newer);
});

test('typed bounds and collection limits fail safely; literal text is retained without evaluating it', () => {
  const s = planned();
  for (const patch of [{ title: 'x'.repeat(241) }, { key: 'x'.repeat(81) }, { projectType: 5 }, { expectedSpecialties: Array(1001).fill('Vialidad') }]) assert.throws(() => addPlanningRequest(seed(), requestInput(patch as never)));
  for (const patch of [{ title: 'x'.repeat(241) }, { scopeName: 'x'.repeat(121) }, { relatedSector: null }, { contractor: 'x'.repeat(121) }, { type: 'x'.repeat(81) }, { targetIdentifier: 'x'.repeat(41) }, { baseDispatchIds: Array(1001).fill('x') }, { plannedDate: null }]) assert.throws(() => addExpectedDeliverable(withRequest(), itemInput(patch as never)));
  for (const patch of [{ note: 'x'.repeat(2001) }, { reviewer: 'x'.repeat(121) }, { identifier: 'x'.repeat(41) }, { evidenceId: null }, { date: null }]) assert.throws(() => addPlanningReceipt(s, manual(patch as never)));
  for (const [key, limit] of [['planningRequests', 1000], ['expectedDeliverables', 25000], ['planningReceipts', 25000], ['planningChanges', 50000]] as const) assert.throws(() => validatePlanning({ ...s, [key]: Array(limit + 1).fill({}) }), /limite/);
  const literal = addPlanningReceipt(s, manual({ note: '=HYPERLINK("https://example.invalid") <script>never execute</script>' }));
  assert.equal(literal.planningReceipts![0].note, '=HYPERLINK("https://example.invalid") <script>never execute</script>');
});

test('explicit synthetic example is append-only/idempotent and never auto-creates receipts or overwrites existing data', () => {
  const s = planned(), before = structuredClone(s);
  const next = seedPlanningExample(s);
  assert.equal(next.planningRequests!.length, 2); assert.equal(next.expectedDeliverables!.length, 3);
  assert.deepEqual(next.planningRequests![0], s.planningRequests![0]); assert.deepEqual(next.expectedDeliverables![0], s.expectedDeliverables![0]);
  assert.deepEqual(receiptList(next), []); assert.deepEqual(next.versions, s.versions); assert.deepEqual(s, before);
  assert.equal(seedPlanningExample(next), next); validateRegister(next);
  const example = planningStats(next, today, next.planningRequests!.at(-1)!.id);
  assert.deepEqual(example.rows.map(row => row.scopeType), ['Lineal', 'Puntual']);
  assert.equal(example.undefinedSpecialties, 1); assert.equal(example.percent, null);
  assert.equal(example.rows[1].contractor, '');
});

test('12,000 synthetic expected rows plus receipts validate and update as indexed atomic batches', t => {
  const s = withRequest(), template = itemInput();
  s.expectedDeliverables = Array.from({ length: 12000 }, (_, index) => ({ ...template, id: `expected-${index + 1}`, key: `SYNTH-${index + 1}`, specialty: index % 2 ? 'Estructuras' : 'Vialidad', baseDispatchIds: [], planVersion: 1 }));
  s.planningReceipts = s.expectedDeliverables.map(item => ({ id: `receipt-${item.id}`, expectedId: item.id, date: today, evidenceType: 'manual', evidenceId: '', identifier: 'F', assessment: 'Cubre lo solicitado', note: 'Synthetic manual declaration', reviewer: 'Synthetic reviewer', planVersion: 1, targetIdentifier: 'F', plannedDate: template.plannedDate }));
  const start = performance.now(); validatePlanning(s); const validationMs = performance.now() - start;
  const stats = planningStats(s, today); assert.equal(stats.total, 12000); assert.equal(stats.covered, 12000); assert.equal(stats.percent, 100);
  const batchStart = performance.now(); const next = batchUpdateExpectedDeliverables(s, s.expectedDeliverables.map(item => item.id), { targetIdentifier: 'G' }); const batchMs = performance.now() - batchStart;
  assert.equal(planningStats(next, today).covered, 0); assert.equal(planningStats(next, today).received, 12000);
  assert.equal(next.expectedDeliverables![11999].planVersion, 2); assert.equal(s.expectedDeliverables[11999].planVersion, 1);
  assert.equal(next.planningReceipts, s.planningReceipts); assert.equal(s.planningReceipts[0].targetIdentifier, 'F');
  t.diagnostic(`Synthetic 12000 rows + 12000 receipts: validation ${validationMs.toFixed(1)}ms; atomic batch ${batchMs.toFixed(1)}ms (Node, not browser).`);
  assert.ok(validationMs < 5000 && batchMs < 5000, 'Indexed validation/batch should not exhibit quadratic 12k behavior.');
});

test('unreceived commitments still get full append-only history before any meaningful edit or batch', () => {
  let s = planned();
  const first = structuredClone(s.expectedDeliverables![0]);
  s = editExpectedDeliverable(s, 'expected-1', itemInput({ targetIdentifier: 'G', plannedDate: '2027-02-01', contractor: 'Second synthetic company', scopeName: 'Revised synthetic segment', relatedSector: 'Synthetic sector 2' }));
  assert.deepEqual(receiptList(s), []); assert.deepEqual(changeList(s)[0].previous, first);
  const second = structuredClone(s.expectedDeliverables![0]);
  s = batchUpdateExpectedDeliverables(s, ['expected-1'], { contractor: '', targetIdentifier: 'H', plannedDate: '' });
  assert.equal(changeList(s).length, 2); assert.deepEqual(changeList(s)[0].previous, first); assert.deepEqual(changeList(s)[1].previous, second);
  assert.equal(s.expectedDeliverables![0].planVersion, 3); assert.deepEqual(receiptList(s), []); validatePlanning(s);
});

test('no-op edit/batch preserves current coverage, references and absent history; empty target variants and link order are equivalent', () => {
  let s = addPlanningReceipt(planned(), manual({ assessment: 'Cubre lo solicitado' }));
  const same = editExpectedDeliverable(s, 'expected-1', itemInput({ title: '  Synthetic planned model  ' }));
  assert.equal(same, s); assert.equal(planningStats(same, today).covered, 1);
  assert.equal(batchUpdateExpectedDeliverables(s, ['expected-1'], { contractor: 'Synthetic company' }), s);
  assert.equal(batchUpdateExpectedDeliverables(s, ['expected-1'], {}), s);
  assert.equal(batchUpdateExpectedDeliverables(s, [], { plannedDate: '' }), s);
  assert.equal(Object.hasOwn(s, 'planningChanges'), false);
  const targetless = addExpectedDeliverable(withRequest(), itemInput({ targetIdentifier: undefined }));
  assert.equal(editExpectedDeliverable(targetless, 'expected-1', itemInput({ targetIdentifier: '' })), targetless);
  s = addBaseDispatch(s, { versionId: 'ver-1', recipient: 'Synthetic A', date: today });
  s = addBaseDispatch(s, { versionId: 'ver-2', recipient: 'Synthetic B', date: today });
  s = editExpectedDeliverable(s, 'expected-1', itemInput({ baseDispatchIds: ['base-dispatch-1', 'base-dispatch-2'] }));
  assert.equal(editExpectedDeliverable(s, 'expected-1', itemInput({ baseDispatchIds: ['base-dispatch-2', 'base-dispatch-1'] })), s);
});

test('restored history rejects missing chains, duplicate versions, invalid timestamps, orphan identities and forged receipt commitments', () => {
  let s = addPlanningReceipt(planned(), manual());
  s = editExpectedDeliverable(s, 'expected-1', itemInput({ targetIdentifier: 'G', plannedDate: '2027-02-01' }));
  const mutations: ((s: Register) => void)[] = [
    value => { delete value.planningChanges; }, value => { value.planningChanges = null as never; },
    value => { value.planningChanges![0] = null as never; }, value => { value.planningChanges![0].previous = null as never; },
    value => { value.planningChanges![0].expectedId = 'missing'; }, value => { value.planningChanges![0].previous.id = 'expected-2'; },
    value => { value.planningChanges![0].previous.requestId = 'missing'; }, value => { value.planningChanges![0].previous.key = 'forged-stable-key'; }, value => { value.planningChanges![0].previous.scopeType = 'Guess' as never; },
    value => { value.planningChanges![0].previous.contractor = null as never; }, value => { value.planningChanges![0].previous.baseDispatchIds = ['ver-1']; },
    value => { value.planningChanges![0].newPlanVersion = 3; }, value => { value.planningChanges![0].previous.planVersion = 0; },
    value => { value.planningChanges![0].changedAt = '2026-10-28'; }, value => { value.planningChanges![0].changedAt = '2026-02-30T00:00:00.000Z'; },
    value => { value.planningChanges!.push({ ...value.planningChanges![0], id: 'different-id' }); },
    value => { value.planningReceipts![0].targetIdentifier = 'G'; }, value => { value.planningReceipts![0].plannedDate = '2027-02-01'; },
  ];
  for (const mutation of mutations) { const invalid = mutate(s, mutation), before = structuredClone(invalid); assert.throws(() => validatePlanning(invalid)); assert.deepEqual(invalid, before); }
  assert.equal(validateRegister(s), s);
});

test('historical specialty declaration survives reassignment without preventing explicit removal of now-unused request declaration', () => {
  let s = planned();
  s = editExpectedDeliverable(s, 'expected-1', itemInput({ specialty: 'Estructuras' }));
  s = editPlanningRequest(s, 'request-1', requestInput({ expectedSpecialties: ['Estructuras'] }));
  assert.equal(s.expectedDeliverables![0].specialty, 'Estructuras');
  assert.equal(changeList(s)[0].previous.specialty, 'Vialidad'); validatePlanning(s);
});

test('unknown target allows explicit declared coverage but remains distinct from revision matching', () => {
  let s = addPlanningRequest(seed(), requestInput({ expectedSpecialties: ['Vialidad'] }));
  s = addExpectedDeliverable(s, itemInput({ targetIdentifier: undefined, contractor: '', plannedDate: '' }));
  assert.equal(planningStats(s, today).covered, 0);
  s = addPlanningReceipt(s, manual({ identifier: '', assessment: 'Cubre lo solicitado' }));
  const stats = planningStats(s, today);
  assert.equal(stats.rows[0].targetMatch, 'Sin objetivo'); assert.equal(stats.covered, 1); assert.equal(stats.percent, 100);
  assert.equal(stats.pendingTarget, 0); assert.equal(stats.withoutDeadline, 1); validatePlanning(s);
});

test('total expected-specialty declarations across requests are bounded before allocating million-entry statistics', () => {
  const s: Register = { schema: 2, specialties: Array.from({ length: 1000 }, (_, index) => `Synthetic specialty ${index}`), documents: [], versions: [], observations: [] };
  s.planningRequests = Array.from({ length: 25 }, (_, index) => ({ ...requestInput({ key: `REQ-${index}`, expectedSpecialties: [...s.specialties] }), id: `request-${index}` }));
  validatePlanning(s); assert.equal(validateRegister(s), s);
  const invalid = { ...s, planningRequests: [...s.planningRequests, { ...requestInput({ key: 'REQ-OVER', expectedSpecialties: [s.specialties[0]] }), id: 'request-over' }] };
  const before = structuredClone(invalid);
  assert.throws(() => validatePlanning(invalid), /25000 declaraciones/); assert.deepEqual(invalid, before);
});

test('request and expected import keys stay immutable; normalized equivalent edits preserve stored identity and no-op coverage', () => {
  let s = addPlanningRequest(planned(), requestInput({ key: 'REQ-B' }));
  s = addPlanningReceipt(s, manual({ assessment: 'Cubre lo solicitado' }));
  const before = structuredClone(s);
  assert.throws(() => editPlanningRequest(s, 'request-1', requestInput({ key: 'RENAMED' })), /clave estable/);
  assert.throws(() => editExpectedDeliverable(s, 'expected-1', itemInput({ key: 'RENAMED' })), /clave y solicitud estables/);
  assert.throws(() => editExpectedDeliverable(s, 'expected-1', itemInput({ requestId: 'request-2' })), /clave y solicitud estables/);
  assert.deepEqual(s, before);
  assert.equal(editPlanningRequest(s, 'request-1', requestInput({ key: '  req-a  ', expectedSpecialties: ['Estructuras', 'Vialidad'] })), s);
  assert.equal(editExpectedDeliverable(s, 'expected-1', itemInput({ key: '  row-a  ', requestId: ' REQUEST-1 ' })), s);
  const renamedTitle = editPlanningRequest(s, 'request-1', requestInput({ key: 'req-a', title: 'New synthetic title' }));
  assert.equal(requestList(renamedTitle)[0].key, 'REQ-A');
  const edited = editExpectedDeliverable(s, 'expected-1', itemInput({ key: 'row-a', requestId: 'REQUEST-1', title: 'New synthetic row title' }));
  assert.equal(expectedList(edited)[0].key, 'ROW-A'); assert.equal(expectedList(edited)[0].requestId, 'request-1');
  assert.equal(expectedList(edited)[0].planVersion, 2); assert.equal(changeList(edited)[0].previous.key, 'ROW-A');
  assert.equal(planningStats(s, today).covered, 1); validatePlanning(edited);
});
