require('dotenv').config();
const { MongoClient } = require('mongodb');
const preguntas = require('./preguntas.json');
const textos = require('./textos.json');

async function importarColeccion(db, nombre, documentos) {
  if (!Array.isArray(documentos)) throw new Error(`${nombre} debe ser un arreglo JSON`);
  const coleccion = db.collection(nombre);
  if (documentos.length === 0) return;

  // Upsert por _id: actualiza los documentos del banco sin borrar otros datos
  // que ya existan en la colección. Los documentos que no están en el JSON se conservan.
  const operaciones = documentos.map((doc) => {
    if (!doc._id) throw new Error(`Hay un documento sin _id en ${nombre}`);
    const { _id, ...campos } = doc;
    return {
      updateOne: {
        filter: { _id },
        update: { $set: campos },
        upsert: true
      }
    };
  });
  const resultado = await coleccion.bulkWrite(operaciones, { ordered: true });
  console.log(`${nombre}: ${documentos.length} del archivo procesados; ${resultado.upsertedCount} nuevos, ${resultado.modifiedCount} actualizados.`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Falta MONGODB_URI. Copia .env.example a .env y configura tu conexión a MongoDB Atlas.');
  }
  const cliente = new MongoClient(process.env.MONGODB_URI);
  try {
    await cliente.connect();
    const db = cliente.db(process.env.DB_NAME || 'paes');
    await importarColeccion(db, 'preguntas', preguntas);
    await importarColeccion(db, 'textos', textos);
    await db.collection('preguntas').createIndex({ materia: 1, eje: 1, dificultad: 1, activa: 1 });
    console.log('Importación terminada. No se eliminaron documentos de las colecciones.');
  } finally {
    await cliente.close();
  }
}

main().catch((error) => {
  console.error('Error al importar el banco:', error.message);
  process.exitCode = 1;
});
