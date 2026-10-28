import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBaseDispatch, dispatchList, latestBaseDispatchForCompany, validateBaseDispatches } from '../src/base-dispatch.ts';
import type { BaseDispatchInput } from '../src/base-dispatch.ts';
import { addRevision, editDocument, seedRegister, validateRegister } from '../src/document-register.ts';
import type { Register } from '../src/document-register.ts';

// All inputs are generated demonstration records. No real recipients, links or files.
const seed = () => seedRegister(new Date('2026-10-28T12:00:00Z'));
const input = (overrides: Partial<BaseDispatchInput> = {}): BaseDispatchInput => ({ versionId: 'ver-1', recipient: 'Synthetic Company A', date: '2026-10-28', location: '', note: '', ...overrides });
const sent = () => addBaseDispatch(seed(), input());

test('legacy undefined dispatches stay absent and availability never creates an outbound event', () => {
  const register = seed(), before = structuredClone(register);
  delete register.baseDispatches;
  assert.ok(register.versions.length > 0);
  assert.deepEqual(dispatchList(register), []);
  validateBaseDispatches(register);
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', 'Synthetic Company A'), undefined);
  assert.equal(Object.hasOwn(register, 'baseDispatches'), false);
  assert.deepEqual(register, before);
  const available = addRevision(register, { documentId: 'doc-1', revision: 'Synthetic next', date: '2030-01-01', fileName: 'synthetic_next.isa', url: '', changes: 'Synthetic version available' });
  assert.deepEqual(dispatchList(available), []); assert.equal(Object.hasOwn(available, 'baseDispatches'), false);
});

test('explicit dispatch stores immutable version snapshots and leaves every preexisting collection unchanged', () => {
  const register = seed(), before = structuredClone(register), version = register.versions.find(version => version.id === 'ver-1')!;
  const result = addBaseDispatch(register, input({ recipient: '  Synthetic Company A  ', location: '  Internal server / synthetic reference  ', note: '  Explicit synthetic send  ' }));
  assert.deepEqual(register, before);
  assert.equal(dispatchList(result).length, 1);
  assert.deepEqual(dispatchList(result)[0], { id: 'base-dispatch-1', versionId: 'ver-1', recipient: 'Synthetic Company A', date: '2026-10-28', location: 'Internal server / synthetic reference', note: 'Explicit synthetic send', documentCode: register.documents.find(document => document.id === version.documentId)!.code, fileName: version.fileName, identifier: version.revision });
  for (const key of ['documents', 'versions', 'observations', 'outgoingModels', 'modelDeliveries', 'modelSubmissions', 'modelComments'] as const) assert.deepEqual(result[key], register[key]);
  validateBaseDispatches(result); assert.equal(validateRegister(result), result);
});

test('ISA filenames and date-looking identifiers are literal, not parsed as availability or actual send dates', () => {
  const register = seed();
  const version = register.versions.find(version => version.id === 'ver-1')!;
  const availability = version.date;
  version.fileName = 'synthetic_base_2099-12-31.isa'; version.revision = '2099-12-31';
  const result = addBaseDispatch(register, input({ date: '2026-10-28' }));
  assert.equal(result.baseDispatches![0].date, '2026-10-28');
  assert.equal(result.baseDispatches![0].fileName, 'synthetic_base_2099-12-31.isa');
  assert.equal(result.baseDispatches![0].identifier, '2099-12-31');
  assert.equal(version.date, availability);
  validateBaseDispatches(result);
});

test('actual sent date cannot precede referenced version availability and same-day send is allowed', () => {
  const register = seed(), available = register.versions.find(version => version.id === 'ver-1')!.date;
  const dayBefore = new Date(Date.parse(available) - 86400000).toISOString().slice(0, 10);
  assert.throws(() => addBaseDispatch(register, input({ date: dayBefore })), /anterior.*disponibilidad/);
  assert.equal(addBaseDispatch(register, input({ date: available })).baseDispatches![0].date, available);
  for (const date of ['', '2026-02-30', '2026-1-1', '2026-10-28T12:00:00Z', 'not a date']) assert.throws(() => addBaseDispatch(register, input({ date })));
});

