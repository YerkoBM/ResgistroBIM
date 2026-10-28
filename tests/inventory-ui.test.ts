import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { seedRegister } from '../src/document-register.ts';
import { addInventoryLink, addSnapshot, defaultMapping, emptyInventory, syntheticInventory } from '../src/inventory-domain.ts';
import type { InventoryState } from '../src/inventory-domain.ts';

// Generated/synthetic records plus the app's explicitly approved anonymized example.
// No private input files. Tests execute the built app in jsdom, not a browser.
const bundle = readFileSync('dist/assets/' + readdirSync('dist/assets').find(file => file.endsWith('.js')), 'utf8');
const pause = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean, description: string) {
  const deadline = Date.now() + 2500;
  while (!condition() && Date.now() < deadline) await pause();
  assert.ok(condition(), description);
}
async function db(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open('registro-cde-local-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('inventory');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function preload(factory: IDBFactory, state: InventoryState) {
  const database = await db(factory);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('inventory', 'readwrite');
    transaction.objectStore('inventory').put(state, 'state');
    transaction.objectStore('inventory').put(0, 'revision');
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
async function stored(factory: IDBFactory): Promise<InventoryState | undefined> {
  const database = await db(factory);
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('inventory', 'readonly').objectStore('inventory').get('state');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}
async function setup(options: { inventory?: InventoryState; factory?: IDBFactory; persistent?: boolean; register?: ReturnType<typeof seedRegister> } = {}) {
  const errors: unknown[] = [], network: string[] = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error));
  const factory = options.factory ?? new IDBFactory();
  if (options.inventory) await preload(factory, options.inventory);
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://demo.invalid/ResgistroBIM/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  if (options.persistent !== false) Object.defineProperty(dom.window, 'indexedDB', { value: factory });
  Object.assign(dom.window, { TextDecoder, TextEncoder, structuredClone });
  dom.window.fetch = async (url: unknown) => { network.push(String(url)); throw new Error('Unexpected network request'); };
  dom.window.localStorage.setItem('registro-documental-demo-v2', JSON.stringify(options.register ?? seedRegister()));
  dom.window.eval(bundle);
  await until(() => !!dom.window.document.querySelector('nav[aria-label="Registros"]'), 'Register navigation rendered');
  return { dom, doc: dom.window.document, errors, network, factory };
}
function button(dom: JSDOM, text: string, root: ParentNode = dom.window.document): HTMLButtonElement {
  const element = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent?.trim() === text);
  assert.ok(element, `Missing button: ${text}`); return element;
}
function click(dom: JSDOM, text: string, root?: ParentNode) { button(dom, text, root).click(); }
function set(dom: JSDOM, selector: string, value: string, root: ParentNode = dom.window.document) {
  const element = root.querySelector<HTMLInputElement | HTMLSelectElement>(selector); assert.ok(element, selector);
  const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
function submit(dom: JSDOM, selector: string) {
  const form = dom.window.document.querySelector(selector); assert.ok(form, selector);
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}
async function openInventory(dom: JSDOM) {
  click(dom, 'Seguimiento CDE');
  await until(() => !!dom.window.document.querySelector('table[aria-label="Inventario CDE"]'), 'Inventory loaded');
}
const tableRows = (dom: JSDOM) => Array.from(dom.window.document.querySelectorAll<HTMLTableRowElement>('table[aria-label="Inventario CDE"] tbody tr'));
function rowFor(dom: JSDOM, id: string) {
  const row = tableRows(dom).find(row => row.querySelector('.id-small')?.textContent === id);
  assert.ok(row, `Missing file row ${id}`); return row;
}
function chart(dom: JSDOM, title: string) {
  const section = Array.from(dom.window.document.querySelectorAll<HTMLElement>('.inventory-chart')).find(node => node.querySelector('h3')?.textContent === title);
  assert.ok(section, `Missing chart: ${title}`); return section;
}
function bar(dom: JSDOM, title: string, value: string) {
  const node = Array.from(chart(dom, title).querySelectorAll<HTMLButtonElement>('.chart-bar')).find(node => node.title === value);
  assert.ok(node, `Missing bar: ${title} / ${value}`); return node;
}
function chartTotal(dom: JSDOM, title: string) {
  return Array.from(chart(dom, title).querySelectorAll('button b')).reduce((sum, value) => sum + Number(value.textContent!.replace(/\./g, '')), 0);
}
async function chooseFile(dom: JSDOM, file: File) {
  const input = dom.window.document.querySelector<HTMLInputElement>('input[type="file"]'); assert.ok(input);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await pause();
}
async function preview(dom: JSDOM, content: string, name = 'synthetic.csv') {
  await chooseFile(dom, new dom.window.File([content], name, { type: 'text/csv' }));
  await until(() => !!dom.window.document.querySelector('.import-panel'), 'CSV preview rendered');
}

test('CDE is a distinct third register; synthetic demo, chart filters and session warning stay explicit', async () => {
  const { dom, doc, errors, network } = await setup({ persistent: false });
  try {
    assert.deepEqual(Array.from(doc.querySelectorAll('nav[aria-label="Registros"] button')).map(node => node.textContent), ['Documentos de especialistas', 'Modelos y entregas', 'Seguimiento CDE']);
    await openInventory(dom);
    assert.equal(doc.querySelector('h1')?.textContent, 'Seguimiento CDE');
    assert.match(doc.querySelector('.inventory-status')!.textContent!, /Ejemplo ficticio.*Lectura local, sin conexion al CDE.*solo durante esta sesion/);
    assert.equal(tableRows(dom).length, 3);
    assert.equal(chartTotal(dom, 'Estado por carpeta'), 3);
    assert.equal(chartTotal(dom, 'Comparacion de instantaneas'), 3);
    set(dom, '[aria-label="Grafico de distribucion"]', 'links'); await pause();
    bar(dom, 'Vinculos registrados', 'Sin vinculo registrado').click(); await pause();
    assert.equal(tableRows(dom).length, 3);
    assert.equal(bar(dom, 'Vinculos registrados', 'Sin vinculo registrado').getAttribute('aria-pressed'), 'true');
    rowFor(dom, 'demo-file-4').querySelector<HTMLButtonElement>('button')!.click(); await pause();
    assert.equal(button(dom, 'Vincular version manual').disabled, true);
    click(dom, 'Documentos de especialistas'); await pause(); assert.equal(doc.querySelector('h1')?.textContent, 'Control documental');
    await openInventory(dom); assert.equal(tableRows(dom).length, 3);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
  } finally { dom.window.close(); }
});

test('comparison needs continuity confirmation; current chart denominator excludes absent historical files', async () => {
  const { dom, doc, errors } = await setup({ inventory: syntheticInventory() });
  try {
    await openInventory(dom);
    set(dom, '.inventory-selectors label:nth-child(2) select', 'snapshot-demo-1'); await pause();
    assert.match(doc.body.textContent!, /Confirma que son el mismo proyecto/);
    assert.equal(tableRows(dom).length, 3);
    doc.querySelector<HTMLInputElement>('.continuity-check input')!.click(); await pause();
    assert.equal(tableRows(dom).length, 4);
    assert.equal(chartTotal(dom, 'Estado por carpeta'), 3);
    assert.equal(chartTotal(dom, 'Comparacion · 4 IDs observados'), 4);
    assert.match(doc.querySelector('.chart-selector')!.textContent!, /3 archivos en la instantanea actual/);
    assert.match(doc.body.textContent!, /No observado en esta exportacion no significa eliminado/);
    rowFor(dom, 'demo-file-3').querySelector<HTMLButtonElement>('button')!.click(); await pause();
    assert.equal(button(dom, 'Vincular version manual').disabled, true);
    set(dom, '[aria-label="Grafico de distribucion"]', 'folder'); await pause();
    bar(dom, 'Carpetas', '1_WIP/Vialidad').click(); await pause();
    assert.deepEqual(tableRows(dom).map(row => row.querySelector('.id-small')!.textContent), ['demo-file-1']);
    assert.equal(chartTotal(dom, 'Carpetas'), 3);
    click(dom, 'Quitar filtros'); await pause();
    bar(dom, 'Comparacion · 4 IDs observados', 'No en esta exportacion').click(); await pause();
    assert.deepEqual(tableRows(dom).map(row => row.querySelector('.id-small')!.textContent), ['demo-file-3']);
    click(dom, 'Quitar filtros'); await pause();
    set(dom, '.inventory-selectors label:nth-child(2) select', ''); await pause();
    assert.equal(tableRows(dom).length, 3); assert.equal(doc.querySelector('.continuity-check'), null);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('manual source-link dialog cancels safely and stores original/source identity without renaming CDE file', async () => {
  const original = syntheticInventory();
  const { dom, doc, factory, errors, network } = await setup({ inventory: original });
  const source = seedRegister().versions.find(version => version.id === 'ver-1')!;
  try {
    await openInventory(dom);
    rowFor(dom, 'demo-file-4').querySelector<HTMLButtonElement>('button')!.click(); await pause();
    click(dom, 'Vincular version manual'); await pause();
    assert.ok(doc.querySelector('select[name="source"] option[value="document:ver-1"]'));
    assert.ok(doc.querySelector('select[name="source"] option[value="model:mdl-1"]'));
    set(dom, '.link-form select[name="source"]', 'document:ver-1');
    set(dom, '.link-form input[name="note"]', 'Synthetic manual confirmation');
    click(dom, 'Cancelar', doc.querySelector('.link-form')!); await pause();
    assert.equal(doc.querySelector('.link-form'), null); assert.equal((await stored(factory))!.links.length, 0);
    click(dom, 'Vincular version manual'); await pause();
    set(dom, '.link-form select[name="source"]', 'document:ver-1');
    set(dom, '.link-form input[name="note"]', 'Synthetic manual confirmation');
    submit(dom, '.link-form');
    await until(() => doc.body.textContent!.includes('Vinculo confirmado.'), 'Source link saved');
    const saved = (await stored(factory))!;
    assert.equal(saved.links.length, 1);
    assert.equal(saved.links[0].sourceVersionId, 'ver-1');
    assert.equal(saved.links[0].originalName, source.fileName);
    assert.equal(saved.links[0].cdeName, 'entrega.isa');
    assert.equal(saved.links[0].fileId, 'demo-file-4');
    assert.deepEqual(saved.snapshots, original.snapshots);
    assert.match(doc.querySelector('.inventory-links')!.textContent!, /Original:.*CDE: entrega.isa.*VID confirmado/s);
    assert.equal(doc.querySelector('.inventory-detail h2')!.textContent, 'entrega.isa');
    set(dom, '[aria-label="Grafico de distribucion"]', 'links'); await pause();
    assert.equal(bar(dom, 'Vinculos registrados', 'Con vinculo registrado').querySelector('b')!.textContent, '1');
    bar(dom, 'Vinculos registrados', 'Con vinculo registrado').click(); await pause();
    assert.deepEqual(tableRows(dom).map(row => row.querySelector('.id-small')!.textContent), ['demo-file-4']);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
  } finally { dom.window.close(); }
  const reloaded = await setup({ factory });
  try {
    await openInventory(reloaded.dom);
    rowFor(reloaded.dom, 'demo-file-4').querySelector<HTMLButtonElement>('button')!.click(); await pause();
    assert.match(reloaded.doc.querySelector('.inventory-links')!.textContent!, /Synthetic manual confirmation/);
  } finally { reloaded.dom.window.close(); }
});

test('historical source links require confirmed continuity and show changed VID or missing source explicitly', async () => {
  const register = seedRegister();
  let state = addInventoryLink(syntheticInventory(), register, { sourceType: 'document', sourceVersionId: 'ver-1', snapshotId: 'snapshot-demo-1', fileId: 'demo-file-1', note: 'Synthetic prior link' });
  state = addInventoryLink(state, register, { sourceType: 'document', sourceVersionId: 'ver-1', snapshotId: 'snapshot-demo-2', fileId: 'demo-file-4', note: 'Synthetic missing source' });
  state.links[1].sourceVersionId = 'synthetic-source-unavailable';
  const { dom, doc, errors } = await setup({ inventory: state });
  try {
    await openInventory(dom);
    set(dom, '[aria-label="Grafico de distribucion"]', 'links'); await pause();
    assert.equal(bar(dom, 'Vinculos registrados', 'Origen no disponible').querySelector('b')!.textContent, '1');
    rowFor(dom, 'demo-file-1').querySelector<HTMLButtonElement>('button')!.click(); await pause();
    assert.match(doc.querySelector('.inventory-links')!.textContent!, /Sin vinculos registrados/);
    set(dom, '.inventory-selectors label:nth-child(2) select', 'snapshot-demo-1'); await pause();
    doc.querySelector<HTMLInputElement>('.continuity-check input')!.click(); await pause();
    assert.match(doc.querySelector('.inventory-links')!.textContent!, /Vinculo de otra instantanea.*VID distinto; revisar/s);
    rowFor(dom, 'demo-file-4').querySelector<HTMLButtonElement>('button')!.click(); await pause();
    assert.match(doc.querySelector('.inventory-links')!.textContent!, /Origen no disponible/);
    assert.equal(chartTotal(dom, 'Vinculos registrados'), 3);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('12000 synthetic records render only 50 rows; pagination and searching reset the page without changing chart totals', async () => {
  const headers = ['File VID', 'Latest version VID', 'File name', 'File location'];
  const rows = Array.from({ length: 12_000 }, (_, i) => [`synthetic-file-${i}`, `synthetic-version-${i}`, `synthetic_${i % 31}.isa`, `1_WIP/Group${i % 3}`]);
  const inventory = addSnapshot(emptyInventory(), { scope: 'Synthetic scope', label: 'Synthetic 12k', exportDate: '2026-10-28', fileName: 'synthetic.csv', sheet: 'Files', headers, rows, mapping: defaultMapping(headers) });
  const { dom, doc, errors } = await setup({ inventory });
  try {
    await openInventory(dom);
    assert.equal(tableRows(dom).length, 50); assert.match(doc.querySelector('.pagination')!.textContent!, /1–50 de 12.000/);
    assert.equal(button(dom, 'Anterior').disabled, true);
    click(dom, 'Siguiente'); await pause();
    assert.equal(tableRows(dom).length, 50); assert.match(doc.querySelector('.pagination')!.textContent!, /51–100 de 12.000/);
    assert.equal(tableRows(dom)[0].querySelector('.id-small')!.textContent, 'synthetic-file-50');
    set(dom, '[aria-label="Buscar archivo CDE"]', 'synthetic-file-11999'); await pause();
    assert.equal(tableRows(dom).length, 1); assert.match(doc.querySelector('.pagination')!.textContent!, /1–1 de 1/);
    assert.equal(button(dom, 'Anterior').disabled, true); assert.equal(button(dom, 'Siguiente').disabled, true);
    assert.equal(chartTotal(dom, 'Estado por carpeta'), 12_000);
    set(dom, '[aria-label="Buscar archivo CDE"]', 'synthetic-no-result'); await pause();
    assert.equal(tableRows(dom).length, 0); assert.match(doc.body.textContent!, /Sin archivos con estos filtros/);
    assert.match(doc.querySelector('.pagination')!.textContent!, /0–0 de 0/);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('CSV preview supports explicit column mapping, cancel without save, import, and IndexedDB reload', async () => {
  const { dom, doc, factory, errors, network } = await setup();
  const csv = 'Identificador;VersionCDE;Archivo entregado;Ruta\n000001;VERSION-1;nombre generico.isa;1_WIP/Grupo\n000002;VERSION-2;nombre generico.isa;2_COMPARTIDO/Grupo\n';
  try {
    await openInventory(dom);
    const documentRegisterBefore = dom.window.localStorage.getItem('registro-documental-demo-v2');
    await preview(dom, csv);
    assert.match(doc.querySelector('.import-panel .count')!.textContent!, /2 registros.*no se infiere revision ni resultado IDS/);
    assert.equal(doc.querySelectorAll('.preview-table tbody tr').length, 2);
    assert.equal((doc.querySelector('.mapping-grid label:first-child select') as HTMLSelectElement).value, '');
    click(dom, 'Cancelar', doc.querySelector('.import-panel')!); await pause();
    assert.equal(doc.querySelector('.import-panel'), null); assert.equal(await stored(factory), undefined);
    await preview(dom, csv);
    set(dom, '.import-panel input[name="scope"]', 'Synthetic explicit scope');
    set(dom, '.import-panel input[name="date"]', '2026-10-28');
    submit(dom, '.import-panel form'); await pause();
    assert.match(doc.querySelector('.import-panel [role="alert"]')!.textContent!, /Asigna ID estable/);
    for (const [index, value] of ['0', '1', '2', '3'].entries()) set(dom, `.mapping-grid label:nth-child(${index + 1}) select`, value);
    submit(dom, '.import-panel form');
    await until(() => doc.body.textContent!.includes('Instantanea importada.'), 'CSV inventory saved');
    const saved = (await stored(factory))!;
    assert.equal(saved.snapshots.length, 1); assert.equal(saved.snapshots[0].rows.length, 2);
    assert.deepEqual(saved.snapshots[0].mapping, { fileId: 0, versionId: 1, name: 2, path: 3 });
    assert.equal(saved.snapshots[0].rows[0][0], '000001');
    assert.equal(doc.querySelector('.import-panel'), null); assert.equal(tableRows(dom).length, 2);
    assert.doesNotMatch(doc.querySelector('.inventory-status')!.textContent!, /Ejemplo ficticio/);
    assert.equal(dom.window.localStorage.getItem('registro-documental-demo-v2'), documentRegisterBefore);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
  } finally { dom.window.close(); }
  const reloaded = await setup({ factory });
  try { await openInventory(reloaded.dom); assert.equal(tableRows(reloaded.dom).length, 2); assert.ok(rowFor(reloaded.dom, '000001')); }
  finally { reloaded.dom.window.close(); }
});

test('cancelled or unmounted parsing cannot show a stale preview, and malformed CSV can be retried', async () => {
  const { dom, doc, factory, errors } = await setup();
  try {
    await openInventory(dom);
    let release!: (buffer: ArrayBuffer) => void;
    const slow = new dom.window.File(['pending'], 'slow-synthetic.csv');
    Object.defineProperty(slow, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => { release = resolve; }) });
    await chooseFile(dom, slow);
    await until(() => doc.body.textContent!.includes('Leyendo slow-synthetic.csv'), 'Reading status shown');
    click(dom, 'Cancelar'); await pause();
    release(new TextEncoder().encode('File VID,File name\nstale,stale.isa').buffer); await pause(30);
    assert.equal(doc.querySelector('.import-panel'), null); assert.equal(await stored(factory), undefined);
    await chooseFile(dom, new dom.window.File(['File VID,File name\n"unclosed'], 'invalid.csv'));
    await until(() => !!doc.querySelector('[role="alert"]'), 'Malformed CSV error shown');
    assert.match(doc.querySelector('[role="alert"]')!.textContent!, /CSV no válido/);
    await preview(dom, 'File VID,File name\nfresh,fresh.isa', 'fresh.csv');
    assert.match(doc.querySelector('.import-panel h2')!.textContent!, /fresh.csv/);
    click(dom, 'Cancelar', doc.querySelector('.import-panel')!); await pause();
    await chooseFile(dom, slow);
    await until(() => doc.body.textContent!.includes('Leyendo slow-synthetic.csv'), 'Second pending read shown');
    click(dom, 'Documentos de especialistas'); await pause();
    release(new TextEncoder().encode('File VID,File name\nstale,stale.isa').buffer); await pause(30);
    await openInventory(dom);
    assert.equal(doc.querySelector('.import-panel'), null); assert.equal(doc.querySelector('[role="alert"]'), null);
    assert.equal(await stored(factory), undefined); assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('explicit approved anonymized example appends 12933 rows without overwriting manual state; repeat load is idempotent and specialties filter', async () => {
  const register = seedRegister();
  const inventory = addInventoryLink(syntheticInventory(), register, { sourceType: 'document', sourceVersionId: 'ver-1', snapshotId: 'snapshot-demo-2', fileId: 'demo-file-4', note: 'Preserve synthetic manual evidence' });
  const { dom, doc, factory, errors, network } = await setup({ inventory });
  try {
    await openInventory(dom);
    const manualRegister = dom.window.localStorage.getItem('registro-documental-demo-v2');
    assert.equal((await stored(factory))!.snapshots.length, 2);
    assert.equal(tableRows(dom).length, 3, 'Approved example is not loaded implicitly');
    click(dom, 'Cargar ejemplo anonimizado');
    await until(() => doc.body.textContent!.includes('Ejemplo anonimizado agregado.'), 'Explicit anonymized example loaded');
    const loaded = (await stored(factory))!;
    assert.equal(loaded.snapshots.length, inventory.snapshots.length + 1);
    assert.equal(loaded.snapshots.at(-1)!.rows.length, 12_933);
    assert.deepEqual(loaded.snapshots.slice(0, inventory.snapshots.length), inventory.snapshots);
    assert.deepEqual(loaded.links, inventory.links);
    assert.equal(dom.window.localStorage.getItem('registro-documental-demo-v2'), manualRegister);
    assert.equal(tableRows(dom).length, 50);
    assert.match(doc.querySelector('.pagination')!.textContent!, /1–50 de 12.933/);
    assert.equal(chartTotal(dom, 'Estado por carpeta'), 12_933);
    click(dom, 'Cargar ejemplo anonimizado');
    await until(() => doc.body.textContent!.includes('El ejemplo ya esta cargado.'), 'Repeated load is acknowledged');
    assert.deepEqual(await stored(factory), loaded);
    set(dom, '[aria-label="Grafico de distribucion"]', 'specialty'); await pause();
    const specialtyChart = chart(dom, 'Especialidad declarada');
    assert.equal(specialtyChart.querySelectorAll('.chart-bar').length, 43);
    assert.equal(chartTotal(dom, 'Especialidad declarada'), 12_933);
    const first = specialtyChart.querySelector<HTMLButtonElement>('.chart-bar')!;
    const selectedSpecialty = first.title;
    const count = Number(first.querySelector('b')!.textContent!.replace(/\./g, ''));
    first.click(); await pause();
    assert.equal(bar(dom, 'Especialidad declarada', selectedSpecialty).getAttribute('aria-pressed'), 'true');
    assert.equal(doc.querySelector('.toolbar .count')!.textContent, `${count.toLocaleString('es-CL')} filas`);
    assert.equal(tableRows(dom).length, Math.min(50, count));
    assert.equal(chartTotal(dom, 'Especialidad declarada'), 12_933, 'Chart denominator remains entire current snapshot');
    tableRows(dom)[0].querySelector<HTMLButtonElement>('button')!.click(); await pause();
    assert.ok(doc.querySelector('.inventory-file-meta')!.textContent!.includes(`Especialidad: ${selectedSpecialty}`));
    click(dom, 'Quitar filtros'); await pause();
    assert.match(doc.querySelector('.toolbar .count')!.textContent!, /12.933 filas/);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
  } finally { dom.window.close(); }
});

test('model deadline filter uses only pending manual plans, retaining overdue despite earlier receipt and excluding historical-only deadlines', async () => {
  const register = seedRegister();
  register.outgoingModels!.find(model => model.id === 'model-1')!.plannedDate = '2000-02-01';
  register.outgoingModels!.find(model => model.id === 'model-2')!.plannedDate = '';
  register.outgoingModels!.find(model => model.id === 'model-3')!.plannedDate = '2099-01-01';
  const earlierReceipt = register.modelDeliveries!.find(delivery => delivery.id === 'mdl-1')!;
  earlierReceipt.date = '2000-01-15'; earlierReceipt.plannedDate = '2000-01-14'; earlierReceipt.inputVersionIds = [];
  register.modelSubmissions!.find(submission => submission.deliveryId === 'mdl-1')!.date = '2000-01-16';
  const historicalOnly = register.modelDeliveries!.find(delivery => delivery.id === 'mdl-2')!;
  historicalOnly.date = '2000-01-02'; historicalOnly.plannedDate = '2000-01-01'; historicalOnly.inputVersionIds = [];
  const { dom, doc, errors } = await setup({ register });
  const modelRows = () => Array.from(doc.querySelectorAll<HTMLTableRowElement>('table[aria-label="Modelos y entregas"] tbody tr'));
  const codes = () => modelRows().map(row => row.querySelector('.model-link strong')!.textContent);
  try {
    const before = dom.window.localStorage.getItem('registro-documental-demo-v2');
    click(dom, 'Modelos y entregas'); await pause();
    assert.equal(modelRows().length, 3);
    set(dom, '[aria-label="Plazo de modelos"]', 'overdue'); await pause();
    assert.deepEqual(codes(), ['MOD-VIA-001']);
    assert.match(modelRows()[0].textContent!, /Recibido/);
    assert.match(modelRows()[0].textContent!, /Pendiente vencida: 01\/02\/2000/);
    assert.match(doc.querySelector('.toolbar .count')!.textContent!, /1 modelos/);
    set(dom, '[aria-label="Especialidad de modelos"]', 'Estructuras'); await pause();
    assert.equal(modelRows().length, 0, 'A historical late delivery does not create a pending deadline');
    set(dom, '[aria-label="Plazo de modelos"]', 'unknown'); await pause();
    assert.deepEqual(codes(), ['MOD-EST-001']);
    set(dom, '[aria-label="Especialidad de modelos"]', '');
    set(dom, '[aria-label="Plazo de modelos"]', 'planned'); await pause();
    assert.deepEqual(codes(), ['MOD-VIA-001', 'MOD-DRE-001']);
    set(dom, '[aria-label="Plazo de modelos"]', ''); await pause();
    assert.equal(modelRows().length, 3);
    assert.equal(dom.window.localStorage.getItem('registro-documental-demo-v2'), before);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
