# Paso de demo local a registro compartido

## Decisiones abiertas

1. Repositorio separado, nombre y visibilidad autorizados por el propietario.
2. Proveedor de autenticacion y base PostgreSQL. Supabase es una propuesta, no una integracion configurada.
3. Ubicaciones de archivos: aclarar las tres carpetas/plataformas mencionadas. No asumir WIP/Compartido/Publicado.
4. Miembros, roles y responsables por proyecto. Nunca usar el selector de rol demo como permiso real.

## Modelo de datos propuesto

- projects: proyecto, codigo, nombre.
- project_members: usuario autenticado, proyecto, rol, estado.
- deliverables: codigo estable dentro del proyecto, especialidad, responsable.
- file_versions: entregable, revision, nombre, fecha de recepcion, fecha de registro, enlace a version concreta, cambios declarados. Registro historico inmutable; restricciones de unicidad por entregable/revision.
- version_reviews: version, decision, revisor, fecha, evidencia. Separada del archivo inmutable.
- deliveries / delivery_items: lote recibido y versiones contenidas.
- observations: ID permanente, version observada, responsable, vencimiento, estado; no se cierra por recibir una nueva version.
- observation_events: respuesta, version de resolucion, evidencia, verificacion/reapertura y actor; conservar respuestas previas, no editarlas en sitio.
- generated_models / model_inputs: modelo publicado y versiones exactas utilizadas.
- audit_events: eventos append-only generados en servidor.

## Seguridad y concurrencia obligatorias

- Auth real y membresia por proyecto, con politicas RLS en todas las tablas y vistas.
- Ninguna lectura anonima de informacion real. Nunca usar claves service-role ni secretos en JavaScript estatico.
- Mutaciones transaccionales con validacion del actor en servidor: especialista registra/responde, revisor verifica; el cliente no decide permisos.
- Auditoria generada en servidor; usuario no puede reescribir actor/fecha/eventos anteriores.
- Bloqueo optimista/revision de registro para evitar sobrescrituras simultaneas. Acciones idempotentes para evitar duplicar por doble click/reintento.
- Versiones y enlaces a contenido concreto; no apuntar solo a un nombre que sera sobrescrito. Registrar hash de archivo si lo genera un proceso confiable.
- Respaldo y restauracion probados, permisos minimizados, politicas de retencion definidas.
- Pruebas de aislamiento: miembro A no puede leer/modificar proyecto B incluso alterando peticiones.

## Comparacion IFC

Mantener los IFC pesados en su CDE/carpeta actual. Un proceso local puede producir un informe de comparacion con hashes de ambos archivos, esquema, GUID/clase/Psets y metodo. La web importa ese informe con revision humana. GUID regenerados no equivalen automaticamente a eliminar/crear objetos reales. Comparacion geometrica es una fase independiente con transformaciones, unidades y tolerancias verificadas.

## Puerta de salida a produccion

No usar con datos reales hasta disponer de autenticacion, RLS y pruebas negativas, persistencia compartida, auditoria protegida, aislamiento entre proyectos, respaldo, accesibilidad/visual QA real, politica de manejo de archivos y validacion completa del flujo con dos usuarios distintos. Publicar solo la demo no satisface estos requisitos.
