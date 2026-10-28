import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelInventoryKpis, manualModelKpis, parseExtensions, modelInventoryStages } from '../src/project-kpi.ts';
import { emptyInventory, defaultMapping } from '../src/inventory-domain.ts';
import type { InventorySnapshot, InventoryState, FolderRule } from '../src/inventory-domain.ts';
import { seedRegister } from '../src/document-register.ts';
import type { Register } from '../src/document-register.ts';

// Synthetic fixtures only. No user workbook or project records.
function snapshot(rows: string[][], scope = 'Synthetic scope'): InventorySnapshot {
  const headers = ['File VID', 'Latest version VID', 'File name', 'File location', 'Specialty', 'Revision', 'Status', 'Tags'];
  return { id: 'synthetic-snapshot', scope, label: 'Synthetic', exportDate: '2026-10-28', importedAt: '2026-10-28T00:00:00Z', fileName: 'synthetic.csv', sheet: 'Files', headers, rows, mapping: { ...defaultMapping(headers), specialty: 4, revision: 5, status: 6, tags: 7 } };
}
function row(id: string, name: string, path: string, specialty = 'Synthetic discipline') { return [id, `version-${id}`, name, path, specialty, '', '', '']; }
function state(current: InventorySnapshot, rules: FolderRule[] = []): InventoryState { return { schema: 1, snapshots: [current], links: [], folderRules: rules }; }
const sum = (values: Record<string, number>) => Object.values(values).reduce((total, count) => total + count, 0);

test('extension input is explicit, bounded, normalized and never supports wildcard or path matching', () => {
  assert.deepEqual(parseExtensions(' IFC, .ISA  .ifc\tRVT'), ['.ifc', '.isa', '.rvt']);
  assert.equal(parseExtensions(Array.from({ length: 10 }, (_, i) => `ext${i}`).join(' ')).length, 10);
  for (const invalid of ['', ' ', '*', '*.ifc', '.ifc;pdf', 'foo/bar', '..ifc', '.ifc.zip', 'ifc?x', 'a-b', Array.from({ length: 11 }, (_, i) => `x${i}`).join(',')]) assert.throws(() => parseExtensions(invalid));
});

test('default IFC uses case-insensitive final extension and never deduplicates generic filenames or alternative formats', () => {
  const current = snapshot([row('1', 'generic.IFC', '3_PUBLICADO'), row('2', 'generic.ifc', '1_WIP'), row('3', 'generic.isa', '2_COMPARTIDO'), row('4', 'generic.ifc.zip', '3_PUBLICADO'), row('5', 'without-extension', '3_PUBLICADO')]);
  const data = state(current);
  assert.deepEqual(modelInventoryKpis(data, current).records.map(entry => entry.record.fileId), ['1', '2']);
  const both = modelInventoryKpis(data, current, ['ifc', '.ISA']);
  assert.deepEqual(both.records.map(entry => entry.record.fileId), ['1', '2', '3']);
  assert.equal(both.total, 3); assert.equal(both.activeTotal, 3);
  assert.throws(() => modelInventoryKpis(data, current, []));
  assert.throws(() => modelInventoryKpis(data, current, ['ifc,isa']));
});

test('all six stage counts reconcile; unknown stays active while archive and attachments are excluded', () => {
  const current = snapshot([
    row('1', 'published.ifc', '/Project prefix/3_PUBLICADO/discipline', 'A'),
    row('2', 'shared.ifc', 'Project prefix\\2_COMPARTIDO\\discipline', 'A'),
    row('3', 'wip.ifc', 'Project prefix/1_wIp/discipline', 'B'),
    row('4', 'unknown.ifc', 'Project prefix/custom', ''),
    row('5', 'archived.ifc', 'Project prefix/4_ARCHIVADO/3_PUBLICADO', 'Archived-only'),
    row('6', 'attachment.ifc', 'Project prefix/3_PUBLICADO/.ATTACHMENT/nested', 'Attachment-only'),
  ]);
  const result = modelInventoryKpis(state(current), current);
  assert.equal(result.total, 6); assert.equal(result.activeTotal, 4); assert.equal(result.excludedTotal, 2); assert.equal(result.remaining, 3); assert.equal(result.percent, 25);
  for (const stage of modelInventoryStages) assert.equal(result.counts[stage], 1);
  assert.equal(sum(result.counts), result.total);
  assert.equal(result.specialties.reduce((sum, specialty) => sum + specialty.total, 0), result.activeTotal);
  for (const specialty of result.specialties) { assert.equal(sum(specialty.counts), specialty.total); assert.equal(specialty.counts.Archivado, 0); assert.equal(specialty.counts.Adjunto, 0); }
  assert.deepEqual(result.specialties.map(specialty => specialty.name), ['A', 'B', 'Sin clasificar']);
  assert.equal(result.specialties[0].percent, 50);
});

