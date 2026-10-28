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
test('project is first view; no inventory silently injected and manual deadline remains independent',async()=>{const r=seedRegister(new Date('2026-10-28T12:00:00Z'));r.outgoingModels![0].plannedDate='2000-01-01';const {dom,doc,factory,errors}=await setup({register:r});await until(()=>!!doc.querySelector('.project-empty'),'empty project');assert.equal(doc.querySelector('h1')?.textContent,'Estado del proyecto');assert.match(doc.body.textContent!,/Alcance contractual|Carga el ejemplo/);assert.equal(await stored(factory),undefined);assert.ok(doc.querySelector('table[aria-label="Compromisos de modelos"]'));assert.deepEqual(errors,[]);dom.window.close();});
test('explicit example shows truthful scoped IFC progress and clickthrough, preserves inventory navigation',async()=>{const {dom,doc,factory,errors}=await setup();await until(()=>!button(dom,'Cargar ejemplo anonimizado').disabled,'example ready');click(dom,'Cargar ejemplo anonimizado');await until(()=>!!doc.querySelector('.project-kpis'),'progress');const cards=doc.querySelectorAll('.project-kpis button');assert.match(cards[0].textContent!,/14,3%/);assert.match(cards[0].textContent!,/577 \/ 4.038/);assert.match(cards[1].textContent!,/2.496 \/ 4.038/);assert.match(doc.body.textContent!,/4038|4.038/);assert.match(doc.body.textContent!,/1 archivados/);assert.equal(doc.querySelector('table[aria-label="Archivos del avance"]'),null);(cards[3] as HTMLButtonElement).click();await until(()=>!!doc.querySelector('table[aria-label="Archivos del avance"]'),'details');assert.match(doc.querySelector('.project-files .pagination')!.textContent!,/3461 archivos/);assert.equal(doc.querySelectorAll('.project-files tbody tr').length,25);click(dom,'Quitar filtros');await until(()=>!doc.querySelector('.project-files'),'filterclear');click(dom,'Actualizar inventario');await until(()=>!!doc.querySelector('table[aria-label="Inventario CDE"]'),'inventory');assert.match(doc.body.textContent!,/12.933/);click(dom,'Estado del proyecto');await until(()=>!!doc.querySelector('.project-kpis'),'return dashboard');assert.match(doc.querySelector('.project-kpis')!.textContent!,/14,3%/);assert.equal((await stored(factory))!.snapshots.length,1);assert.deepEqual(errors,[]);dom.window.close();});
test('formats apply explicitly, unknown and empty selection do not inflate progress',async()=>{const {dom,doc}=await setup({inventory:syntheticInventory()});await until(()=>!!doc.querySelector('.project-kpis'),'loaded');set(dom,'[aria-label="Formatos de modelo"]','.nothing');submit(dom,'.project-source form');await until(()=>doc.querySelector('.project-kpis button b')?.textContent==='—','zero denominator');assert.match(doc.querySelector('.project-kpis')!.textContent!,/0 \/ 0/);set(dom,'[aria-label="Formatos de modelo"]','');submit(dom,'.project-source form');await until(()=>!!doc.querySelector('[role=alert]'),'empty formats validation');assert.equal(doc.querySelector('.project-kpis button b')?.textContent,'—');dom.window.close();});
test('specialty chart and clickthrough normalize padded and blank values identically',async()=>{const inventory=syntheticInventory(),s=inventory.snapshots.at(-1)!;s.headers.push('Especialidad');s.mapping.specialty=s.headers.length-1;s.rows=s.rows.map((r,i)=>[...r,i===1?' Estructuras ':' ']);const {dom,doc}=await setup({inventory});await until(()=>!!doc.querySelector('.specialty-progress'),'specialties');click(dom,'Estructuras',doc.querySelector('.specialty-progress')!);await until(()=>!!doc.querySelector('.project-files'),'rows');assert.equal(doc.querySelectorAll('.project-files tbody tr').length,1);assert.match(doc.querySelector('.project-files')!.textContent!,/Estructuras/);dom.window.close();});
