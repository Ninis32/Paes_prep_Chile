# PAES Prep Chile — MVP del banco conectado

Primera versión para probar el banco de preguntas y textos en una interfaz web conectada a Node.js, Express y MongoDB Atlas.

## Requisitos
- Node.js 20 o superior.
- Una base de datos MongoDB local o MongoDB Atlas.

## Instalación en Windows / VS Code
1. Descomprime el proyecto y abre esa carpeta en VS Code.
2. Abre Terminal → Nueva terminal.
3. Instala dependencias:
   ```bash
   npm install
   ```
4. Copia `.env.example` a un archivo llamado `.env`.
5. Edita `.env` y coloca la URI real de MongoDB Atlas en `MONGODB_URI`. Mantén las comillas solo si tu contraseña o URI lo requiere; no compartas ni subas el archivo `.env` a GitHub.
6. En MongoDB Atlas, verifica que tu usuario de base de datos tenga permisos de lectura/escritura y que tu IP esté autorizada en Network Access.
7. Importa el banco:
   ```bash
   npm run seed
   ```
8. Inicia la web:
   ```bash
   npm start
   ```
9. Abre http://localhost:3000

## Endpoints
- `GET /api/health`: estado de la API y conexión a MongoDB.
- `GET /api/preguntas`: banco sin respuestas correctas; filtros opcionales `?materia=matematica`, `?eje=Números`, `?dificultad=1`.
- `GET /api/preguntas/:id`: una pregunta sin respuesta correcta.
- `POST /api/preguntas/:id/responder` con JSON `{ "respuesta": "A" }`: valida una respuesta y devuelve resultado, pista y explicación.
- `GET /api/textos`: lista los textos.

## Importación segura
El `seed.js` usa upsert por `_id`. No ejecuta `deleteMany` ni borra documentos que no estén en los JSON. Los documentos que compartan `_id` con el archivo de preguntas/textos se actualizarán con los valores del archivo fuente.

## Estado y seguridad
Este MVP no tiene autenticación ni roles todavía y no persiste intentos de estudiantes. No lo publiques para estudiantes reales antes de implementar autenticación, autorización de administrador, validación y protección contra abuso. Las respuestas correctas se excluyen de los endpoints de lectura para no mostrarlas antes de responder, pero la API aún necesita controles adicionales antes de producción.


## Autenticación y roles (versión 0.2)

1. Ejecuta `npm install` para instalar `bcryptjs`, `cookie-parser` y `jsonwebtoken` además de las dependencias existentes.
2. Copia `.env.example` a `.env` y configura `MONGODB_URI`, `DB_NAME`, `JWT_SECRET` (mínimo 32 caracteres aleatorios) y `ADMIN_EMAIL`.
3. El registro público crea cuentas de estudiante. La primera cuenta que se registre con el correo que coincide exactamente con `ADMIN_EMAIL` obtiene el rol administrador. Configura ese correo antes de registrar la cuenta de administración.
4. Ejecuta `npm start`; visita `/registro.html` para crear una cuenta, `/login.html` para ingresar, `/estudiante.html` para ver progreso y `/administrador.html` para gestionar roles.
5. Las preguntas siguen disponibles sin sesión. Los intentos se guardan en la colección `intentos` cuando el usuario tiene sesión iniciada.

**Seguridad:** no publiques `.env` ni compartas la URI o la clave JWT. Usa HTTPS al desplegar. El rol nunca se acepta desde el formulario de registro; el backend lo determina.


## Corrección: textos de Competencia Lectora

La vista de práctica ahora busca `pregunta.textoId` en la colección de textos cargada desde `/api/textos` y muestra el texto asociado antes del enunciado. Si falta la relación, informa el identificador ausente en vez de ocultar el contexto. No se modifican preguntas, textos ni datos de MongoDB.


## Temarios oficiales DEMRE

La página `public/temarios.html` enlaza a los temarios oficiales de la PAES Regular, Admisión 2027. Accede desde el enlace **Temarios DEMRE** de la portada. Los documentos permanecen alojados en el sitio oficial de DEMRE.


## Ampliación de cobertura del banco

Esta versión incorpora 60 preguntas originales nuevas: 48 de Ciencias (para alcanzar 6 preguntas por área del banco) y 12 de Historia y Ciencias Sociales (para alcanzar 12 por eje). Se añade `REVISION_BANCO.md` con conteos por dificultad y límites de cobertura. Las preguntas no son oficiales del DEMRE.


## Refuerzo positivo durante la práctica

Al comprobar una respuesta, la aplicación muestra una ventana breve de motivación. Las respuestas correctas activan una celebración con confeti animado; las incorrectas muestran un mensaje de apoyo y recuerdan revisar la explicación sin desanimarse. El botón de continuar permite avanzar a la siguiente pregunta. La animación respeta la preferencia del sistema para reducir movimiento.


### Revisión de alternativas y motivación

Se equilibró la distribución de las letras correctas por asignatura, conservando el texto de cada alternativa y la respuesta correcta. La ventana motivacional y la celebración con confeti al acertar se mantienen. Consulta `REVISION_BANCO.md` para ver los conteos.
