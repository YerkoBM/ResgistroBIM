/** Local-only, bounded inventory import. No URL, upload or spreadsheet execution API. */
export const INVENTORY_LIMITS = Object.freeze({
  fileBytes: 15 * 1024 * 1024,
  dataRows: 25_000,
  columns: 100,
  cellCharacters: 4_000,
  sheets: 50,
  zipEntries: 2_048,
  expandedBytes: 64 * 1024 * 1024,
  entryBytes: 32 * 1024 * 1024,
  expansionRatio: 200,
});
export interface InventorySheet { name: string; rows: string[][] }
export interface InventoryParseResult { sheets: InventorySheet[]; warnings: string[] }
export interface InventoryParseTask { promise: Promise<InventoryParseResult>; cancel: () => void }
export type WorkbookReader = (data: ArrayBuffer, options: { trim: boolean; parseNumber: (value: string) => string }) => Promise<{ sheet: string; data: unknown[][] }[]>;
export type InventoryWorkerRequest = { name: string; buffer: ArrayBuffer };
export type InventoryWorkerResponse = { result: InventoryParseResult } | { error: string };
let workerFactory: (() => Worker) | undefined;

/** Call once with Vite's static ?worker&inline constructor. This keeps standalone HTML offline. */
export function configureInventoryWorker(factory: () => Worker): void { workerFactory = factory; }
const fail = (message: string): never => { throw new Error(message); };
const aborted = () => Object.assign(new Error('Importación cancelada.'), { name: 'AbortError' });
const yieldThread = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function extension(name: string): 'csv' | 'xlsx' {
  if (/\.xlsx$/i.test(name)) return 'xlsx';
  if (/\.(csv|tsv)$/i.test(name)) return 'csv';
  return fail('Formato no compatible. Seleccione CSV, TSV o XLSX; no se admiten XLS, XLSM ni macros.');
}
function validateFile(name: string, size: number): 'csv' | 'xlsx' {
  const kind = extension(name);
  if (size === 0) fail('El archivo está vacío.');
  if (!Number.isSafeInteger(size) || size < 0 || size > INVENTORY_LIMITS.fileBytes) fail('El archivo supera el máximo de 15 MB.');
  return kind;
}
async function fileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo local.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Cancelling immediately rejects with AbortError and terminates any active worker. */
export function startParse(file: File): InventoryParseTask {
  let settled = false;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectTask!: (reason: unknown) => void;
  const cleanup = () => { worker?.terminate(); if (timer) clearTimeout(timer); };
  const promise = new Promise<InventoryParseResult>((resolve, reject) => {
    rejectTask = reject;
    const finish = (result?: InventoryParseResult, error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve(result!);
    };
    void (async () => {
      const kind = validateFile(file.name, file.size);
      const buffer = await fileBuffer(file);
      if (settled) return;
      if (workerFactory && typeof Worker !== 'undefined') {
        try { worker = workerFactory(); } catch { /* CSP/file-scheme may block workers. */ }
      }
      if (worker) {
        worker.onmessage = (event: MessageEvent<InventoryWorkerResponse>) => {
          const data = event.data;
          if ('error' in data) finish(undefined, new Error(data.error)); else finish(data.result);
        };
        worker.onerror = () => finish(undefined, new Error('No se pudo iniciar o completar el lector local. Pruebe CSV o un navegador con Web Workers habilitados.'));
        worker.onmessageerror = () => finish(undefined, new Error('No se pudo recibir el resultado de la importación.'));
        timer = setTimeout(() => finish(undefined, new Error('La lectura superó el tiempo de seguridad. Divida el inventario en archivos más pequeños.')), 60_000);
        worker.postMessage({ name: file.name, buffer } satisfies InventoryWorkerRequest, [buffer]);
      } else if (kind === 'csv') {
        const result = await parseInventoryBuffer(buffer, file.name, undefined, () => settled);
        finish(result);
      } else {
        fail('Este navegador no permite el lector XLSX en segundo plano. Habilite Web Workers o importe una copia CSV; no se procesará un XLSX bloqueando la interfaz.');
      }
    })().catch(error => finish(undefined, error));
  });
  return { promise, cancel: () => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectTask(aborted());
  } };
}

function decodeCsv(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
  catch { return fail('Codificación CSV no compatible. Guarde el archivo como CSV UTF-8 e inténtelo de nuevo.'); }
}

