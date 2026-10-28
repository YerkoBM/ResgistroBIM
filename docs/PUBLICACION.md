# Publicación

- Repositorio: `YerkoBM/ResgistroBIM`.
- Sitio: https://yerkobm.github.io/ResgistroBIM/
- Base de Vite: `/ResgistroBIM/`.

## Despliegue en GitHub Pages

1. En **Settings → Pages**, usar **GitHub Actions** como origen.
2. Subir los cambios a `main`. El workflow instala dependencias y ejecuta `npm test` antes de desplegar `dist`.
3. Comprobar que los trabajos de build y deploy terminaron correctamente. Los pull requests ejecutan pruebas, pero no publican el sitio.
4. Abrir Pages y verificar el commit publicado, no solo el contenido del repositorio.

## Comprobación después de publicar

- En un perfil sin datos: Plan de entregas vacío, sin botones de cargar ejemplos.
- En un perfil con registros: datos e historial conservados.
- Crear especialidad/solicitud, importar un archivo de prueba y revisar errores y confirmaciones.
- Comprobar navegación, tablas, filtros, guardado y recarga; revisar consola y presentación móvil cuando corresponda.

Publicar una actualización no sube ni centraliza los registros guardados en los navegadores. No incluir documentos privados, credenciales ni archivos de pruebas del usuario en el repositorio o en `dist`.

## HTML local

`npm run build:standalone` genera `release/RegistroBIM_Demo_Local.html`. El nombre histórico se conserva; la aplicación inicia vacía. El navegador puede restringir el almacenamiento de archivos locales: si aparece el aviso de sesión temporal, descarga respaldos antes de cerrar.
