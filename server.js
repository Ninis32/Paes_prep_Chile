require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_NAME = process.env.DB_NAME || 'paes';
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
let db;

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

function setAuthCookie(res, token) {
  res.cookie('paes_token', token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
}
function clearAuthCookie(res) { res.clearCookie('paes_token', { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/' }); }
function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), rol: user.rol }, JWT_SECRET, { expiresIn: '7d' });
}
async function auth(req, res, next) {
  try {
    const token = req.cookies?.paes_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    const payload = jwt.verify(token, JWT_SECRET);
    if (!ObjectId.isValid(payload.sub)) return res.status(401).json({ error: 'Sesión no válida.' });
    const user = await db.collection('usuarios').findOne({ _id: new ObjectId(payload.sub) }, { projection: { passwordHash: 0 } });
    if (!user || !user.activo) return res.status(401).json({ error: 'La sesión no es válida o la cuenta está desactivada.' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Sesión vencida o no válida. Inicia sesión nuevamente.' }); }
}
function requireRole(...roles) { return (req, res, next) => roles.includes(req.user.rol) ? next() : res.status(403).json({ error: 'No tienes permisos para esta acción.' }); }

app.get('/api/health', async (_req, res) => {
  try { await db.command({ ping: 1 }); res.json({ ok: true, servicio: 'PAES Prep Chile API', baseDatos: 'conectada' }); }
  catch { res.status(503).json({ ok: false, servicio: 'PAES Prep Chile API', baseDatos: 'no disponible' }); }
});

// Registro público: siempre crea estudiantes. El rol administrador nunca se acepta desde el formulario.
app.post('/api/auth/registro', async (req, res, next) => {
  try {
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 80) : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (nombre.length < 2) return res.status(400).json({ error: 'Ingresa tu nombre (mínimo 2 caracteres).' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 128 caracteres.' });
    const existing = await db.collection('usuarios').findOne({ email });
    if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    // ADMIN_EMAIL debe configurarse manualmente en .env. Solo esa cuenta recibe el rol admin.
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const rol = adminEmail && email === adminEmail ? 'administrador' : 'estudiante';
    const user = { nombre, email, passwordHash: await bcrypt.hash(password, 12), rol, activo: true, creadoEn: new Date(), ultimoAcceso: new Date() };
    const result = await db.collection('usuarios').insertOne(user);
    user._id = result.insertedId;
    const safeUser = { id: user._id.toString(), nombre, email, rol };
    setAuthCookie(res, createToken(user));
    res.status(201).json({ usuario: safeUser, mensaje: 'Cuenta creada correctamente.' });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' }); next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await db.collection('usuarios').findOne({ email });
    if (!user || !user.activo || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    await db.collection('usuarios').updateOne({ _id: user._id }, { $set: { ultimoAcceso: new Date() } });
    setAuthCookie(res, createToken(user));
    res.json({ usuario: { id: user._id.toString(), nombre: user.nombre, email: user.email, rol: user.rol }, mensaje: 'Sesión iniciada.' });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (_req, res) => { clearAuthCookie(res); res.json({ mensaje: 'Sesión cerrada.' }); });
app.get('/api/auth/me', auth, (req, res) => res.json({ usuario: { id: req.user._id.toString(), nombre: req.user.nombre, email: req.user.email, rol: req.user.rol } }));

app.get('/api/admin/usuarios', auth, requireRole('administrador'), async (_req, res, next) => {
  try { const usuarios = await db.collection('usuarios').find({}, { projection: { passwordHash: 0 } }).sort({ creadoEn: -1 }).limit(500).toArray(); res.json({ total: usuarios.length, usuarios: usuarios.map(u => ({ id: u._id.toString(), nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo, creadoEn: u.creadoEn })) }); }
  catch (error) { next(error); }
});
app.patch('/api/admin/usuarios/:id/rol', auth, requireRole('administrador'), async (req, res, next) => {
  try {
    const rol = req.body?.rol;
    if (!['estudiante', 'administrador'].includes(rol)) return res.status(400).json({ error: 'Rol no válido.' });
    if (req.user._id.toString() === req.params.id && rol !== 'administrador') return res.status(400).json({ error: 'No puedes quitarte tu propio rol de administrador.' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'ID de usuario no válido.' });
    const result = await db.collection('usuarios').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { rol } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ mensaje: 'Rol actualizado.' });
  } catch (error) { next(error); }
});

// Banco existente: se conserva y continúa público para poder practicar sin iniciar sesión.
app.get('/api/preguntas', async (req, res, next) => {
  try {
    const filtro = { activa: true };
    if (req.query.materia && ['matematica', 'lenguaje', 'historia', 'ciencias'].includes(String(req.query.materia))) filtro.materia = String(req.query.materia);
    if (req.query.eje) filtro.eje = String(req.query.eje).slice(0, 100);
    if (req.query.dificultad && ['1', '2', '3'].includes(String(req.query.dificultad))) filtro.dificultad = Number(req.query.dificultad);
    const docs = await db.collection('preguntas').find(filtro, { projection: { correcta: 0, explicacion: 0, pista: 0 } }).sort({ materia: 1, eje: 1, _id: 1 }).toArray();
    res.json({ total: docs.length, preguntas: docs });
  } catch (error) { next(error); }
});
app.get('/api/preguntas/:id', async (req, res, next) => {
  try { const doc = await db.collection('preguntas').findOne({ _id: req.params.id, activa: true }, { projection: { correcta: 0, explicacion: 0, pista: 0 } }); if (!doc) return res.status(404).json({ error: 'Pregunta no encontrada' }); res.json(doc); }
  catch (error) { next(error); }
});
app.post('/api/preguntas/:id/responder', async (req, res, next) => {
  try {
    const respuesta = typeof req.body?.respuesta === 'string' ? req.body.respuesta.toUpperCase() : '';
    if (!['A', 'B', 'C', 'D', 'E'].includes(respuesta)) return res.status(400).json({ error: 'Envía una alternativa válida en el campo respuesta.' });
    const pregunta = await db.collection('preguntas').findOne({ _id: req.params.id, activa: true });
    if (!pregunta) return res.status(404).json({ error: 'Pregunta no encontrada' });
    const correcta = respuesta === pregunta.correcta;
    const response = { preguntaId: pregunta._id, respuesta, correcta, alternativaCorrecta: pregunta.correcta, pista: pregunta.pista || '', explicacion: pregunta.explicacion || '' };
    // Si hay sesión, guarda el intento sin interrumpir el banco para visitantes.
    const token = req.cookies?.paes_token;
    if (token) {
      try { const payload = jwt.verify(token, JWT_SECRET); response.intentoGuardado = true; await db.collection('intentos').insertOne({ usuarioId: payload.sub, preguntaId: pregunta._id, materia: pregunta.materia, eje: pregunta.eje, habilidadDEMRE: pregunta.habilidadDEMRE || pregunta.eje, contenidoDEMRE: pregunta.contenidoDEMRE || pregunta.eje, dificultad: pregunta.dificultad, respuesta, correcta, respondidaEn: new Date() }); }
      catch { response.intentoGuardado = false; }
    }
    res.json(response);
  } catch (error) { next(error); }
});
app.get('/api/estudiante/resumen', auth, requireRole('estudiante', 'administrador'), async (req, res, next) => {
  try {
    const intents = await db.collection('intentos').find({ usuarioId: req.user._id.toString() }).sort({ respondidaEn: -1 }).limit(1000).toArray();
    // Enriquecer intentos antiguos con la clasificación actual de cada pregunta sin modificar el historial guardado.
    const questionIds = [...new Set(intents.map(i => String(i.preguntaId || '')).filter(Boolean))];
    const questionDocs = questionIds.length ? await db.collection('preguntas').find({ _id: { $in: questionIds } }, { projection: { materia: 1, eje: 1, habilidadDEMRE: 1, contenidoDEMRE: 1 } }).toArray() : [];
    const questionMap = new Map(questionDocs.map(q => [String(q._id), q]));
    for (const i of intents) {
      const q = questionMap.get(String(i.preguntaId || ''));
      if (q) { i.habilidadDEMRE ||= q.habilidadDEMRE || q.eje; i.contenidoDEMRE ||= q.contenidoDEMRE || q.eje; i.materia ||= q.materia; i.eje ||= q.eje; }
    }
    const byAxis = {};
    const byContent = {};
    for (const i of intents) {
      const axisKey = `${i.materia || 'sin materia'}|${i.eje || 'Sin eje'}`;
      byAxis[axisKey] ||= { materia: i.materia, eje: i.eje || 'Sin eje', total: 0, correctas: 0 };
      byAxis[axisKey].total++; if (i.correcta) byAxis[axisKey].correctas++;
      const content = i.contenidoDEMRE || i.eje || 'Contenido por clasificar';
      const contentKey = `${i.materia || 'sin materia'}|${content}`;
      byContent[contentKey] ||= { materia: i.materia, contenido: content, habilidad: i.habilidadDEMRE || i.eje || 'Por clasificar', total: 0, correctas: 0 };
      byContent[contentKey].total++; if (i.correcta) byContent[contentKey].correctas++;
    }
    const ejes = Object.values(byAxis).map(x => ({ ...x, porcentaje: Math.round(100 * x.correctas / x.total) })).sort((a,b) => a.porcentaje - b.porcentaje);
    const contenidos = Object.values(byContent).map(x => ({ ...x, porcentaje: Math.round(100 * x.correctas / x.total) })).sort((a,b) => a.porcentaje - b.porcentaje);
    res.json({ totalIntentos: intents.length, correctas: intents.filter(i => i.correcta).length, ejes, contenidos, debilidades: contenidos.filter(x => x.total >= 2 && x.porcentaje < 60).slice(0, 8) });
  } catch (error) { next(error); }
});
app.get('/api/textos', async (_req, res, next) => { try { const docs = await db.collection('textos').find({}).sort({ _id: 1 }).toArray(); res.json({ total: docs.length, textos: docs }); } catch (error) { next(error); } });

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Ocurrió un error interno. Revisa la consola del servidor.' }); });
async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en el archivo .env');
  if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('Configura JWT_SECRET en .env con una clave aleatoria de al menos 32 caracteres.');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect(); db = client.db(DB_NAME); await db.command({ ping: 1 });
  await db.collection('usuarios').createIndex({ email: 1 }, { unique: true });
  await db.collection('intentos').createIndex({ usuarioId: 1, respondidaEn: -1 });
  app.listen(PORT, () => console.log(`PAES Prep Chile listo en http://localhost:${PORT}`));
}
main().catch(error => { console.error('No se pudo iniciar el servidor:', error.message); process.exit(1); });
