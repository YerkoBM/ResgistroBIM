# Qué falta para uso compartido

La versión actual es local. Abrir el mismo sitio desde varios equipos **no comparte los registros**. GitHub Pages no aporta autenticación, permisos ni base de datos de la aplicación.

## Decisiones necesarias

- Proyectos, usuarios y permisos de consulta, edición y revisión.
- Unidad del plan: solicitudes, especialidades previstas, tramos y obras individuales.
- Repositorio documental y acceso a archivos/versiones; los archivos pesados pueden permanecer allí.
- Servicio de autenticación, backend, base de datos y política de respaldos.

## Implementación pendiente

- Persistencia central con autorización en servidor, transacciones y control de concurrencia.
- Historial auditable de cambios, recepciones, envíos y cierres de observaciones.
- Migración revisada de los registros locales, sin perder identificadores ni relaciones.
- Respaldo/restauración, pruebas entre usuarios y control de acceso a enlaces privados.
- Integraciones documentales solo cuando se definan sus permisos y contratos de datos.

## Reglas que deben conservarse

El plan esperado no se deduce de los archivos existentes. La base enviada, el modelo disponible y el envío a revisión son hechos distintos, ligados a versiones exactas. Recibir o publicar un archivo no equivale a aprobarlo; los cambios de objetivo conservan su historial.

La comparación automática de contenido o geometría sería otra función. Las observaciones, declaraciones de cambios y evaluaciones humanas actuales no certifican equivalencia entre archivos.

Estas capacidades están pendientes: no se presentan como implementadas ni como cumplimiento formal de una norma MIDP/TIDP.
