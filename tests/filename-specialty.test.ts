import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filenameSpecialty, obsoleteSpecialtyExample } from '../src/filename-specialty.ts';

// Generated strings only: no private names, paths, projects or identifiers.
const acceptedCodes = 'AAE ADC ADV ALC APO ARQ ASG AXO CTA DFL DGM ELE EST EXP ILU INF ITS MCS MFD MMR PAI PAV PDP PEB SAN SGV TEL TPG TUN'.split(' ');
const unknown = { code: '', specialty: 'Sin identificar' };

test('exact structured BIM filename token accepts only the 29 declared codes', () => {
  assert.equal(acceptedCodes.length, 29);
  for (const code of acceptedCodes) {
    const name = `SYN-BIM-001-${code}-EXAMPLE.ifc`;
    assert.deepEqual(filenameSpecialty(name), { code, specialty: code === 'EST' ? 'Estructuras' : code });
  }
});

test('case and surrounding filename whitespace do not change a valid token or rewrite the original string', () => {
  for (const name of ['syn-bim-001-est-example.ifc', '  SYN-BIM-001-EST-EXAMPLE.IFC  ', '\tSyn-BiM-abc-eSt-Example.ifc\n', ' SYN-BIM-001-san-EXAMPLE.isa ']) {
    const before = name;
    const parsed = filenameSpecialty(name);
    const expected = name.toUpperCase().includes('-EST-') ? { code: 'EST', specialty: 'Estructuras' } : { code: 'SAN', specialty: 'SAN' };
    assert.deepEqual(parsed, expected);
    assert.equal(name, before);
  }
});

test('generic filenames, folder hints and EST substrings are never a specialty fallback', () => {
  for (const name of [
    'modelo generico.ifc', 'EST.ifc', 'EST_model.ifc', 'estructura.ifc', 'Estructuras.ifc',
    'latest_EST_model.ifc', 'TEST_model.ifc', 'SYN-BIM-001-ESTACION-X.ifc',
    '/Project/Estructuras/EST/modelo generico.ifc', 'Project\\Estructuras\\EST\\modelo generico.ifc',
    '/Project/SYN-BIM-001-EST-FOLDER/modelo generico.ifc',
    'Project\\SYN-BIM-001-EST-FOLDER\\modelo generico.ifc',
  ]) assert.deepEqual(filenameSpecialty(name), unknown);
});

test('only the basename is parsed, not structured BIM tokens in parent folders', () => {
  assert.deepEqual(filenameSpecialty('SYN-BIM-001-EST-FOLDER/SYN-BIM-002-SAN-FILE.ifc'), { code: 'SAN', specialty: 'SAN' });
  assert.deepEqual(filenameSpecialty('SYN-BIM-001-EST-FOLDER\\SYN-BIM-002-ARQ-FILE.ifc'), { code: 'ARQ', specialty: 'ARQ' });
});

test('missing boundaries, unsupported codes, wrong token width and empty middle components remain unidentified', () => {
  for (const name of [
    '', ' ', 'BIM-001-EST-EXAMPLE.ifc', 'SYNBIM-001-EST-EXAMPLE.ifc', 'SYN-BIM-001-EST.ifc',
    'SYN-BIM--EST-EXAMPLE.ifc', 'SYN-BIM-001-XX-EXAMPLE.ifc', 'SYN-BIM-001-XYZ-EXAMPLE.ifc',
    'SYN-BIM-001-E-EXAMPLE.ifc', 'SYN-BIM-001-ESTAAA-EXAMPLE.ifc', 'SYN-BIM-001-EST1-EXAMPLE.ifc',
    'SYN-BIM-001-EST_EXAMPLE.ifc', 'SYN-BIM-001-EST.EXAMPLE.ifc', 'SYN-BIM-001-EST -EXAMPLE.ifc',
  ]) assert.deepEqual(filenameSpecialty(name), unknown);
});

test('multiple structured tokens are ambiguous even if they repeat the same code or contain an unsupported code', () => {
  for (const name of [
    'SYN-BIM-001-EST-A-BIM-002-SAN-B.ifc',
    'SYN-BIM-001-EST-A-BIM-002-EST-B.ifc',
    'SYN-BIM-001-EST-A-BIM-002-XYZ-B.ifc',
    'SYN-BIM-001-XYZ-A-BIM-002-EST-B.ifc',
    'SYN-bim-001-est-A-bim-002-san-B.ifc',
  ]) assert.deepEqual(filenameSpecialty(name), unknown);
});

test('file extension selection is separate from specialty parsing', () => {
  for (const suffix of ['.ifc', '.IFC', '.isa', '.pdf', '.ifc.zip', '']) {
    assert.deepEqual(filenameSpecialty(`SYN-BIM-001-EST-EXAMPLE${suffix}`), { code: 'EST', specialty: 'Estructuras' });
  }
});

test('obsolete example detector matches only the exact known legacy scope/file pair and never mutates old data', () => {
  const old = { scope: 'Proyecto demo anonimizado', fileName: 'Inventario_CDE_anonimizado.xlsx' };
  const before = structuredClone(old);
  assert.equal(obsoleteSpecialtyExample(old), true);
  for (const candidate of [
    { ...old, scope: 'Synthetic unrelated scope' },
    { ...old, fileName: 'Synthetic unrelated inventory.xlsx' },
    { ...old, scope: old.scope + ' actualizado' },
    { ...old, fileName: old.fileName + '.backup' },
    { ...old, scope: old.scope.toLowerCase() },
    { scope: '', fileName: '' },
  ]) assert.equal(obsoleteSpecialtyExample(candidate), false);
  assert.deepEqual(old, before);
});
