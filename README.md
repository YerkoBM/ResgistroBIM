# ResgistroBIM

## Control documental · demo local

https://yerkobm.github.io/ResgistroBIM/

Dos registros para quien coordina y gestiona: documentos de especialistas, y modelos producidos internamente o recibidos de empresas externas. Disposicion tabular inspirada en un MIDP/TIDP, sin afirmar cumplimiento formal de una plantilla o norma. No es un gestor de tareas BIM.

**Solo datos ficticios. Cambios guardados en el navegador, sin sincronizacion entre personas. No ingresar informacion real ni enlaces privados.**

### Uso

- Agregar especialidades y documentos. Cada documento tiene codigo, nombre, tipo, responsable y proxima fecha prevista. Editar ficha desde su historial.
- Filtrar el registro por especialidad o estado. Seleccionar un documento para abrir versiones y observaciones.
- Registrar una version con fecha prevista propia, fecha entregada, archivo, enlace opcional y cambios. Las revisiones anteriores no se sobrescriben.
- El atraso usa la fecha prevista de esa revision y su entrega real. Una nueva revision sin plazo propio no hereda el plazo de otra. Si existe una proxima entrega programada, el plazo pendiente sigue visible aunque haya versiones anteriores. Al marcar que la version corresponde a la entrega prevista, su fecha queda en la revision y se libera el proximo plazo. Una entrega parcial puede conservar el plazo pendiente.
- Revisar estado y, desde la segunda version, el posible uso de la version anterior despues de los cambios. La decision exige criterio, revisor y fecha; no es una comparacion automatica.
- Registrar la version utilizada para advertir si se esta trabajando con una anterior.
- Vincular observaciones a la version comentada. Una respuesta indica la version de resolucion; el cierre requiere verificacion expresa. Recibir un archivo nuevo no cierra observaciones.
- Exportar el registro filtrado a CSV o todos los datos a JSON. Los enlaces son referencias; no se suben ni comparan archivos.

### Modelos y entregas

- Fichas individuales o de conjunto con produccion Interna/Externa, equipo o empresa responsable, revision objetivo y proximo plazo.
- Registrar una version producida o recibida no la envia a revision. La tabla separa ultima disponible de ultima enviada.
- Cada envio a revision apunta a una version ya registrada, con fecha, destino y objetivo de ese momento. No duplica versiones ni sustituye archivos.
- Cambiar el objetivo de F a G no altera versiones ni objetivos historicos. Una revision distinta exige motivo, tanto al registrar como al enviar. Se compara igualdad, no orden alfabetico.
- El plazo pendiente solo se cierra si se marca expresamente. Ni recibir ni enviar una revision implica aprobarla.
- Insumos documentales: IDs de las versiones realmente utilizadas. No se actualizan al recibir documentos nuevos ni se inventan cuando faltan.
- Observaciones nuevas vinculadas al envio revisado. Respuesta asociada a un envio compatible y cierre verificado; una version nueva no cierra comentarios.
- El CSV distingue disponible, etapa y enviada; JSON conserva todo el historial.

### Datos anteriores

El adaptador lee la demo anterior y conserva documentos, revisiones, estados, observaciones, respuestas y evidencias. El almacenamiento original `registro-bim-demo-v1` queda intacto. Los cambios nuevos se guardan en `registro-documental-demo-v2`. La interfaz permite descargar el respaldo anterior completo, incluidos campos de modelos e historial que ya no forman parte de esta vista.

Produccion, etapa y envios son opcionales en registros historicos. Si no constaban, se muestran como no especificados y no se inventa una recepcion ni un envio. Las nuevas colecciones de modelos son opcionales: un registro v2 existente se abre sin inyectar fichas ni entregas de ejemplo. No se inventan fechas previstas antiguas ni decisiones de reutilizacion. Si el registro esta corrupto o tiene referencias incompatibles, se bloquea la edicion y se ofrece descarga, sin sustituirlo silenciosamente.

### Desarrollo

Requiere Node.js 24 y npm solo para desarrollar:

```
npm ci
npm test
npm run dev
```

`npm test` comprueba TypeScript, build, HTML standalone y pruebas de reglas y flujos DOM. El HTML `release/RegistroBIM_Demo_Local.html` contiene el mismo bundle que Pages y funciona sin red. Si el navegador bloquea almacenamiento, los cambios duran solo durante la sesion.

### Publicacion

