import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { seedRegister } from '../src/document-register.ts';
import { addInventoryLink, appendInventory, syntheticInventory, validateInventory } from '../src/inventory-domain.ts';
import type { InventoryState } from '../src/inventory-domain.ts';

// Test-only synthetic records and explicitly approved anonymized fixture; never bundled into the app.
// No private input files. Tests execute the built app in jsdom, not a browser.
const approvedFixture = () => validateInventory(JSON.parse(readFileSync('src/data/cde-anonymized-demo.json', 'utf8')));
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
  click(dom,'Estado del proyecto'); await pause();
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
test('observed CDE is secondary view; no inventory silently injected and manual deadline remains independent',async()=>{const r=seedRegister(new Date('2026-10-28T12:00:00Z'));r.outgoingModels![0].plannedDate='2000-01-01';const {dom,doc,factory,errors}=await setup({register:r});await until(()=>!!doc.querySelector('.project-empty'),'empty project');assert.equal(doc.querySelector('h1')?.textContent,'Estado del proyecto');assert.match(doc.body.textContent!,/Importa un inventario/);assert.equal(await stored(factory),undefined);assert.ok(doc.querySelector('table[aria-label="Compromisos de modelos"]'));assert.deepEqual(errors,[]);dom.window.close();});
test('preloaded test-only fixture shows scoped IFC progress and clickthrough without any example-loading control',async()=>{const {dom,doc,factory,errors}=await setup({inventory:approvedFixture()});assert.equal(Array.from(doc.querySelectorAll('button')).some(b=>b.textContent?.includes('Cargar ejemplo')),false);await until(()=>!!doc.querySelector('.project-kpis'),'progress');const cards=doc.querySelectorAll('.project-kpis button');assert.match(cards[0].textContent!,/14,3%/);assert.match(cards[0].textContent!,/577 \/ 4.038/);assert.match(cards[1].textContent!,/2.496 \/ 4.038/);assert.match(doc.body.textContent!,/4038|4.038/);assert.match(doc.body.textContent!,/1 archivados/);assert.equal(doc.querySelector('table[aria-label="Archivos por estado observado"]'),null);(cards[3] as HTMLButtonElement).click();await until(()=>!!doc.querySelector('table[aria-label="Archivos por estado observado"]'),'details');assert.match(doc.querySelector('.project-files .pagination')!.textContent!,/3461 archivos/);assert.equal(doc.querySelectorAll('.project-files tbody tr').length,25);click(dom,'Quitar filtros');await until(()=>!doc.querySelector('.project-files'),'filterclear');click(dom,'Actualizar inventario');await until(()=>!!doc.querySelector('table[aria-label="Inventario CDE"]'),'inventory');assert.match(doc.body.textContent!,/12.933/);click(dom,'Estado del proyecto');await until(()=>!!doc.querySelector('.project-kpis'),'return dashboard');assert.match(doc.querySelector('.project-kpis')!.textContent!,/14,3%/);assert.equal((await stored(factory))!.snapshots.length,1);assert.deepEqual(errors,[]);dom.window.close();});
test('formats apply explicitly, unknown and empty selection do not inflate progress',async()=>{const {dom,doc}=await setup({inventory:syntheticInventory()});await until(()=>!!doc.querySelector('.project-kpis'),'loaded');set(dom,'[aria-label="Formatos de modelo"]','.nothing');submit(dom,'.project-source form');await until(()=>doc.querySelector('.project-kpis button b')?.textContent==='—','zero denominator');assert.match(doc.querySelector('.project-kpis')!.textContent!,/0 \/ 0/);set(dom,'[aria-label="Formatos de modelo"]','');submit(dom,'.project-source form');await until(()=>!!doc.querySelector('[role=alert]'),'empty formats validation');assert.equal(doc.querySelector('.project-kpis button b')?.textContent,'—');dom.window.close();});
test('specialty chart and clickthrough normalize padded and blank values identically',async()=>{const inventory=syntheticInventory(),s=inventory.snapshots.at(-1)!;s.headers.push('Especialidad');s.mapping.specialty=s.headers.length-1;s.rows=s.rows.map((r,i)=>[...r.map((v,j)=>i===1&&j===2?' DEMO-BIM-00-est-0002.IFC ':v),i===1?' Dato ajeno ':' ']);const {dom,doc}=await setup({inventory});await until(()=>!!doc.querySelector('.specialty-progress'),'specialties');click(dom,'Estructuras',doc.querySelector('.specialty-progress')!);await until(()=>!!doc.querySelector('.project-files'),'rows');assert.equal(doc.querySelectorAll('.project-files tbody tr').length,1);assert.match(doc.querySelector('.project-files')!.textContent!,/Estructuras/);dom.window.close();});
test('preloaded filename specialty has one155-file row and details expose original classification and full path',async()=>{const {dom,doc}=await setup({inventory:approvedFixture()});await until(()=>!!doc.querySelector('.specialty-progress'),'groups');const table=doc.querySelector('.specialty-progress')!;const group=Array.from(table.querySelectorAll('tr')).find(r=>r.querySelector('button')?.textContent==='Estructuras')!;assert.ok(group);assert.match(group.textContent!,/0 \/ 155/);assert.equal(Array.from(table.querySelectorAll('button')).filter(b=>b.textContent==='EST').length,0);click(dom,'Estructuras',table);await until(()=>!!doc.querySelector('.project-files'),'details');assert.match(doc.querySelector('.project-files .pagination')!.textContent!,/155 archivos/);assert.match(doc.querySelector('.project-files')!.textContent!,/Dato original importado/);assert.match(doc.querySelector('.project-files')!.textContent!,/Ubicacion observada/);assert.ok(doc.querySelector('.project-files .observed-path')!.textContent!.includes('/'));assert.match(doc.body.textContent!,/No valida el avance real/);assert.match(doc.body.textContent!,/Estado observado en el CDE/);dom.window.close();});
test('stored old and current inventories remain unchanged across project navigation with no fixture or preview injection', async () => {
  const register = seedRegister(), inventory = syntheticInventory(); inventory.snapshots = inventory.snapshots.slice(0, 1);
  const old = inventory.snapshots[0]; old.scope = 'Proyecto demo anonimizado'; old.fileName = 'Inventario_CDE_anonimizado.xlsx';
  const linked = addInventoryLink(inventory, register, { sourceType: 'document', sourceVersionId: register.versions[0].id, snapshotId: old.id, fileId: old.rows[0][0], note: 'Existing link retained' });
  const combined = appendInventory(linked, approvedFixture()), before = structuredClone(combined);
  const { dom, doc, factory, errors } = await setup({ inventory: combined, register });
  try {
    await until(() => !!doc.querySelector('.project-kpis'), 'Stored current inventory loaded');
    assert.match(doc.body.textContent!, /Inventario anterior conservado/);
    assert.equal(Array.from(doc.querySelectorAll('button')).some(b => /Cargar ejemplo/.test(b.textContent ?? '')), false);
    assert.equal(doc.querySelectorAll('[aria-label="Inventario del proyecto"] option').length, 2);
    assert.deepEqual(await stored(factory), before);
    click(dom, 'Actualizar inventario'); await until(() => !!doc.querySelector('table[aria-label="Inventario CDE"]'), 'Inventory loaded');
    assert.match(doc.body.textContent!, /\[Obsoleto\]/);
    assert.deepEqual(await stored(factory), before);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('registro-documental-demo-v2')!), register);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('an old-only saved snapshot remains visible with original links, without manufactured replacement or preview IDs', async () => {
  const register = seedRegister(), state = syntheticInventory(); state.snapshots = state.snapshots.slice(0, 1);
  const old = state.snapshots[0]; old.scope = 'Proyecto demo anonimizado'; old.fileName = 'Inventario_CDE_anonimizado.xlsx';
  const inventory = addInventoryLink(state, register, { sourceType: 'document', sourceVersionId: register.versions[0].id, snapshotId: old.id, fileId: old.rows[0][0], note: 'Historical proof' });
  const { dom, doc, factory, errors } = await setup({ inventory, register });
  try {
    await until(() => !!doc.querySelector('.project-kpis'), 'Only stored old snapshot is inspectable');
    assert.equal(doc.querySelector('.project-empty'), null);
    assert.equal(doc.querySelector<HTMLSelectElement>('[aria-label="Inventario del proyecto"]')!.value, old.id);
    click(dom, 'Seguimiento CDE'); await until(() => !!doc.querySelector('.inventory-selectors'), 'Selectors loaded');
    const options = Array.from(doc.querySelectorAll<HTMLSelectElement>('.inventory-selectors select')[0].options);
    assert.deepEqual(options.map(option => option.value), [old.id]);
    Array.from(doc.querySelectorAll<HTMLButtonElement>('.document-link')).find(node => node.textContent?.includes(old.rows[0][2]))!.click();
    await until(() => !!doc.querySelector('.inventory-links'), 'Old link detail');
    assert.match(doc.querySelector('.inventory-links')!.textContent!, /Historical proof/);
    assert.match(doc.querySelector('.inventory-links')!.textContent!, new RegExp(register.documents[0].code));
    assert.deepEqual(await stored(factory), inventory); assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('production bundle excludes the approved test-only inventory payload and example-loading controls', () => {
  assert.equal(bundle.includes('Inventario_CDE_anonimizado_por_nombre.xlsx'), false);
  assert.equal(bundle.includes('Cargar ejemplo anonimizado'), false);
});
