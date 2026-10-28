# Paso a control documental compartido

Pendiente de decision e implementacion; no forma parte de esta demo.

## Definir

- Proyecto, especialidades, responsables y revisores.
- Las tres carpetas/plataformas de documentos y permisos de acceso.
- Proveedor de autenticacion, base de datos y respaldo. Ninguno esta conectado.
- Codificacion de documentos, revisiones, estados y plazos contractuales.

## Datos y reglas

Documentos con codigo estable; versiones con plazo propio, entrega real y cambios; referencias a contenido concreto; revision humana del uso de archivos anteriores; observaciones ancladas a la version revisada, respuesta y cierre confirmado. No asociar estos controles a tareas BIM ni exigir modelos derivados.

El formato de tabla se inspira en un MIDP/TIDP; su adecuacion formal debe contrastarse con las exigencias del proyecto.

## Antes de usar informacion real

Autenticacion real, permisos por proyecto en servidor, transacciones, control de concurrencia, auditoria inmutable de cambios y respuestas, respaldo/restauracion y pruebas entre usuarios. Nunca secretos en el JavaScript publico. Mantener documentos pesados en su repositorio documental y guardar enlaces a versiones concretas.

La comparacion de contenido automatica requiere un proceso aparte y validacion humana. La declaracion de cambios o una decision de reutilizacion no certifica equivalencia geometrica ni documental.
