# Publicacion de la demo

Destino autorizado: `YerkoBM/ResgistroBIM` (conservar esta escritura exacta).

Solo datos ficticios. La interfaz publica no tiene autenticacion real ni sincronizacion entre usuarios.

1. La integracion GitHub debe tener acceso de escritura a este repositorio.
2. En Settings → Pages, seleccionar Source: GitHub Actions.
3. Subir el codigo a main. El workflow ejecuta TypeScript, build y 24 pruebas antes del despliegue.
4. Comprobar el resultado de Actions y la URL que devuelve Pages. No confundir el enlace del repositorio con el sitio.

Estado verificado el 2026-10-28: publicado en https://yerkobm.github.io/ResgistroBIM/ .

CI de la primera publicacion: https://github.com/YerkoBM/ResgistroBIM/actions/runs/40694410211 — build y deploy correctos. Commit inicial de la demo: 5b6c8c91b6deb694115f632cb98685fc93e0c13f.

La revision visual en navegador real confirmo fondo claro y disposicion tabular. Se probaron filtro de entregables y navegacion a observaciones. Sin errores de la aplicacion en consola (el navegador registra avisos propios de su extension, ajenos a la demo). No se afirma validacion visual movil.
