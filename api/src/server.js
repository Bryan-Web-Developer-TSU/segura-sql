import { MongoClient } from 'mongodb'
import { Redis } from '@upstash/redis'
import { buildApp } from './app.js'
import { config } from './config.js'
import { crearFolios } from './services/folio.js'

if (!config.mongodbUri) {
  console.error('Falta MONGODB_URI. Copia .env.example a .env en la raíz del repo.')
  process.exit(1)
}
if (!config.jwtSecret) {
  console.error('Falta JWT_SECRET.')
  process.exit(1)
}

const cliente = new MongoClient(config.mongodbUri)
await cliente.connect()
const mongo = cliente.db(config.mongodbDb)

const folios =
  config.redisUrl && config.redisToken
    ? crearFolios(new Redis({ url: config.redisUrl, token: config.redisToken }))
    : {
        async siguiente() {
          const error = new Error('Redis no esta configurado. Completa UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN.')
          error.statusCode = 503
          throw error
        },
      }

const app = await buildApp({
  mongo,
  folios,
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
  corsOrigin: config.corsOrigin,
  logger: true,
})

await app.listen({ port: config.port, host: '0.0.0.0' })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close()
    await cliente.close()
    process.exit(0)
  })
}
