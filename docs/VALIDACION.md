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

## Perspectiva de gestion

67 pruebas locales aprobadas tras separar produccion/recepcion de envio a revision. Incluyen produccion interna sin empresa externa, fecha de envio no anterior al modelo, referencias exactas, objetivo historico del envio, motivo por revision distinta, observaciones al envio y conservacion de etapas antiguas no especificadas. Todos los datos iniciales son ficticios; no se incluyen identidades de organizaciones reales del usuario.

## Seguimiento CDE (candidato local)

Regresiones cubiertas: parser XLSX/CSV acotado y cancelable, celdas de fecha sin cambio de zona, IDs numericos sin perdida de precision; mapeo opcional vacio, identificadores duplicados y nombres repetidos; comparacion solo con continuidad confirmada y alcance compatible; cruces muchos-a-muchos, enlaces historicos no propagados por defecto, plazos solo con referencia verificable; estados por prefijo de carpeta y raiz de proyecto; restauracion aditiva; IndexedDB 12.000 filas, dos pestañas, cuota/abortos, corrupcion y versionchange.

La inspeccion de pixeles y los flujos en navegador real se realizan sobre Pages tras desplegar el commit validado. No confundir jsdom/fake-indexeddb con validacion de cuota o layout real.

Ejemplo anonimizado revisado por separado: SHA-256 `639725cc0c58f81f438078c35db656620dda9304995583d0f0aa31f6507ceba2`, 12.933 registros. Las pruebas verifican hash, campos personales/fechas/tamanos omitidos, carga expresa aditiva, no duplicacion y filtros de especialidad. No se incluyen el Excel privado ni scripts de transformacion privados. Auditoria de dependencias de produccion: 0 vulnerabilidades reportadas al validar este candidato.

El bundle supera el aviso generico de 500 KB de Vite porque incluye el JSON anonimizado (sin peticion de red) para mantener el HTML standalone. Se conserva un unico JS y CSS, worker inline; la tabla limita el render a 50 filas y los graficos extensos tienen desplazamiento.

## Estado del proyecto

Benchmark del ejemplo revisado: 4.039 archivos IFC, 4.038 activos, 965 sin revisar, 2.496 trabajables, 577 terminados y 1 archivado. Avance por conteo: 577/4.038 = 14,3%; por completar o confirmar: 3.461. Sin deduplicacion de modelos fisicos ni extrapolacion al alcance contractual. Pruebas de formatos, desconocidos, cero denominador, clasificacion explicita independiente de etiquetas, tabla de especialidades y filtros; compromisos manuales independientes. Apertura simultanea del almacen compartido espera la misma carga, sin cache vacia intermedia.

## Equivalencia confirmada y trazabilidad de ubicacion

EST (155 IFC) y Estructuras (614 IFC) se muestran en un unico grupo Estructuras de 769: 601 en WIP, 168 en Compartido, 0 en Publicado. El total activo sigue siendo 4.038. Se prueban mayusculas/espacios, ausencia de coincidencias parciales, fuente inmutable, conteo del filtro y ubicacion completa visible. Los indicadores se rotulan como observaciones de carpeta, no avance real validado.

## Correccion de fuente de especialidad: solo nombre

La regla anterior de unir categorias de carpeta queda superada. Nuevo ejemplo revisado SHA-256 `4aec6a083defce28f5589b4356ab4c8254aee070b3514e1418e0a3faafdd7c20`: 12.933 archivos, 7.074 con codigo de nombre reconocido y 5.859 sin identificar. IFC activos: 4.038; Estructuras por EST: 155 (3 WIP, 152 Compartido); sin identificar activos: 706. Ya no se asignan a Estructuras los 614 IFC cuyo nombre no aporta ese codigo. Se conserva el dato original de cada fila y se agrega el nuevo ejemplo sin sustituir historial previo.
