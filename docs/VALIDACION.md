# Validación

## Referencia actual

La versión de inicio vacío fue validada con **209 pruebas**, TypeScript, build de Vite y generación del HTML local. Este documento describe esa cobertura, no certifica uso multiusuario ni rendimiento ilimitado.

Ejecutar nuevamente al cambiar código:

```bash
npm ci
npm test
```

## Qué se comprueba

| Área | Cobertura |
|---|---|
| Plan | Solicitudes mixtas lineales/puntuales; especialidades previstas sin entregables; objetivos y plazos; recepción parcial; cobertura explícita; claves estables; historial y ediciones sin cambios. |
| Importación del plan | Excel/CSV, mapeo, vista previa, lote atómico, duplicados idénticos, conflictos, asignación seleccionada y paginación. |
| Información base | Identificador literal separado de disponibilidad/envío; varias empresas y reenvíos; referencias exactas; sin comunicaciones externas. |
| Modelos | Producción/recepción separada de envío a revisión; objetivo histórico; insumos utilizados; observaciones y cierre explícito. |
| CDE | Parser acotado y cancelable; IDs; fechas; comparación de instantáneas; vínculos manuales; clasificación por nombre; ruta original y estados observados. |
| Persistencia | Datos anteriores conservados, corrupción bloqueada, cuota, cambios detectados entre pestañas, alternativa temporal y restauración CDE aditiva. |
| Inicio vacío | Sin datos precargados ni acciones de ejemplo; alta manual e importación desde vacío; registros existentes intactos; títulos web/local sin avisos redundantes. |

Las exportaciones CSV neutralizan fórmulas. Se validan referencias, fechas y enlaces admitidos. El fixture anonimizado histórico se usa en pruebas, pero no se incluye en el bundle de la aplicación.

## Límites de la evidencia

- Las pruebas DOM usan jsdom; las de IndexedDB incluyen almacenamiento simulado. No sustituyen revisión visual, cuota real o comportamiento del navegador del usuario.
- Los ensayos sintéticos de 12.000 filas comprueban procesamiento y renderizado acotado. Un registro con mucho historial puede superar la cuota local; el guardado debe fallar sin reemplazar los datos anteriores.
- Los gráficos CDE cuentan archivos del alcance seleccionado, no modelos físicos únicos ni avance contractual certificado.
- No se prueban autenticación, backend o colaboración multiusuario porque no existen en esta versión.

La comprobación del sitio publicado debe repetirse después del despliegue según [Publicación](PUBLICACION.md), usando datos de prueba externos y sin incorporarlos al código.
