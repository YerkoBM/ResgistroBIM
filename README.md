# ResgistroBIM

## Control documental · demo local

https://yerkobm.github.io/ResgistroBIM/

Dos registros sencillos: documentos recibidos de especialistas y modelos entregados al mandante por otra empresa. Disposicion tabular inspirada en un MIDP/TIDP, sin afirmar cumplimiento formal de una plantilla o norma. No es un gestor de tareas BIM.

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

### Modelos al mandante

- Fichas individuales o de conjunto por especialidad, con empresa entregadora y revision objetivo vigente.
- El plazo pendiente solo se cierra si se marca expresamente; registrar una revision distinta no implica cumplir el objetivo.
- Cada entrega guarda revision realmente entregada, objetivo en ese momento, empresa, fecha y motivo si difiere. Una ficha sin entregas no se presenta como cumplida.
- Cambiar el objetivo de F a G no altera la revision entregada ni el objetivo historico. Se compara igualdad, no orden alfabetico.
- Seleccionar las versiones documentales efectivamente utilizadas, incluso si no son las ultimas. Pueden quedar sin registrar; no se inventan insumos. No se admiten documentos recibidos despues de la fecha de la entrega del modelo.
- Observaciones fiscales vinculadas a una entrega concreta del modelo, respuesta en esa entrega o una posterior y cierre verificado. Una nueva entrega no reubica ni cierra comentarios anteriores.
- El CSV de modelos resume ultima entrega y objetivo vigente; el respaldo JSON conserva todo el historial y observaciones.

### Datos anteriores

El adaptador lee la demo anterior y conserva documentos, revisiones, estados, observaciones, respuestas y evidencias. El almacenamiento original `registro-bim-demo-v1` queda intacto. Los cambios nuevos se guardan en `registro-documental-demo-v2`. La interfaz permite descargar el respaldo anterior completo, incluidos campos de modelos e historial que ya no forman parte de esta vista.

Las nuevas colecciones de modelos son opcionales: un registro v2 existente se abre sin inyectar fichas ni entregas de ejemplo. No se inventan fechas previstas antiguas ni decisiones de reutilizacion. Si el registro esta corrupto o tiene referencias incompatibles, se bloquea la edicion y se ofrece descarga, sin sustituirlo silenciosamente.

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
- `model-register.ts`, `model-view.tsx`: fichas, entregas y observaciones al mandante.
- `repository.ts`: persistencia local y proteccion de datos incompatibles.
- `main.tsx`, `style.css`: interfaz compacta.
- `domain.ts`, `storage-validator.ts`, `seed.ts`: compatibilidad del formato anterior; no exponen un flujo de modelos en la interfaz nueva.
- `tests/`: reglas, regresiones y flujos DOM.

Para uso compartido real, ver `docs/PASO_A_MULTIUSUARIO.md`.