test('dispatch needs an existing version and document reference; no model or unknown-version inference', () => {
  for (const versionId of ['', 'missing', 'mdl-1']) assert.throws(() => addBaseDispatch(seed(), input({ versionId })));
  const register = seed(); register.documents = register.documents.filter(document => document.id !== register.versions[0].documentId);
  assert.throws(() => addBaseDispatch(register, input()), /disponible/);
});

test('repeated sends and several companies are retained as separate events with unique IDs', () => {
  let register = sent(); register = addBaseDispatch(register, input()); register = addBaseDispatch(register, input({ recipient: 'Synthetic Company B' }));
  assert.equal(register.baseDispatches!.length, 3);
  assert.equal(new Set(register.baseDispatches!.map(dispatch => dispatch.id)).size, 3);
  assert.deepEqual(register.baseDispatches!.map(dispatch => dispatch.recipient), ['Synthetic Company A', 'Synthetic Company A', 'Synthetic Company B']);
  validateBaseDispatches(register);
});

test('latest send is chosen by actual date then array order, never revision label or append date alone', () => {
  let register = addBaseDispatch(seed(), input({ date: '2026-12-01', note: 'Latest date' }));
  register = addBaseDispatch(register, input({ date: '2026-11-01', note: 'Added later but older date' }));
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', 'Synthetic Company A')!.note, 'Latest date');
  register = addBaseDispatch(register, input({ versionId: 'ver-4', date: '2026-12-01', note: 'Same date later event' }));
  const before = structuredClone(register);
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', 'Synthetic Company A')!.versionId, 'ver-4');
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', 'Synthetic Company A')!.note, 'Same date later event');
  assert.deepEqual(register, before);
});

test('recipient matching normalizes only trim and case, retaining exact internal whitespace, accents and document scope', () => {
  let register = addBaseDispatch(seed(), input({ recipient: 'Empresa Ñ', note: 'Exact company' }));
  register = addBaseDispatch(register, input({ recipient: 'Empresa N', note: 'Different accented name' }));
  register = addBaseDispatch(register, input({ recipient: 'Empresa  Ñ', note: 'Different internal whitespace' }));
  register = addBaseDispatch(register, input({ recipient: 'Empresa Ñ', versionId: 'ver-2', note: 'Other document' }));
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', '  EMPRESA ñ  ')!.note, 'Exact company');
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', 'Empresa N')!.note, 'Different accented name');
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', 'Empresa  Ñ')!.note, 'Different internal whitespace');
  assert.equal(latestBaseDispatchForCompany(register, 'doc-2', 'Empresa Ñ')!.note, 'Other document');
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', 'Empresa'), undefined);
  assert.equal(latestBaseDispatchForCompany(register, 'missing', 'Empresa Ñ'), undefined);
  assert.equal(latestBaseDispatchForCompany(register, 'doc-1', '   '), undefined);
});

test('historical document code and version evidence survive current-document metadata edits and newer versions', () => {
  const register = sent(), original = structuredClone(register.baseDispatches![0]), document = register.documents[0];
  let changed = editDocument(register, document.id, { ...document, code: 'SYNTHETIC-RENAMED', title: 'Synthetic renamed document', responsible: 'Synthetic new team' });
  validateBaseDispatches(changed);
  assert.deepEqual(changed.baseDispatches![0], original);
  changed = addRevision(changed, { documentId: document.id, revision: 'SYNTHETIC-C', date: '2030-01-01', fileName: 'synthetic_new.isa', url: '', changes: 'New available version' });
  assert.deepEqual(changed.baseDispatches![0], original); assert.equal(changed.baseDispatches!.length, 1);
  assert.equal(latestBaseDispatchForCompany(changed, document.id, 'Synthetic Company A')!.versionId, original.versionId);
  validateBaseDispatches(changed);
});

