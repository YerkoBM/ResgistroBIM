# Validacion del control documental

- TypeScript y build de produccion.
- Pruebas de dominio anterior para compatibilidad; reglas del nuevo registro.
- Flujos DOM: agregar especialidad/documento/version, duplicados, cancelar/Escape, filtros, revision y cierre de observaciones.
- Migracion con datos originales intactos; corrupcion bloqueada; alternativa temporal sin localStorage.
- CSV protege contra formulas; enlaces solo HTTPS sin credenciales; referencias y fechas validadas.

Inspeccion visual real local pendiente: el navegador del computador cloud no puede conectar al localhost de ejecucion, y Chromium local no pudo iniciar por restriccion de sockets. No confundir las pruebas DOM con renderizado real.

La validacion publica posterior al despliegue se registra por separado. No hay prueba multiusuario porque no existe backend compartido.

## Fichas de modelos

56 pruebas locales aprobadas, incluidas versiones reales distintas al objetivo, historial objetivo/empresa/insumos inmutable, falta de entrega, razones obligatorias, referencias a versiones documentales y fecha de recepcion compatible, observaciones por entrega y cierre expreso. V2 sin colecciones nuevas se conserva sin insertar ejemplos. La UI se verifica posteriormente en el sitio publicado; no se reintento el navegador local restringido.