function detectDelimiter(text: string): ',' | ';' | '\t' {
  const delimiters = [',', ';', '\t'] as const;
  const records: number[][] = [];
  let counts = [0, 0, 0], quoted = false, hasContent = false;
  // A bounded sample of complete logical records, including quoted newlines.
  for (let i = 0; i < Math.min(text.length, 256_000) && records.length < 32; i++) {
    const char = text[i];
    if (char === '"') {
      hasContent = true;
      if (quoted && text[i + 1] === '"') i++; else quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (hasContent) records.push(counts);
      counts = [0, 0, 0]; hasContent = false;
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      if (!quoted) delimiters.forEach((delimiter, index) => { if (char === delimiter) counts[index]++; });
      if (char.trim()) hasContent = true;
    }
  }
  if (hasContent && !quoted) records.push(counts);
  const header = records[0] ?? counts;
  let best = 0, bestScore = -1;
  delimiters.forEach((_, index) => {
    const count = header[index];
    const score = count ? records.filter(record => record[index] === count).length * 1000 + Math.min(count, 100) : 0;
    if (score > bestScore) { best = index; bestScore = score; }
  });
  return delimiters[best];
}

/** RFC-style quoted cells, escaped quotes, embedded line breaks; values remain literal strings. */
export async function parseCsv(text: string, cancelled: () => boolean = () => false): Promise<string[][]> {
  text = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closedQuote = false, atStart = true;
  const pushCell = () => {
    if (cell.length > INVENTORY_LIMITS.cellCharacters) fail('Una celda supera los 4000 caracteres.');
    row.push(cell);
    if (row.length > INVENTORY_LIMITS.columns) fail('El archivo supera las 100 columnas.');
    cell = ''; atStart = true; closedQuote = false;
  };
  const pushRow = () => {
    pushCell(); rows.push(row); row = [];
    if (rows.length > INVENTORY_LIMITS.dataRows + 1) fail('El archivo supera las 25000 filas de datos (más encabezado).');
  };
  for (let i = 0; i < text.length; i++) {
    if (i % 65_536 === 0) { await yieldThread(); if (cancelled()) throw aborted(); }
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === delimiter) pushCell();
    else if (char === '\n' || char === '\r') { pushRow(); if (char === '\r' && text[i + 1] === '\n') i++; }
    else if (char === '"' && atStart) { quoted = true; atStart = false; }
    else {
      if (closedQuote || char === '"') fail('CSV no válido: comillas o separadores incorrectos.');
      cell += char; atStart = false;
    }
    if (cell.length > INVENTORY_LIMITS.cellCharacters) fail('Una celda supera los 4000 caracteres.');
  }
  if (cancelled()) throw aborted();
  if (quoted) fail('CSV no válido: una celda entre comillas no está cerrada.');
  if (cell || row.length || !atStart || closedQuote) pushRow();
  while (rows.length && rows.at(-1)!.every(value => value === '')) rows.pop();
  return rows;
}

