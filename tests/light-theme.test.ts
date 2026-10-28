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

test('La demo publica indica que no deben ingresarse datos reales',()=>{
 assert.match(readFileSync('src/main.tsx','utf8'),/No ingresar informacion real del proyecto/);
});
