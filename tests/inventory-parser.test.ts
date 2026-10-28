import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import readWorkbook from 'read-excel-file/node';
import { INVENTORY_LIMITS, parseCsv, parseInventoryBuffer, preflightXlsx, startParse, configureInventoryWorker } from '../src/inventory-parser.ts';
import type { WorkbookReader } from '../src/inventory-parser.ts';

// All input is synthetic and generated in memory. No real exports or filenames.
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files: Record<string, string>, compressed = true): ArrayBuffer {
  const locals: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content), payload = compressed ? deflateRawSync(raw) : raw;
    const path = Buffer.from(name), crc = crc32(raw), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(compressed ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(path.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(compressed ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(payload.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(path.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, path, payload); directory.push(central, path); offset += local.length + path.length + payload.length;
  }
  const end = Buffer.alloc(22), cd = Buffer.concat(directory);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...locals, cd, end]);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function workbookFiles(sheets: string[] = ['<row r="1"><c r="A1" t="inlineStr"><is><t>File</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>synthetic.isa</t></is></c></row>']): Record<string, string> {
  const files: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((_, index) => `<sheet name="Inventario ${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<styleSheet xmlns="${ns}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="22"/></cellXfs></styleSheet>`,
  };
  sheets.forEach((content, index) => {
    let rowIndex = 0;
    content = content.replace(/<row([^>]*)>([\s\S]*?)<\/row>/g, (_, attributes: string, cells: string) => {
      rowIndex++;
      const row = /\br="(.*?)"/.exec(attributes)?.[1] ?? String(rowIndex);
      if (!/\br=/.test(attributes)) attributes += ` r="${row}"`;
      let column = 0;
      cells = cells.replace(/<c([^>]*)>/g, (_, attributes: string) => {
        column++;
        if (!/\br=/.test(attributes)) attributes += ` r="${String.fromCharCode(64 + column)}${row}"`;
        return `<c${attributes}>`;
      });
      return `<row${attributes}>${cells}</row>`;
    });
    files[`xl/worksheets/sheet${index + 1}.xml`] = `<worksheet xmlns="${ns}"><sheetData>${content}</sheetData></worksheet>`; });
  return files;
}
const reader: WorkbookReader = (buffer, options) => readWorkbook(new Blob([buffer]), options);
const parseXlsx = (files = workbookFiles(), compressed = true) => parseInventoryBuffer(zip(files, compressed), 'synthetic.xlsx', reader);
const encoded = (value: string) => new TextEncoder().encode(value).buffer;

test('CSV: BOM, semicolon detection, quoted delimiter/newline, escaped quote and literal formula', async () => {
  const result = await parseCsv('\uFEFFNombre;VID;Nota\r\n"modelo; genérico.isa";0000123;"línea 1\n""línea 2"""\r\n=SUM(A1:A2);90071992547409931234;@literal\r\n');
  assert.deepEqual(result, [['Nombre', 'VID', 'Nota'], ['modelo; genérico.isa', '0000123', 'línea 1\n"línea 2"'], ['=SUM(A1:A2)', '90071992547409931234', '@literal']]);
});
test('CSV: comma/tab detection, empty fields/rows, spaces, CR and quoted CRLF preserved', async () => {
  assert.deepEqual(await parseCsv('A,B,C\r1,, 2 \r\r"one\r\ntwo",x,'), [['A', 'B', 'C'], ['1', '', ' 2 '], [''], ['one\r\ntwo', 'x', '']]);
  assert.deepEqual(await parseCsv('A\tB\n1,2\tx;y\n'), [['A', 'B'], ['1,2', 'x;y']]);
  assert.deepEqual(await parseCsv('A;B\n1,25;2,35\n'), [['A', 'B'], ['1,25', '2,35']]);
});
test('CSV: malformed quotes are rejected instead of silently reinterpreted', async () => {
  for (const value of ['A,B\n"unclosed,x', 'A,B\n"x"tail,y', 'A,B\nx"y,z']) await assert.rejects(parseCsv(value), /CSV no válido/);
});
test('CSV: UTF-16 BOM supported; invalid UTF-8 rejected with conversion guidance', async () => {
  const value = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Archivo;VID\nmodelo.isa;001', 'utf16le')]);
  const result = await parseInventoryBuffer(value.buffer.slice(value.byteOffset, value.byteOffset + value.length), 'synthetic.csv');
  assert.equal(result.sheets[0].rows[1][1], '001');
  await assert.rejects(parseInventoryBuffer(Uint8Array.from([0xc3, 0x28]).buffer, 'invalid.csv'), /UTF-8/);
});
test('CSV boundaries: 25000 data rows, 100 columns, 4000 characters; excess rejected', async () => {
  const rows = await parseCsv('Header\n' + 'row\n'.repeat(25_000));
  assert.equal(rows.length, 25_001);
  assert.equal((await parseCsv(Array(100).fill('h').join(',') + '\n' + 'a'.repeat(4000)))[1][0].length, 4000);
  await assert.rejects(parseCsv('h\n' + 'row\n'.repeat(25_001)), /25000/);
  await assert.rejects(parseCsv(Array(101).fill('h').join(',')), /100 columnas/);
  await assert.rejects(parseCsv('h\n' + 'x'.repeat(4001)), /4000/);
});
test('file formats, empty file and 15 MB input bounds are enforced', async () => {
  for (const name of ['file.xls', 'file.xlsm', 'file.zip', 'file.pdf']) await assert.rejects(parseInventoryBuffer(encoded('data'), name), /Formato no compatible/);
  await assert.rejects(parseInventoryBuffer(new ArrayBuffer(0), 'empty.csv'), /vacío/);
  await assert.rejects(parseInventoryBuffer(new ArrayBuffer(INVENTORY_LIMITS.fileBytes + 1), 'big.xlsx', reader), /15 MB/);
});
test('actual XLSX compressed and stored ZIPs parse multi-sheet string values', async () => {
  for (const compressed of [false, true]) {
    const result = await parseXlsx(workbookFiles(['<row><c t="inlineStr"><is><t>  untouched text  </t></is></c></row>', '<row><c t="inlineStr"><is><t>Second</t></is></c></row>']), compressed);
    assert.deepEqual(result.sheets, [{ name: 'Inventario 1', rows: [['  untouched text  ']] }, { name: 'Inventario 2', rows: [['Second']] }]);
  }
});
test('XLSX: numeric ID lexical precision, leading-zero string ID, dates without invented timezone, cached formula', async () => {
  const previousTZ = process.env.TZ; process.env.TZ = 'America/Santiago';
  try {
    const dateSerial = (Date.UTC(2026, 9, 28, 15, 42, 0) - Date.UTC(1899, 11, 30)) / 86400000;
    const result = await parseXlsx(workbookFiles([`<row r="1"><c r="A1" t="inlineStr"><is><t>Header</t></is></c></row><row r="2"><c r="A2"><v>90071992547409931234</v></c><c r="B2" t="inlineStr"><is><t>000123</t></is></c><c r="C2" s="1"><v>${dateSerial}</v></c><c r="D2"><f>1+1</f><v>2</v></c></row>`]));
    assert.deepEqual(result.sheets[0].rows[1], ['90071992547409931234', '000123', '2026-10-28T15:42:00.000', '2']);
    assert.ok(result.warnings.some(value => /zona horaria no indicada/.test(value)));
    assert.ok(result.warnings.some(value => /no se ejecutan/.test(value)));
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});
test('XLSX: ISO date cells preserve timezone-unspecified walltime and explicit offsets verbatim', async () => {
  const previousTZ = process.env.TZ; process.env.TZ = 'America/Santiago';
  try {
    const files = workbookFiles(['<row><c t="d"><v>2026-10-28T15:42:00</v></c><c t="d"><v>2026-10-28T15:42:00-03:00</v></c><c t="d"><v>2026-10-28T15:42:00Z</v></c></row>', '<row><c t="d"><v>2026-10-29T11:30:00</v></c></row>']);
    // Nonstandard member paths and reversed archive ordering must not swap date overrides.
    files['xl/worksheets/custom.xml'] = files['xl/worksheets/sheet1.xml']; delete files['xl/worksheets/sheet1.xml'];
    files['xl/_rels/workbook.xml.rels'] = files['xl/_rels/workbook.xml.rels'].replace('worksheets/sheet1.xml', '/xl/worksheets/custom.xml');
    const result = await parseXlsx(files);
    assert.deepEqual(result.sheets[0].rows[0], ['2026-10-28T15:42:00', '2026-10-28T15:42:00-03:00', '2026-10-28T15:42:00Z']);
    assert.equal(result.sheets[1].rows[0][0], '2026-10-29T11:30:00');
    assert.ok(result.warnings.some(value => /texto original/.test(value)));
    const emptyFirst = await parseXlsx(workbookFiles(['<row r="1"><c r="A1" t="d"/><c r="B1" t="d"><v>2026-10-28T15:42:00</v></c></row>']));
    assert.deepEqual(emptyFirst.sheets[0].rows[0], ['', '2026-10-28T15:42:00']);
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});
test('XLSX: formula without cached value remains empty, external targets never requested', async () => {
  const files = workbookFiles(['<row><c t="inlineStr"><is><t>Header</t></is></c></row><row><c><f>HYPERLINK("https://not-requested.invalid", "x")</f></c><c t="inlineStr"><is><t>literal</t></is></c></row>']);
  files['xl/_rels/worksheets/sheet1.xml.rels'] = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="external" Type="hyperlink" Target="https://not-requested.invalid" TargetMode="External"/></Relationships>';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network must never be used'); };
  try { assert.deepEqual((await parseXlsx(files)).sheets[0].rows[1], ['', 'literal']); } finally { globalThis.fetch = oldFetch; }
});
test('XLSX: malformed ZIP, ZIP64/encryption, false sizes, CRC and expansion bombs rejected', async () => {
  assert.throws(() => preflightXlsx(encoded('not a zip')), /XLSX/);
  const good = zip(workbookFiles());
  assert.throws(() => preflightXlsx(good.slice(0, -10)), /directorio ZIP/);
  for (const [field, value] of [[4, 1], [10, 65535]]) {
    const copy = good.slice(0), view = new DataView(copy); view.setUint16(copy.byteLength - 22 + field, value, true);
    assert.throws(() => preflightXlsx(copy), /ZIP64|divididos/);
  }
  const encrypted = good.slice(0), ev = new DataView(encrypted), cd = ev.getUint32(encrypted.byteLength - 6, true);
  ev.setUint16(cd + 8, 1, true); assert.throws(() => preflightXlsx(encrypted), /cifrados/);
  const falseSize = good.slice(0), fv = new DataView(falseSize); fv.setUint32(cd + 24, 1, true); fv.setUint32(22, 1, true);
  await assert.rejects(parseInventoryBuffer(falseSize, 'bad.xlsx', reader), /tamaño falso/);
  const badCrc = good.slice(0), cv = new DataView(badCrc); cv.setUint32(cd + 16, 0, true); cv.setUint32(14, 0, true);
  await assert.rejects(parseInventoryBuffer(badCrc, 'bad.xlsx', reader), /integridad/);
  assert.throws(() => preflightXlsx(zip({ ...workbookFiles(), 'big.xml': 'x'.repeat(1_100_000) })), /descompresión segura/);
});
test('XLSX: macros, unsafe paths, XML entities and sparse oversized dimensions fail before library parsing', async () => {
  let readerCalled = false;
  const forbiddenReader: WorkbookReader = async () => { readerCalled = true; return []; };
  const cases = [
    { ...workbookFiles(), 'xl/vbaProject.bin': 'fake' },
    { ...workbookFiles(), '../unsafe.xml': '<x/>' },
    { ...workbookFiles(), 'extra.xml': '<!DOCTYPE foo [<!ENTITY x "abc">]><foo>&x;</foo>' },
    workbookFiles(['<row r="999999999"><c r="A999999999"><v>1</v></c></row>']),
    workbookFiles(['<row r="1"><c r="CW1"><v>1</v></c></row>']),
    workbookFiles(['<row r="1"><c r="A&#57;99999999"><v>1</v></c></row>']),
    workbookFiles(['<row><c><v>1</v></c></row>'.repeat(25_002)]),
  ];
  for (const files of cases) await assert.rejects(parseInventoryBuffer(zip(files), 'bad.xlsx', forbiddenReader));
  assert.equal(readerCalled, false);
});
test('XLSX: cell length and workbook aggregate row limits are checked', async () => {
  await assert.rejects(parseXlsx(workbookFiles([`<row><c t="inlineStr"><is><t>${'x'.repeat(4001)}</t></is></c></row>`])), /4000/);
  await assert.rejects(parseXlsx(workbookFiles(['<row r="13001"><c r="A13001"><v>1</v></c></row>', '<row r="13001"><c r="A13001"><v>1</v></c></row>'])), /entre todas las hojas/);
});
test('synthetic 12000-row XLSX: every row preserved, bounded runtime measured', async t => {
  const content = ['<row r="1"><c r="A1" t="inlineStr"><is><t>VID</t></is></c><c r="B1" t="inlineStr"><is><t>Archivo</t></is></c></row>'];
  for (let i = 1; i <= 12_000; i++) content.push(`<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>VID-${String(i).padStart(6, '0')}</t></is></c><c r="B${i + 1}" t="inlineStr"><is><t>synthetic_${i % 17}.isa</t></is></c><c r="C${i + 1}"><v>${i}</v></c></row>`);
  const buffer = zip(workbookFiles([content.join('')]));
  const start = performance.now(), result = await parseInventoryBuffer(buffer, 'synthetic-12000.xlsx', reader), elapsed = performance.now() - start;
  assert.equal(result.sheets[0].rows.length, 12_001);
  assert.equal(result.sheets[0].rows[12_000][0], 'VID-012000');
  assert.ok(elapsed < 20_000, `12k parse took ${elapsed} ms`);
  t.diagnostic(`Synthetic 12000 rows: ${Math.round(elapsed)} ms, ${buffer.byteLength} compressed bytes; browser worker responsiveness requires browser QA.`);
});
test('client: CSV fallback yields and cancels, unsupported XLSX does not block main thread', async () => {
  const job = startParse(new File(['Header\n' + 'data\n'.repeat(12_000)], 'synthetic.csv'));
  job.cancel(); await assert.rejects(job.promise, { name: 'AbortError' }); job.cancel();
  let ticks = 0;
  const timer = setInterval(() => ticks++, 0);
  const result = await startParse(new File(['H\n' + 'synthetic-row\n'.repeat(12_000)], 'synthetic.csv')).promise;
  clearInterval(timer);
  assert.equal(result.sheets[0].rows.length, 12_001); assert.ok(ticks > 0);
  await assert.rejects(startParse(new File([zip(workbookFiles())], 'synthetic.xlsx')).promise, /segundo plano/);
});
test('client: worker cancel terminates and ignores stale messages; success cleans up worker', async () => {
  const previous = globalThis.Worker;
  let instance: MockWorker;
  class MockWorker {
    terminated = false;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror = null; onmessageerror = null;
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = MockWorker as unknown as typeof Worker;
  configureInventoryWorker(() => { instance = new MockWorker(); return instance as unknown as Worker; });
  try {
    const first = startParse(new File(['H\nx'], 'first.csv'));
    await new Promise(resolve => setTimeout(resolve, 1));
    first.cancel(); assert.equal(instance!.terminated, true);
    instance!.onmessage!({ data: { result: { sheets: [], warnings: [] } } });
    await assert.rejects(first.promise, { name: 'AbortError' });
    const second = startParse(new File(['H\ny'], 'second.csv'));
    await new Promise(resolve => setTimeout(resolve, 1));
    instance!.onmessage!({ data: { result: { sheets: [{ name: 'second', rows: [['H'], ['y']] }], warnings: [] } } });
    assert.equal((await second.promise).sheets[0].rows[1][0], 'y'); assert.equal(instance!.terminated, true);
  } finally { if (previous === undefined) delete (globalThis as Record<string, unknown>).Worker; else globalThis.Worker = previous; }
});