interface ZipEntry { name: string; method: number; compressedSize: number; size: number; offset: number; crc: number }
/** Rejects ZIP64, encryption, split archives, conflicting headers, unsafe paths and expansion bombs. */
export function preflightXlsx(buffer: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), n = bytes.length;
  if (n < 22 || n > INVENTORY_LIMITS.fileBytes) fail('XLSX no válido o demasiado grande.');
  let end = -1;
  for (let pos = n - 22; pos >= Math.max(0, n - 65_557); pos--) {
    if (view.getUint32(pos, true) === 0x06054b50 && pos + 22 + view.getUint16(pos + 20, true) === n) { end = pos; break; }
  }
  if (end < 0) fail('XLSX no válido: falta el directorio ZIP.');
  const entryCount = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true), directoryStart = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== entryCount || entryCount === 65535 || directoryStart === 0xffffffff || directorySize === 0xffffffff) fail('No se admiten archivos ZIP divididos ni ZIP64.');
  if (!entryCount || entryCount > INVENTORY_LIMITS.zipEntries || directoryStart + directorySize !== end) fail('Directorio XLSX no válido o con demasiadas entradas.');
  let cursor = directoryStart, expanded = 0, compressed = 0;
  const entries: ZipEntry[] = [], names = new Set<string>(), ranges: [number, number][] = [];
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) fail('Directorio XLSX dañado.');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true);
    const nameSize = view.getUint16(cursor + 28, true), extraSize = view.getUint16(cursor + 30, true), commentSize = view.getUint16(cursor + 32, true), local = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (next > end || !nameSize || nameSize > 1024 || view.getUint16(cursor + 34, true) || local === 0xffffffff || size === 0xffffffff || compressedSize === 0xffffffff) fail('Entrada XLSX no válida.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize));
    if (name.includes('\\') || name.startsWith('/') || name.split('/').some(part => part === '..') || /[\u0000-\u001f]/.test(name) || names.has(name.toLowerCase())) fail('Rutas duplicadas o no válidas en el XLSX.');
    names.add(name.toLowerCase());
    if (/vbaproject|vbasignature|macrosheets|\.bin$/i.test(name)) fail('No se admiten libros con macros ni contenido binario incrustado. Exporte una copia XLSX sin macros o CSV.');
    if ((flags & 0x2041) || ![0, 8].includes(method)) fail('No se admiten archivos XLSX cifrados o con compresión no compatible.');
    if (size > INVENTORY_LIMITS.entryBytes || (size > 1_000_000 && size / Math.max(1, compressedSize) > INVENTORY_LIMITS.expansionRatio) || (method === 0 && size !== compressedSize)) fail('El XLSX supera los límites de descompresión segura.');
    expanded += size; compressed += compressedSize;
    if (expanded > INVENTORY_LIMITS.expandedBytes) fail('El XLSX supera el máximo de 64 MB descomprimidos.');
    if (local + 30 > directoryStart || view.getUint32(local, true) !== 0x04034b50) fail('Cabecera local XLSX dañada.');
    const localNameSize = view.getUint16(local + 26, true), localExtraSize = view.getUint16(local + 28, true), offset = local + 30 + localNameSize + localExtraSize;
    if (view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || localNameSize !== nameSize || offset + compressedSize > directoryStart) fail('Cabeceras XLSX incompatibles.');
    for (let i = 0; i < nameSize; i++) if (bytes[local + 30 + i] !== bytes[cursor + 46 + i]) fail('Rutas XLSX incompatibles.');
    if (!(flags & 8) && (view.getUint32(local + 14, true) !== crc || view.getUint32(local + 18, true) !== compressedSize || view.getUint32(local + 22, true) !== size)) fail('Tamaños XLSX incompatibles.');
    ranges.push([local, offset + compressedSize]);
    entries.push({ name, method, compressedSize, size, offset, crc }); cursor = next;
  }
  if (cursor !== end || (expanded > 1_000_000 && expanded / Math.max(1, compressed) > INVENTORY_LIMITS.expansionRatio)) fail('El directorio o la expansión del XLSX no es seguro.');
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1][1])) fail('Entradas XLSX superpuestas.');
  if (!names.has('[content_types].xml') || !names.has('xl/workbook.xml') || !names.has('xl/_rels/workbook.xml.rels')) fail('El archivo ZIP no contiene un libro XLSX compatible.');
  return entries;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
async function boundedEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const bytes = new Uint8Array(buffer, entry.offset, entry.compressedSize);
  if (entry.method === 0) {
    if (crc32(bytes) !== entry.crc) fail('XLSX dañado: comprobación de integridad incorrecta.');
    return bytes;
  }
  if (typeof DecompressionStream === 'undefined') fail('El navegador no permite verificar la descompresión segura de XLSX. Actualícelo o importe CSV.');
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const output = new Uint8Array(entry.size);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.length > entry.size) { await reader.cancel(); fail('El XLSX declara un tamaño falso de descompresión.'); }
      output.set(value, length); length += value.length;
    }
  } finally { reader.releaseLock(); }
  if (length !== entry.size || crc32(output) !== entry.crc) fail('XLSX dañado: tamaño o integridad incorrectos.');
  return output;
}
function validateCellReference(reference: string): number {
  let maxRow = 0;
  for (const cell of reference.split(':')) {
    const match = /^\$?([A-Z]{1,4})\$?([1-9]\d*)$/i.exec(cell);
    if (!match) fail('El XLSX contiene referencias de celdas no compatibles.');
    let column = 0;
    for (const char of match![1].toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64;
    const row = Number(match![2]);
    if (column > INVENTORY_LIMITS.columns || row > INVENTORY_LIMITS.dataRows + 1) fail('El XLSX supera las 25000 filas o 100 columnas, incluso en celdas vacías o dispersas.');
    maxRow = Math.max(maxRow, row);
  }
  return maxRow;
}
function inspectXml(xml: string): { formulas: boolean; rows: number; sheets: number } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('El XLSX contiene declaraciones XML no permitidas.');
  if (/macroEnabled|vbaProject/i.test(xml)) fail('No se admiten macros. Exporte una copia XLSX sin macros o CSV.');
  let rows = 0, maxRow = 0, cells = 0, sheets = 0;
  // Check actual rows/cells as well as ranges before the library allocates any sparse arrays.
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?(row|c|dimension|mergeCell|sheet)\b([^>]*)>/g)) {
    const [, tag, attributes] = match;
    if (tag === 'sheet' && ++sheets > INVENTORY_LIMITS.sheets) fail('El libro supera las 50 hojas.');
    if (tag === 'row') { rows++; cells = 0; }
    if (tag === 'c' && ++cells > INVENTORY_LIMITS.columns) fail('El XLSX supera las 100 columnas.');
    for (const attribute of attributes.matchAll(/(?:^|\s)(r|ref)\s*=\s*(["'])([\s\S]*?)\2/g)) {
      const reference = attribute[3].replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)));
      if (tag === 'row') {
        if (!/^[1-9]\d*$/.test(reference)) fail('El XLSX contiene un número de fila no válido.');
        maxRow = Math.max(maxRow, Number(reference));
      } else if (tag !== 'sheet') maxRow = Math.max(maxRow, validateCellReference(reference));
    }
    if (Math.max(rows, maxRow) > INVENTORY_LIMITS.dataRows + 1) fail('El XLSX supera las 25000 filas de datos.');
  }
  return { formulas: /<(?:[\w.-]+:)?f(?:\s|>)/.test(xml), rows: Math.max(rows, maxRow), sheets };
}