test('classification uses whole path segments and leaves ambiguous or missing workflows unclassified', () => {
  const paths = ['13_PUBLICADO', '3_PUBLICADO_old', 'Project/1_WIP/3_PUBLICADO', '', 'Project/.ATTACHMENT-copy', 'Project/4_ARCHIVADO-copy', 'Project/1_WIP/1_WIP', 'Project/constructor', 'Project/__proto__'];
  const current = snapshot(paths.map((path, index) => row(String(index), 'x.ifc', path)));
  const result = modelInventoryKpis(state(current), current);
  assert.equal(result.counts['Sin clasificar'], 8); assert.equal(result.counts['Pendiente de revision'], 1);
  assert.equal(result.activeTotal, 9); assert.equal(result.percent, 0);
});

test('scoped longest workflow rule overrides conventional segments; display labels never redefine completion', () => {
  const current = snapshot([row('1', 'x.ifc', 'Project/custom/deep'), row('2', 'x.ifc', 'Project/3_PUBLICADO'), row('3', 'x.ifc', 'Project/3_PUBLICADO/private'), row('4', 'x.ifc', 'Project/3_PUBLICADO_archive')]);
  const rules: FolderRule[] = [
    { id: 'r1', scope: current.scope, prefix: 'Project/custom', label: 'Arbitrary display label', color: '#112233', workflow: 'published' },
    { id: 'r2', scope: current.scope, prefix: 'Project/3_PUBLICADO', label: 'Not a status', color: '#223344' },
    { id: 'r3', scope: current.scope, prefix: 'Project/3_PUBLICADO/private', label: 'Still called Published', color: '#334455', workflow: 'unknown' },
    { id: 'foreign', scope: 'Different project', prefix: 'Project', label: 'Foreign', color: '#445566', workflow: 'archived' },
  ];
  const result = modelInventoryKpis(state(current, rules), current);
  assert.deepEqual(result.records.map(entry => entry.stage), ['Terminado', 'Terminado', 'Sin clasificar', 'Sin clasificar']);
  assert.equal(result.percent, 50);
  const renamed = rules.map(rule => ({ ...rule, label: 'Terminado' }));
  assert.deepEqual(modelInventoryKpis(state(current, renamed), current), result);
  const original = structuredClone(rules); modelInventoryKpis(state(current, rules), current); assert.deepEqual(rules, original);
});

test('workflow overrides classify shared, WIP, archive and attachment explicitly with normalized scoped prefixes', () => {
  const current = snapshot(['shared', 'wip', 'archive', 'attachment'].map((part, index) => row(String(index), 'x.ifc', `PROJECT\\${part}\\nested`)));
  const workflows = ['shared', 'wip', 'archived', 'attachment'] as const;
  const rules: FolderRule[] = workflows.map((workflow, index) => ({ id: `r${index}`, scope: current.scope, prefix: `project/${['shared', 'wip', 'archive', 'attachment'][index]}`, workflow, label: 'Display only', color: '#123456' }));
  assert.deepEqual(modelInventoryKpis(state(current, rules), current).records.map(entry => entry.stage), ['Trabajable con observaciones', 'Pendiente de revision', 'Archivado', 'Adjunto']);
});

test('zero selected models or only excluded files has a null denominator, never invented 100 percent', () => {
  for (const rows of [[], [row('1', 'a.pdf', '3_PUBLICADO')], [row('1', 'a.ifc', '4_ARCHIVADO'), row('2', 'a.ifc', '.ATTACHMENT')]]) {
    const current = snapshot(rows), result = modelInventoryKpis(state(current), current);
    assert.equal(result.percent, null); assert.equal(result.activeTotal, 0); assert.equal(result.remaining, 0); assert.deepEqual(result.specialties, []);
  }
});

test('a selected snapshot never combines scopes/history and never guesses revision or IDS status from filename or tags', () => {
  const current = snapshot([['same-id', 'vid-current', 'MODEL_F_IDS_OK.ifc', '1_WIP', '', '', '', 'F, approved, IDS passed']]);
  const other = snapshot([row('same-id', 'MODEL_F_IDS_OK.ifc', '3_PUBLICADO')], 'Other scope'); other.id = 'other';
  const history = snapshot([row('old-id', 'prior.ifc', '3_PUBLICADO')]); history.id = 'previous';
  const data = { ...state(current), snapshots: [other, history, current] };
  const before = structuredClone(data), result = modelInventoryKpis(data, current);
  assert.equal(result.total, 1); assert.equal(result.counts.Terminado, 0); assert.equal(result.records[0].record.revision, ''); assert.equal(result.records[0].record.status, '');
  assert.deepEqual(data, before);
});

function manual(): Register {
  const register = seedRegister();
  register.outgoingModels![0].targetRevision = 'F'; register.outgoingModels![0].plannedDate = '2000-02-01';
  register.outgoingModels![1].plannedDate = ''; register.outgoingModels![2].plannedDate = '2099-01-01';
  register.modelDeliveries![0].revision = 'E';
  register.modelDeliveries!.push({ ...register.modelDeliveries![0], id: 'synthetic-latest', revision: 'F', date: '2026-10-28', stage: undefined });
  return register;
}

