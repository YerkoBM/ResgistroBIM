import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
const files=readdirSync('dist/assets');
const js=readFileSync('dist/assets/'+files.find(f=>f.endsWith('.js')),'utf8').replace(/<\/script/gi,'<\\/script');
const css=readFileSync('dist/assets/'+files.find(f=>f.endsWith('.css')),'utf8');
mkdirSync('release',{recursive:true});
writeFileSync('release/RegistroBIM_Demo_Local.html','<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex,nofollow"><title>Registro BIM · DEMO LOCAL</title><style>'+css+'</style></head><body><div id="root"></div><script>'+js+'</script></body></html>');
console.log('Standalone demo: release/RegistroBIM_Demo_Local.html');