function xmlText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#x[\da-f]+|#\d+);/gi, (_, entity: string) => {
    if (entity[0] === '#') return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity];
  });
}
function xmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = Object.create(null);
  for (const match of source.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) attributes[match[1]] = xmlText(match[3]);
  return attributes;
}
function rawDateCells(xml: string): Map<string, string> {
  const dates = new Map<string, string>();
  for (const cell of xml.matchAll(/<(?:[\w.-]+:)?c\b([^>]*)>/g)) {
    const attributes = xmlAttributes(cell[1]);
    if (attributes.t !== 'd' || /\/\s*$/.test(cell[1])) continue;
    const endTag = /<\/(?:[\w.-]+:)?c\s*>/g;
    endTag.lastIndex = cell.index! + cell[0].length;
    const end = endTag.exec(xml);
    if (!end) fail('Una fecha ISO del XLSX tiene XML incompleto.');
    const body = xml.slice(cell.index! + cell[0].length, end!.index);
    const value = /<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v\s*>/.exec(body);
    if (!value) continue;
    const reference = /^\$?([A-Z]+)\$?(\d+)$/i.exec(attributes.r ?? '');
    if (!reference) fail('Una fecha ISO del XLSX no tiene una referencia de celda válida.');
    let column = 0;
    for (const char of reference![1].toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64;
    const text = xmlText(value[1]);
    if (text.length > INVENTORY_LIMITS.cellCharacters) fail('Una celda supera los 4000 caracteres.');
    dates.set(`${Number(reference![2])}:${column}`, text);
  }
  return dates;
}
function rawDateSheets(workbookXml: string, relationshipsXml: string, datesByPath: Map<string, Map<string, string>>): Map<string, Map<string, string>> {
  const paths = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)>/g)) {
    const attributes = xmlAttributes(match[1]);
    if (attributes.TargetMode === 'External' || !attributes.Type?.endsWith('/worksheet') || !attributes.Target || !attributes.Id) continue;
    const path: string[] = [];
    for (const part of (attributes.Target.startsWith('/') ? attributes.Target.slice(1) : `xl/${attributes.Target}`).split('/')) {
      if (part === '..') path.pop(); else if (part && part !== '.') path.push(part);
    }
    paths.set(attributes.Id, path.join('/'));
  }
  const result = new Map<string, Map<string, string>>();
  const matchedPaths = new Set<string>();
  for (const match of workbookXml.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)>/g)) {
    const attributes = xmlAttributes(match[1]);
    const relationship = Object.entries(attributes).find(([name]) => name.endsWith(':id'))?.[1];
    const path = paths.get(relationship ?? '') ?? '';
    const dates = datesByPath.get(path);
    if (dates) { result.set(attributes.name, dates); matchedPaths.add(path); }
  }
  if (matchedPaths.size !== datesByPath.size) fail('No se pudo asociar una fecha ISO a su hoja sin alterar su zona horaria. Guarde una nueva copia XLSX o CSV.');
  return result;
}