test('optional location and note normalize to plain empty strings and enforce typed limits without opening locations', () => {
  const result = addBaseDispatch(seed(), { versionId: 'ver-1', recipient: 'Synthetic Company A', date: '2026-10-28' });
  assert.equal(result.baseDispatches![0].location, ''); assert.equal(result.baseDispatches![0].note, '');
  const boundary = addBaseDispatch(seed(), input({ recipient: 'A'.repeat(120), location: 'L'.repeat(2048), note: 'N'.repeat(2000) }));
  validateBaseDispatches(boundary);
  for (const overrides of [{ recipient: ' ' }, { recipient: 'A'.repeat(121) }, { location: 'L'.repeat(2049) }, { note: 'N'.repeat(2001) }, { recipient: 42 }, { location: 42 }, { location: null }, { note: null }, { note: {} }]) assert.throws(() => addBaseDispatch(seed(), input(overrides as Partial<BaseDispatchInput>)));
  const literal = '<script>synthetic</script> \\internal\\share\\reference';
  assert.equal(addBaseDispatch(seed(), input({ location: literal })).baseDispatches![0].location, literal);
});

test('persisted duplicate IDs, invalid rows, types, bounds, dates and orphan references are rejected without mutation', () => {
  const valid = sent();
  const malformed: unknown[] = [null, {}, 'not array', [null], [{ ...valid.baseDispatches![0], id: '' }], [valid.baseDispatches![0], valid.baseDispatches![0]]];
  for (const value of malformed) {
    const register = { ...valid, baseDispatches: value } as Register;
    const before = structuredClone(register);
    assert.throws(() => validateBaseDispatches(register));
    if (!Array.isArray(value)) assert.throws(() => dispatchList(register));
    assert.deepEqual(register, before);
  }
  for (const change of [
    { versionId: 'missing' }, { recipient: '' }, { recipient: 42 }, { location: undefined }, { note: undefined }, { date: '1900-01-01' },
    { date: '2026-02-30' }, { fileName: 'different.isa' }, { identifier: 'different' }, { identifier: '' }, { documentCode: '' },
    { id: 'x'.repeat(101) }, { versionId: 'x'.repeat(101) }, { recipient: 'x'.repeat(121) }, { location: 'x'.repeat(2049) }, { note: 'x'.repeat(2001) },
    { documentCode: 'x'.repeat(81) }, { fileName: 'x'.repeat(241) }, { identifier: 'x'.repeat(41) },
  ]) assert.throws(() => validateBaseDispatches({ ...valid, baseDispatches: [{ ...valid.baseDispatches![0], ...change }] } as Register));
  const missingDocument = structuredClone(valid); missingDocument.documents = missingDocument.documents.filter(document => document.id !== 'doc-1');
  assert.throws(() => validateBaseDispatches(missingDocument));
});

test('persisted mutation of referenced version filename or identifier invalidates its dispatch snapshot', () => {
  const valid = sent();
  for (const field of ['fileName', 'revision'] as const) {
    const changed = structuredClone(valid); changed.versions.find(version => version.id === 'ver-1')![field] = 'Changed after dispatch';
    assert.throws(() => validateBaseDispatches(changed), /no coinciden/);
  }
});

test('10000 dispatch limit is enforced and generated IDs avoid collisions without changing previous events', () => {
  const valid = sent(), example = valid.baseDispatches![0];
  const full = { ...valid, baseDispatches: Array.from({ length: 10_000 }, (_, index) => ({ ...example, id: `base-dispatch-${index + 1}` })) };
  validateBaseDispatches(full); assert.throws(() => addBaseDispatch(full, input()), /10000/);
  assert.throws(() => validateBaseDispatches({ ...full, baseDispatches: [...full.baseDispatches, { ...example, id: 'one-too-many' }] }), /10000/);
  const sparse = { ...valid, baseDispatches: [{ ...example, id: 'base-dispatch-2' }] };
  assert.equal(addBaseDispatch(sparse, input()).baseDispatches!.at(-1)!.id, 'base-dispatch-3');
  assert.equal(sparse.baseDispatches.length, 1);
});
