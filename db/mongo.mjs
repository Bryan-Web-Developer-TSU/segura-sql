import { MongoClient } from 'mongodb'
import { loadEnv } from './load-env.mjs'

export async function conectar() {
  loadEnv()
  const uri = process.env.MONGODB_URI
  const nombre = process.env.MONGODB_DB || 'utm_desk'
  if (!uri) {
    throw new Error('Falta MONGODB_URI. Copia .env.example a .env y completa la cadena de Atlas.')
  }
  const cliente = new MongoClient(uri)
  await cliente.connect()
  return { cliente, db: cliente.db(nombre) }
}