/** For worker use and direct tests. XLSX reader is injected to select the library's correct platform entry point. */
export async function parseInventoryBuffer(buffer: ArrayBuffer, name: string, readWorkbook?: WorkbookReader, cancelled: () => boolean = () => false): Promise<InventoryParseResult> {
  const kind = validateFile(name, buffer.byteLength);
  if (kind === 'csv') {
    const rows = await parseCsv(decodeCsv(buffer), cancelled);
    if (!rows.length) fail('El archivo no contiene filas.');
    return { sheets: [{ name: name.replace(/\.(csv|tsv)$/i, ''), rows }], warnings: [] };
  }
  if (!readWorkbook) fail('El lector XLSX en segundo plano no está disponible.');
  const entries = preflightXlsx(buffer);
  let formulas = false, preflightDataRows = 0, workbookXml = '', relationshipsXml = '';
  const datesByPath = new Map<string, Map<string, string>>();
  for (const entry of entries) {
    if (cancelled()) throw aborted();
    const bytes = await boundedEntry(buffer, entry);
    if (/\.(xml|rels)$/i.test(entry.name)) {
      const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const metadata = inspectXml(xml);
      if (entry.name === 'xl/workbook.xml') workbookXml = xml;
      if (entry.name === 'xl/_rels/workbook.xml.rels') relationshipsXml = xml;
      const dates = rawDateCells(xml);
      if (dates.size) datesByPath.set(entry.name, dates);
      formulas = metadata.formulas || formulas;
      preflightDataRows += Math.max(0, metadata.rows - 1);
      if (preflightDataRows > INVENTORY_LIMITS.dataRows) fail('El libro supera las 25000 filas de datos entre todas las hojas.');
    }
  }
  if (cancelled()) throw aborted();
  let workbook: Awaited<ReturnType<WorkbookReader>>;
  try { workbook = await readWorkbook!(buffer, { trim: false, parseNumber: value => value }); }
  catch { return fail('No se pudo interpretar el XLSX. Puede estar dañado o contener estructuras no compatibles; guarde una nueva copia XLSX o CSV.'); }
  if (!workbook.length || workbook.length > INVENTORY_LIMITS.sheets) fail('El libro debe contener entre 1 y 50 hojas.');
  if (new Set(workbook.map(sheet => sheet.sheet)).size !== workbook.length || workbook.some(sheet => !sheet.sheet || sheet.sheet.length > 128)) fail('El XLSX contiene nombres de hojas duplicados o no válidos.');
  const dateSheets = rawDateSheets(workbookXml, relationshipsXml, datesByPath);
  let totalDataRows = 0, hasDates = false, hasRawDates = false;
  const sheets = workbook.map(sheet => {
    if (sheet.data.length > INVENTORY_LIMITS.dataRows + 1) fail('El XLSX supera las 25000 filas de datos.');
    const rawDates = dateSheets.get(sheet.sheet);
    const rows = Array.from(sheet.data, (row, rowIndex) => {
      if (!Array.isArray(row) || row.length > INVENTORY_LIMITS.columns) fail('El XLSX supera las 100 columnas.');
      return Array.from(row, (value, columnIndex) => {
        let text: string;
        const rawDate = rawDates?.get(`${rowIndex + 1}:${columnIndex + 1}`);
        if (rawDate !== undefined) {
          text = rawDate; hasRawDates = true;
          if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) hasDates = true;
        } else if (value instanceof Date) {
          if (!Number.isFinite(value.getTime())) return fail('El XLSX contiene una fecha no válida.');
          // Excel dates have no timezone. The reader encodes wall-time components in UTC;
          // removing Z preserves those components without claiming an actual UTC instant.
          text = value.toISOString().slice(0, -1); hasDates = true;
        } else text = value === null || value === undefined ? '' : String(value);
        if (text.length > INVENTORY_LIMITS.cellCharacters) fail('Una celda supera los 4000 caracteres.');
        return text;
      });
    });
    totalDataRows += Math.max(0, rows.length - 1);
    if (totalDataRows > INVENTORY_LIMITS.dataRows) fail('El libro supera las 25000 filas de datos entre todas las hojas.');
    return { name: sheet.sheet, rows };
  });
  const warnings: string[] = [];
  if (hasDates) warnings.push('Fechas Excel: zona horaria no indicada. Se conservan sus componentes de fecha y hora sin convertirlos a otra zona.');
  if (hasRawDates) warnings.push('Fechas ISO del XLSX: se conserva el texto original, incluida su zona horaria cuando está indicada.');
  if (formulas) warnings.push('Las fórmulas XLSX no se ejecutan. Se importan solo sus resultados guardados; una fórmula sin resultado guardado puede aparecer vacía.');
  return { sheets, warnings };
}
