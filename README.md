# ResgistroBIM

Control de solicitudes BIM, información base y entregas de modelos para quien coordina subcontratos.

[**Abrir RegistroBIM**](https://yerkobm.github.io/ResgistroBIM/)

La aplicación parte vacía. Los datos se guardan en este navegador: **no se comparten entre usuarios ni equipos**. Si ya tienes registros, se conservan.

## Flujo de trabajo

### 1. Plan de entregas

Define primero lo que esperas recibir, aunque todavía no existan archivos.

- Crea una solicitud y selecciona sus **especialidades esperadas**.
- Agrega entregables por **tramo/sector lineal** o por **obra individual**. Una misma solicitud puede combinar ambos; el sector relacionado es opcional.
- Indica tipo de entregable, subcontrato o responsable, revisión/identificador objetivo y fecha comprometida.
- Una especialidad sin entregables definidos queda **por definir**; no se inventa su cantidad a partir del CDE.
- Revisa entregables definidos, recepciones registradas, objetivos pendientes y vencidos. El alcance completo/parcial corresponde a esa solicitud, no a todo el contrato.

Puedes importar Excel/CSV con vista previa y mapeo de columnas, o asignar responsable, especialidad y plazo a filas seleccionadas. Las claves de solicitud y entregable son estables: una importación repetida omite filas iguales y bloquea conflictos sin sobrescribir historial. La plantilla descargable contiene solo encabezados.

Una recepción puede vincular una versión exacta de modelo/documento o registrarse como declaración manual con nota. **Recibir no significa aprobar.** La cobertura exige evaluación explícita y coincidencia con el identificador objetivo, cuando existe. Si se esperaba F y llega E, el objetivo sigue pendiente. Cambiar el plan conserva su versión anterior y requiere reevaluar la cobertura; guardar sin cambios no la invalida.

### 2. Información base

Registra la información que entregas a los subcontratos: planos, archivos ISA, memorias u otros documentos.

Mantén separados **nombre original**, **revisión/fecha del archivo**, **disponible desde** y **fecha real de envío**. La fecha escrita en un ISA es un identificador literal: no se convierte en fecha de envío ni en revisión F/E. La especialidad de esta ficha se elige manualmente.

Cada envío registra una versión exacta, empresa destinataria, fecha y ubicación o enlace. Permite varias empresas y reenvíos. Es un registro: **no envía archivos, correos ni notificaciones**.

### 3. Modelos y entregas

Distingue producción interna y externa, responsable y revisión objetivo. Registra por separado:

- **Versión disponible:** producida internamente o recibida de una empresa.
- **Envío a revisión:** referencia a una versión ya disponible, con destino, fecha y objetivo de ese momento.

Cada modelo puede indicar las versiones base y los envíos utilizados. Las referencias no cambian al aparecer una base más reciente. Las observaciones permanecen ligadas a la versión/envío revisado; una respuesta y su cierre requieren registro explícito. Una versión nueva no cierra comentarios anteriores ni certifica que el modelo pueda reutilizarse.

### 4. Seguimiento CDE

Importa un inventario `.xlsx`, `.csv` o `.tsv` y confirma sus columnas, alcance y fecha. **No hay conexión directa con Trimble Connect ni SharePoint.**

- Los vínculos entre archivos CDE y versiones registradas se confirman manualmente; nombres parecidos no prueban equivalencia.
- La especialidad automática se obtiene solo del código reconocido en el **nombre del archivo**, dentro del patrón `-BIM-…-CODIGO-`. No se deduce de carpetas o tags. Sin código válido: **Sin identificar**. `EST` se presenta como Estructuras.
- El estado por carpeta y los gráficos describen lo **observado**, no el avance real validado. Se conserva la ruta completa para revisar la ubicación.
- Un VID de versión distinto no demuestra un cambio geométrico. «No en esta exportación» no significa eliminado.
- Los atrasos requieren plazos manuales vinculados; no se calculan por antigüedad de modificación.

## Guardado y respaldos

El registro manual usa almacenamiento local del navegador; el inventario CDE usa IndexedDB. Son almacenes separados: descarga **Respaldo JSON** y **Respaldo CDE** cuando corresponda. La restauración CDE es aditiva; el respaldo del registro manual no dispone de un importador general en la interfaz.

Borrar datos del navegador puede eliminar los registros; cambiar de perfil o equipo no los traslada. Cuando la aplicación indique modo temporal, los cambios duran solo durante la sesión. Si se agota la cuota o hay un conflicto detectado entre pestañas, el guardado se rechaza conservando los datos anteriores.

No hay backend, cuentas, permisos por proyecto ni edición multiusuario. El sitio público distribuye la aplicación; no proporciona un repositorio documental compartido. No publiques archivos privados o credenciales dentro del código del repositorio.

## Límites actuales

- Importación: hasta **15 MB**, **25.000 filas**, 100 columnas y 4.000 caracteres por celda. No admite `.xls` ni libros con macros.
- CDE: hasta **10 instantáneas**; sin función de archivado/eliminación de instantáneas en la interfaz.
- Plan: hasta 1.000 solicitudes y 25.000 entregables; la cuota del navegador puede limitar el volumen antes.
- Tablas paginadas. Las pruebas con 12.000 filas no garantizan capacidad ilimitada ni concurrencia entre usuarios.

## Desarrollo

Node.js 24 y npm:

```bash
npm ci
npm test
npm run dev
```

`npm test` ejecuta TypeScript, build, generación del HTML local y pruebas de reglas/interfaz. El archivo `release/RegistroBIM_Demo_Local.html` conserva su nombre por compatibilidad; abre la misma aplicación sin datos iniciales y sin requerir red.

- [Publicación y comprobación del despliegue](docs/PUBLICACION.md)
- [Cobertura de validación](docs/VALIDACION.md)
- [Qué falta para uso compartido](docs/PASO_A_MULTIUSUARIO.md)
