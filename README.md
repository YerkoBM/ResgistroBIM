# ResgistroBIM

# Registro BIM — demostracion local

Prototipo funcional con datos ficticios para definir el registro de entregas, versiones, observaciones y modelos derivados. **No es todavia una aplicacion multiusuario ni un sistema de produccion.**

## Demo publicada

https://yerkobm.github.io/ResgistroBIM/ — acceso publico, solo datos ficticios y almacenamiento local por navegador.

## Abrir sin instalar

Abrir `release/RegistroBIM_Demo_Local.html` en un navegador. Todo el codigo y estilo estan incluidos; no solicita archivos externos. Los cambios se guardan en este navegador si permite almacenamiento local. Si no lo permite, la franja superior indica que duran solo durante la sesion. Exportar JSON desde Historial permite conservar una copia informativa; la importacion no esta implementada.

**No ingresar datos reales, enlaces privados ni informacion contractual en esta demostracion.** El selector de rol simula el flujo y no constituye autenticacion o permisos seguros.

## Rediseño del registro

La apertura muestra directamente Entregas y versiones. Navegacion horizontal, registro tabular y ficha lateral del archivo con su secuencia de revisiones y observaciones relacionadas. Se retiran barra lateral, tarjetas de indicadores y distribucion de dashboard. La vista general es una lista de trabajo. Paleta neutra y tipografia documental compacta. Se conserva el esquema de almacenamiento y los datos existentes.

## Flujos disponibles

- Vista general: pendientes, observaciones vencidas y modelos cuyos insumos cambiaron.
- Entregas: filtro por codigo, nombre, especialidad y responsable; nueva version desde rol Especialista demo. No se sobrescriben las revisiones anteriores. La nueva entrega no cierra observaciones.
- Detalle: ultima version recibida y ultima aprobada separadas; cambios declarados separados de comprobaciones. Las referencias de archivos son informativas: no se cargan IFC ni se conectan carpetas.
- Observaciones: crear desde Revisor demo; responder desde Especialista demo con version de resolucion y evidencia; verificar y cerrar desde Revisor demo. Version observada y version de resolucion se conservan.
- Modelos generados: versiones de entrada exactas; alerta si se recibe otra version. No regenera geometria.
- Historial local, exportacion CSV del registro y exportacion JSON de todos los datos ficticios.
- Comparacion automatica IFC: **no implementada**. Se propone integrar posteriormente un informe generado localmente por IFCEditTools.

## Desarrollo

Requiere Node.js 24 y npm en el equipo de desarrollo, no en el navegador del usuario.

```sh
npm ci
npm test
npm run dev
npm run build:standalone
```

`npm test` realiza TypeScript, build de produccion, generacion HTML unico, pruebas de dominio y pruebas DOM de flujos. El HTML standalone se genera desde el mismo bundle que el sitio.

## GitHub Pages — demo publica

El sitio usa rutas hash (`/#observaciones`) y base `/ResgistroBIM/`, por lo que no requiere reescrituras del servidor. El contenido de `dist/` es el sitio compilado. El workflow `.github/workflows/pages.yml` valida TypeScript y las pruebas antes de publicar exclusivamente `dist/`. Requiere un repositorio publico y seleccionar **Settings → Pages → Source: GitHub Actions**. Solo `main` despliega; los pull requests ejecutan las pruebas sin publicar. La URL efectiva se consulta en el despliegue de Pages, no se presume hasta comprobarlo.

La demo sigue siendo local: cada navegador conserva sus propios cambios, sin sincronizacion entre personas. El selector de rol no protege datos ni autentica usuarios. No subir archivos reales ni enlaces privados. Los visitantes pueden descargar todo el codigo y los datos iniciales ficticios. No hay servicio de carga de archivos ni conexion a las carpetas del equipo.

El HTML, JavaScript y datos incluidos en un sitio Pages son descargables. No introducir secretos ni datos privados en el repositorio/bundle. Un futuro frontend publico puede mostrar una pantalla de acceso, pero la privacidad de los datos requiere autorizacion real en la base de datos y API; ocultar botones no protege nada.

## Arquitectura

- `src/domain.ts`: reglas, validacion y transiciones inmutables.
- `src/seed.ts`: datos exclusivamente ficticios, relativos a la fecha de apertura inicial.
- `src/repository.ts`: interfaz de persistencia y adaptador local de demostracion.
- `src/main.tsx`: interfaz React.
- `src/style.css`: estilo responsive compacto.
- `tests/`: pruebas de dominio y flujos DOM, incluidas duplicaciones, cancelacion, roles simulados y archivo HTML sin almacenamiento persistente.

## Pendiente para trabajo real

Ver `docs/PASO_A_MULTIUSUARIO.md`. Requiere decidir repositorio, proveedor de autenticacion/base de datos, acceso por proyecto y ubicaciones reales de archivos. No se conecto Supabase ni otro proveedor, ni se generaron credenciales.

## Validacion y limites

- TypeScript y build de produccion aprobados.
- Pruebas de dominio y flujos DOM aprobadas.
- Prueba standalone sin red y sin localStorage aprobada mediante DOM simulado.
- Inspeccion visual del sitio publico en navegador real aprobada: fondo claro, registro tabular, filtro y navegacion hash. Renderizado movil real pendiente.
- Sin servidor, persistencia compartida, concurrencia multiusuario, control de acceso real, respaldo remoto, notificaciones ni comparacion IFC automatica.
- Solo se incluyen datos ficticios; no se cargan documentos del usuario. El estado de publicacion se comprueba en GitHub Actions y Settings → Pages.