Repositorio `YerkoBM/ResgistroBIM`, base `/ResgistroBIM/`. El workflow de Pages prueba y despliega `main`; los pull requests solo prueban. No hay servidor, autenticacion, permisos, archivos compartidos ni comparacion automatica de contenido. No configurar claves o datos reales en el codigo publico.

### Estructura

- `document-register.ts`: reglas del registro y migracion.
- `model-register.ts`, `model-view.tsx`: produccion, recepciones, envios y observaciones de modelos.
- `repository.ts`: persistencia local y proteccion de datos incompatibles.
- `main.tsx`, `style.css`: interfaz compacta.
- `domain.ts`, `storage-validator.ts`, `seed.ts`: compatibilidad del formato anterior; no exponen un flujo de modelos en la interfaz nueva.
- `tests/`: reglas, regresiones y flujos DOM.

Para uso compartido real, ver `docs/PASO_A_MULTIUSUARIO.md`.

### Seguimiento CDE

- Importacion local `.xlsx`, `.csv` y `.tsv`, sin conectar ni enviar archivos a Trimble o SharePoint. Vista previa, hoja/fila de encabezado y columnas ajustables antes de guardar.
- Limites: 15 MB por archivo, 25.000 filas por instantanea, 100 columnas y 4.000 caracteres por celda; 10 instantaneas. Lectura en worker cancelable; CSV con alternativa cooperativa. `.xls` y libros con macros no admitidos.
- Proyecto/alcance y fecha de exportacion se indican expresamente. No se infieren revisiones contractuales ni resultados IDS desde tags, VID, nombres o carpetas. Fechas Excel sin zona conservan su hora original.
- Comparacion opcional entre instantaneas del mismo alcance, previa confirmacion de continuidad del ID. `VID de version distinto` no significa diferencia geometrica. `No en esta exportacion` no afirma eliminacion.
- Cruce manual muchos-a-muchos con versiones exactas del registro: codigo asignado, nombre original y archivo CDE permanecen separados. Un vinculo antiguo con VID distinto debe revisarse; no confirma automaticamente un plazo para la version actual. Origen ausente se muestra como no disponible.
- Graficos de carpetas, especialidades declaradas, estado por carpeta, vinculos y plazos manuales. Los colores son configurables, no colores normativos ISO; carpeta publicada no equivale a aprobacion. Un archivo sin fecha manual vinculada no se considera atrasado.
- Inventario en IndexedDB, separado del registro manual v2. Fallos de cuota o escrituras desde una pestaña desactualizada no sustituyen datos; se pide recargar. Sin IndexedDB se avisa del modo temporal. Respaldo CDE y restauracion aditiva (no reemplaza datos existentes); el respaldo general del registro manual sigue separado.
- Tabla paginada a 50 filas. Pruebas sinteticas de 12.000 filas, persistencia, abortos, cuota y conflictos entre pestañas. Las pruebas de almacenamiento simulado no garantizan la cuota de cada navegador.

`Cargar ejemplo anonimizado` agrega expresamente una instantanea de 12.933 registros derivada de un inventario, con especialidades y distribucion por carpetas. Identidades, nombres y rutas se sustituyeron; responsables, fechas por archivo y tamanos se omitieron. No representa los plazos ficticios del registro manual ni crea vinculos automaticamente. El JSON revisado se incluye en el bundle para que el HTML standalone no requiera red; se analiza solo al pulsar el boton.

### Estado del proyecto

La primera vista resume los estados observados en carpetas de los archivos de modelo del inventario seleccionado, con alcance predeterminado `.ifc` y formatos ajustables. El CDE puede estar desordenado: Publicado, Compartido y WIP describen la ubicacion observada, no una validacion del avance real por gestion. No se asignan pesos parciales artificiales. Se cuenta cada File VID: archivos/formats/copias no equivalen necesariamente a modelos fisicos distintos.

El denominador incluye archivos activos sin clasificar; archivados y adjuntos quedan separados. Cero archivos activos se muestra sin porcentaje. Las fichas manuales muestran compromisos vencidos, ausencia de plazo y revision enviada versus objetivo sin mezclarse con los porcentajes CDE. El alcance contractual completo no esta confirmado; no se declara un avance global contractual. Los colores/etiquetas de carpeta son independientes de la clasificacion para avance, que puede configurarse expresamente.

Equivalencia confirmada de especialidad: `EST`, `Estructura` y `Estructuras` se agrupan como `Estructuras` (sin distinguir mayusculas y espacios exteriores). No se adivinan otras siglas. La clasificacion original y la ruta completa quedan visibles en el detalle; no se reescribe el inventario ni el ejemplo anonimizado.
