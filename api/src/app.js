import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import Fastify from 'fastify'
import { rutasAuth } from './routes/auth.js'
import { rutasIncidencias } from './routes/incidencias.js'

export async function buildApp(options) {
  const app = Fastify({
    logger: options.logger ?? false,
    ajv: { customOptions: { coerceTypes: false, allErrors: true } },
  })

  await app.register(cors, { origin: options.corsOrigin ?? true })
  await app.register(jwt, {
    secret: options.jwtSecret,
    sign: { expiresIn: options.jwtExpiresIn ?? '8h' },
  })

  app.decorate('mongo', options.mongo)
  app.decorate('folios', options.folios)

  app.setErrorHandler((error, request, reply) => {
    if (error.validation || error.code === 'FST_ERR_VALIDATION') {
      const detalles = Array.isArray(error.validation)
        ? error.validation.map((item) => ({
            campo: item.instancePath || item.schemaPath,
            mensaje: item.message,
          }))
        : undefined
      return reply.code(400).send({ error: 'Datos invalidos', detalles })
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message })
    }
    request.log.error(error)
    return reply.code(500).send({ error: 'Error interno' })
  })

  app.get('/salud', async () => ({ servicio: 'utm-desk', estado: 'ok' }))
  await app.register(rutasAuth)
  await app.register(rutasIncidencias)

  return app
}
