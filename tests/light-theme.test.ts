import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('El fondo claro se conserva incluso si el sistema prefiere tema oscuro',()=>{
 const css=readFileSync('src/style.css','utf8');
 assert.match(css,/color-scheme:only light/);
 assert.match(css,/html,body,#root\{min-height:100%;background:#fafbf9;color:var\(--ink\)\}/);
 assert.doesNotMatch(css,/prefers-color-scheme:\s*dark/);
 assert.match(readFileSync('index.html','utf8'),/name="color-scheme" content="light"/);
 assert.match(readFileSync('release/RegistroBIM_Demo_Local.html','utf8'),/name="color-scheme" content="light"/);
});

test('La interfaz conserva aviso de persistencia sin banner redundante',()=>{
 const main=readFileSync('src/main.tsx','utf8');
 assert.match(main,/Guardado solo en este navegador/);
 assert.match(main,/Cambios solo durante esta sesion/);
 assert.doesNotMatch(main,/Datos ficticios|Demo local|Proyecto de ejemplo/);
 assert.match(readFileSync('index.html','utf8'),/<title>Registro BIM<\/title>/);
 assert.match(readFileSync('release/RegistroBIM_Demo_Local.html','utf8'),/<title>Registro BIM<\/title>/);
});
