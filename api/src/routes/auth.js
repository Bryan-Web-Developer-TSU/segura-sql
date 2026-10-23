import bcrypt from 'bcryptjs'
import { loginBody } from '../schemas/incidencia.js'

const HASH_DE_RELLENO = bcrypt.hashSync('no-es-una-clave', 10)

export async function rutasAuth(app) {
  app.post('/auth/login', { schema: { body: loginBody } }, async (request, reply) => {
    const { correo, contrasena } = request.body
    const usuario = await app.mongo.collection('usuarios').findOne({ correo, activo: true })
    const hash = usuario?.hash_contrasena ?? HASH_DE_RELLENO
    const coincide = await bcrypt.compare(contrasena, hash)
    if (!usuario || !coincide) {
      return reply.code(401).send({ error: 'No autorizado' })
    }
    const token = await reply.jwtSign({
      sub: usuario._id.toString(),
      nombre: usuario.nombre,
      rol: usuario.rol,
    })
    return {
      token,
      usuario: {
        id: usuario._id.toString(),
        nombre: usuario.nombre,
        rol: usuario.rol,
        correo: usuario.correo,
      },
    }
  })
}

export async function exigirSesion(request, reply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'No autorizado' })
  }
}