test('manual latest available and latest sent are separate; an available target revision is not an implicit submission', () => {
  const register = manual(), before = structuredClone(register), result = manualModelKpis(register, '2026-10-28');
  const first = result.rows.find(row => row.id === 'model-1')!;
  assert.equal(first.availableRevision, 'F'); assert.equal(first.sentRevision, 'E'); assert.equal(first.targetRevision, 'F'); assert.equal(first.targetMatch, 'Distinta');
  assert.equal(first.availableStage, undefined); assert.equal(first.productionMode, 'Externa');
  assert.equal(result.rows.find(row => row.id === 'model-2')!.targetMatch, 'Sin envio');
  assert.equal(result.rows.find(row => row.id === 'model-2')!.availableStage, 'Producido');
  assert.equal(result.rows.find(row => row.id === 'model-3')!.availableRevision, '');
  assert.deepEqual(result.metrics, { total: 3, available: 2, sent: 1, unsent: 2, targetMatches: 0, targetDifferent: 1, overdue: 1, planned: 1, withoutDeadline: 1, unknownStage: 1 });
  assert.equal(sum(result.targetCounts), result.rows.length); assert.equal(sum(result.deadlineCounts), result.rows.length); assert.deepEqual(register, before);
});

test('manual target comparison uses equality with current target, not alphabetical ordering or historical target', () => {
  const register = manual(); register.outgoingModels![0].targetRevision = ' e ';
  assert.equal(manualModelKpis(register, '2026-10-28').rows[0].targetMatch, 'Coincide');
  register.outgoingModels![0].targetRevision = 'A';
  assert.equal(manualModelKpis(register, '2026-10-28').rows[0].targetMatch, 'Distinta');
  register.outgoingModels![0].targetRevision = 'ZZ';
  assert.equal(manualModelKpis(register, '2026-10-28').rows[0].targetMatch, 'Distinta');
});

test('manual pending deadline is independent of received revisions; same-day is planned and old delivery deadline is not a pending plan', () => {
  const register = manual(); register.outgoingModels![2].plannedDate = '2026-10-28';
  register.modelDeliveries![1].plannedDate = '2000-01-01'; register.modelDeliveries![1].date = '2000-01-10';
  const result = manualModelKpis(register, '2026-10-28');
  assert.deepEqual(result.rows.map(row => row.deadline), ['Vencido', 'Sin plazo', 'Previsto']);
  assert.throws(() => manualModelKpis(register, '2026-02-30'), /Fecha no valida/);
});

test('empty/legacy manual collections report zero, preserve unknown stages, and never count specialist documents as models', () => {
  const register = seedRegister(); delete register.outgoingModels; delete register.modelDeliveries; delete register.modelSubmissions;
  const result = manualModelKpis(register, '2026-10-28');
  assert.ok(register.documents.length > 0); assert.deepEqual(result.rows, []); assert.equal(sum(result.metrics), 0); assert.equal(sum(result.targetCounts), 0); assert.equal(sum(result.deadlineCounts), 0);
  assert.equal(modelInventoryKpis(emptyInventory(), snapshot([])).total, 0);
});
test('only confirmed structure aliases merge case/whitespace; source classification and paths stay immutable',async()=>{const {canonicalSpecialty}=await import('../src/project-kpi.ts');for(const s of ['EST',' est ','Estructura','ESTRUCTURAS'])assert.equal(canonicalSpecialty(s),'Estructuras');for(const s of ['Estacion','EST_OTRO','Estructural'])assert.equal(canonicalSpecialty(s),s);const snap=snapshot([row('1','one.ifc','1_WIP/sourceA',' EST '),row('2','two.ifc','2_COMPARTIDO/sourceB','Estructuras'),row('3','three.ifc','3_PUBLICADO/sourceC','Estructura')]);const before=JSON.stringify(snap);const result=modelInventoryKpis({...emptyInventory(),snapshots:[snap]},snap);assert.equal(result.specialties.length,1);assert.equal(result.specialties[0].total,3);assert.deepEqual(result.records.map(x=>x.record.specialty),[' EST ','Estructuras','Estructura']);assert.equal(JSON.stringify(snap),before);});
test('approved example confirmed alias combines769 IFC without changing total or raw fixture',async()=>{const {readFileSync}=await import('node:fs');const s=JSON.parse(readFileSync('src/data/cde-anonymized-demo.json','utf8'));const before=JSON.stringify(s),result=modelInventoryKpis(s,s.snapshots[0]);const structure=result.specialties.find(x=>x.name==='Estructuras')!;assert.equal(structure.total,769);assert.equal(structure.counts['Trabajable con observaciones'],168);assert.equal(structure.counts['Pendiente de revision'],601);assert.equal(structure.counts.Terminado,0);assert.equal(result.activeTotal,4038);assert.equal(JSON.stringify(s),before);});
