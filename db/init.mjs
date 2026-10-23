import { validadorIncidencias } from './schema/incidencias.js'
import { validadorUsuarios } from './schema/usuarios.js'
import { conectar } from './mongo.mjs'

const COLECCIONES = [
  { nombre: 'incidencias_campus', validador: validadorIncidencias },
  { nombre: 'usuarios', validador: validadorUsuarios },
]

async function asegurarColeccion(db, { nombre, validador }) {
  const existe = await db.listCollections({ name: nombre }).hasNext()
  if (!existe) {
    await db.createCollection(nombre, {
      validator: { $jsonSchema: validador },
      validationLevel: 'strict',
      validationAction: 'error',
    })
    return
  }
  await db.command({
    collMod: nombre,
    validator: { $jsonSchema: validador },
    validationLevel: 'strict',
    validationAction: 'error',
  })
}

async function asegurarIndices(db) {
  const incidencias = db.collection('incidencias_campus')
  await incidencias.createIndex({ codigo: 1 }, { unique: true, name: 'codigo_unico' })
  await incidencias.createIndex(
    { categoria: 1, estado: 1, 'ubicacion.edificio': 1 },
    { name: 'categoria_estado_edificio' },
  )
  await incidencias.createIndex(
    { titulo: 'text', descripcion: 'text' },
    {
      name: 'texto_es',
      default_language: 'spanish',
      weights: { titulo: 10, descripcion: 5 },
    },
  )
  await incidencias.createIndex(
    { fecha_resolucion: 1 },
    { name: 'ttl_resolucion', expireAfterSeconds: 5_184_000 },
  )
  await db.collection('usuarios').createIndex({ correo: 1 }, { unique: true, name: 'correo_unico' })
}

const { cliente, db } = await conectar()
try {
  for (const coleccion of COLECCIONES) {
    await asegurarColeccion(db, coleccion)
    console.log(`coleccion lista: ${coleccion.nombre}`)
  }
  await asegurarIndices(db)
  console.log('indices listos')
} finally {
  await cliente.close()
}
