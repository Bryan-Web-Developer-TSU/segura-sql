import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { buildApp } from '../src/app.js'

function coincide(actual, esperado) {
  if (actual && esperado && typeof actual.equals === 'function') return actual.equals(esperado)
  return actual === esperado
}

function crearMongo() {
  const usuarios = []
  const incidencias = []
  const db = {
    collection(nombre) {
      const filas = nombre === 'usuarios' ? usuarios : incidencias
      return {
        async findOne(filtro) {
          return filas.find((fila) => Object.entries(filtro).every(([clave, valor]) => coincide(fila[clave], valor))) ?? null
        },
        async insertOne(doc) {
          if (filas.some((fila) => fila.codigo === doc.codigo)) {
            const error = new Error('duplicate')
            error.code = 11000
            throw error
          }
          if (doc.codigo === 'RECHAZO-121') {
            const error = new Error('Document failed validation')
            error.code = 121
            throw error
          }
          filas.push(doc)
          return { insertedId: new ObjectId() }
        },
      }
    },
  }
  return { db, usuarios, incidencias }
}

async function crearApp(mongo, folios) {
  return buildApp({
    mongo,
    folios,
    jwtSecret: 'secreto-de-prueba',
    logger: false,
  })
}

const altaComputo = {
  titulo: 'Punto de acceso sin servicio',
  descripcion: 'El identificador UTM-Lab-B no responde durante la practica.',
  categoria: 'computo_redes',
  prioridad: 'alta',
  ubicacion: { edificio: 'Edificio B', aula_o_zona: 'Laboratorio B-204' },
  detalle_especifico: {
    direccion_ip: '10.20.15.44',
    vlan: 120,
    puerto_uplink: 'Gi0/24',
    equipos_afectados: 18,
  },
  tags: [' WiFi ', 'laboratorio'],
}

test('login, alta y rechazos del primer corte', async (t) => {
  const { db, usuarios, incidencias } = crearMongo()
  const hash = await bcrypt.hash('utmdesk123', 4)
  const reportanteId = new ObjectId()
  const directivoId = new ObjectId()
  usuarios.push(
    {
      _id: reportanteId,
      correo: 'ana.lopez@utm.mx',
      hash_contrasena: hash,
      nombre: 'Ana López Ruiz',
      rol: 'reportante',
      perfil: 'docente',
      activo: true,
    },
    {
      _id: directivoId,
      correo: 'directivo@utm.mx',
      hash_contrasena: hash,
      nombre: 'Dirección UTM',
      rol: 'directivo',
      perfil: 'administrativo',
      activo: true,
    },
  )

  let consecutivo = 0
  const folios = {
    async siguiente(categoria) {
      consecutivo += 1
      const cat = categoria === 'computo_redes' ? 'CR' : 'IN'
      return { codigo: `INC-20261022-${cat}-${String(consecutivo).padStart(4, '0')}` }
    },
  }
  const app = await crearApp(db, folios)
  t.after(() => app.close())

  const sinClave = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { correo: 'ana.lopez@utm.mx', contrasena: 'otra' },
  })
  assert.equal(sinClave.statusCode, 401)
  assert.equal(sinClave.json().error, 'No autorizado')

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { correo: 'ana.lopez@utm.mx', contrasena: 'utmdesk123' },
  })
  assert.equal(login.statusCode, 200)
  const { token, usuario } = login.json()
  assert.equal(usuario.rol, 'reportante')
  assert.equal(usuario.nombre, 'Ana López Ruiz')

  const sinToken = await app.inject({ method: 'POST', url: '/incidencias', payload: altaComputo })
  assert.equal(sinToken.statusCode, 401)

  const loginDirectivo = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { correo: 'directivo@utm.mx', contrasena: 'utmdesk123' },
  })
  const comoDirectivo = await app.inject({
    method: 'POST',
    url: '/incidencias',
    headers: { authorization: `Bearer ${loginDirectivo.json().token}` },
    payload: altaComputo,
  })
  assert.equal(comoDirectivo.statusCode, 403)

  const alta = await app.inject({
    method: 'POST',
    url: '/incidencias',
    headers: { authorization: `Bearer ${token}` },
    payload: altaComputo,
  })
  assert.equal(alta.statusCode, 201)
  assert.equal(alta.json().codigo, 'INC-20261022-CR-0001')
  assert.equal(alta.json().estado, 'abierta')

  const guardada = incidencias[0]
  assert.equal(guardada.reportante.correo, 'ana.lopez@utm.mx')
  assert.equal(guardada.reportante.perfil, 'docente')
  assert.equal(String(guardada.reportante.usuario_id), String(reportanteId))
  assert.deepEqual(guardada.tags, ['wifi', 'laboratorio'])
  assert.equal(guardada.historial_seguimiento[0].autor, 'sistema')
  assert.equal(guardada.historial_seguimiento[0].estado_resultante, 'abierta')
  assert.equal(guardada.estado, 'abierta')
  assert.equal(guardada.fecha_resolucion, undefined)

  const cruce = await app.inject({
    method: 'POST',
    url: '/incidencias',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      ...altaComputo,
      categoria: 'infraestructura',
      detalle_especifico: altaComputo.detalle_especifico,
    },
  })
  assert.equal(cruce.statusCode, 400)
  assert.equal(cruce.json().error, 'Datos invalidos')

  const infra = await app.inject({
    method: 'POST',
    url: '/incidencias',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      titulo: 'Filtracion en el aula',
      descripcion: 'Goteo sobre contactos electricos del aula.',
      categoria: 'infraestructura',
      prioridad: 'critica',
      ubicacion: { edificio: 'Edificio C', aula_o_zona: 'Aula C-101' },
      detalle_especifico: {
        tipo_dano: 'filtracion',
        riesgo_seguridad: true,
        requiere_insumos: true,
        contratista_externo: false,
      },
    },
  })
  assert.equal(infra.statusCode, 400)
})
