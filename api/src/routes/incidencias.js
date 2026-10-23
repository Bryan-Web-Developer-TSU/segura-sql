import { ObjectId } from 'mongodb'
import { ROLES_REGISTRAN } from '@utm-desk/db/catalogo'
import { altaIncidenciaBody } from '../schemas/incidencia.js'
import { exigirSesion } from './auth.js'

const PUEDE_REGISTRAR = new Set(ROLES_REGISTRAN)

function normalizarTags(request, _reply, done) {
  const tags = request.body?.tags
  if (Array.isArray(tags)) {
    request.body.tags = tags.map((tag) => String(tag).trim().toLowerCase())
  }
  done()
}

export async function rutasIncidencias(app) {
  app.post(
    '/incidencias',
    {
      schema: { body: altaIncidenciaBody },
      preValidation: normalizarTags,
      preHandler: exigirSesion,
    },
    async (request, reply) => {
      const cuerpo = request.body
      if (!PUEDE_REGISTRAR.has(request.user.rol)) {
        return reply.code(403).send({ error: 'No tienes permiso para esta operacion' })
      }

      let usuarioId
      try {
        usuarioId = new ObjectId(request.user.sub)
      } catch {
        return reply.code(401).send({ error: 'No autorizado' })
      }

      const usuario = await app.mongo.collection('usuarios').findOne({ _id: usuarioId, activo: true })
      if (!usuario) return reply.code(401).send({ error: 'No autorizado' })
      if (!PUEDE_REGISTRAR.has(usuario.rol)) {
        return reply.code(403).send({ error: 'No tienes permiso para esta operacion' })
      }
      if (!usuario.perfil) {
        return reply.code(400).send({ error: 'El usuario no tiene perfil institucional' })
      }

      const ahora = new Date()
      const { codigo } = await app.folios.siguiente(cuerpo.categoria)
      const documento = {
        codigo,
        titulo: cuerpo.titulo.trim(),
        descripcion: cuerpo.descripcion.trim(),
        categoria: cuerpo.categoria,
        prioridad: cuerpo.prioridad,
        estado: 'abierta',
        reportante: {
          usuario_id: usuario._id,
          nombre: usuario.nombre,
          perfil: usuario.perfil,
          correo: usuario.correo,
        },
        ubicacion: cuerpo.ubicacion,
        detalle_especifico: cuerpo.detalle_especifico,
        tags: cuerpo.tags ?? [],
        historial_seguimiento: [
          {
            fecha: ahora,
            autor: 'sistema',
            estado_resultante: 'abierta',
            comentario: 'Incidencia registrada.',
            horas_registradas: 0,
          },
        ],
        evidencias_adjuntas: [],
        horas_invertidas: 0,
        fecha_creacion: ahora,
        fecha_actualizacion: ahora,
      }

      try {
        await app.mongo.collection('incidencias_campus').insertOne(documento)
      } catch (error) {
        if (error.code === 121) {
          return reply.code(400).send({ error: 'El documento no cumple el esquema' })
        }
        if (error.code === 11000) {
          return reply.code(409).send({ error: 'El folio ya existe' })
        }
        throw error
      }

      return reply.code(201).send({
        codigo: documento.codigo,
        estado: documento.estado,
        categoria: documento.categoria,
        titulo: documento.titulo,
        fecha_creacion: documento.fecha_creacion.toISOString(),
      })
    },
  )
}
