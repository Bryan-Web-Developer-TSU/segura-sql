import { CATEGORIAS, ESTADOS, PATRON_FOLIO, PERFILES, PRIORIDADES, TIPOS_EVIDENCIA } from './catalogo.js'

const numero = { bsonType: ['int', 'long', 'double', 'decimal'] }

const detalleComputo = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['direccion_ip', 'vlan', 'puerto_uplink', 'equipos_afectados'],
  properties: {
    direccion_ip: { bsonType: 'string', minLength: 1 },
    vlan: { ...numero, minimum: 0, maximum: 4094 },
    puerto_uplink: { bsonType: 'string', minLength: 1 },
    equipos_afectados: { ...numero, minimum: 0 },
    dispositivo: { bsonType: 'string', minLength: 1 },
    ssid_o_segmento: { bsonType: 'string', minLength: 1 },
  },
}

const detalleInfraestructura = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['tipo_dano', 'riesgo_seguridad', 'requiere_insumos', 'contratista_externo'],
  properties: {
    tipo_dano: { bsonType: 'string', minLength: 1 },
    riesgo_seguridad: { bsonType: 'bool' },
    requiere_insumos: { bsonType: 'bool' },
    insumos: { bsonType: 'array', minItems: 1, items: { bsonType: 'string', minLength: 1 } },
    contratista_externo: { bsonType: 'bool' },
    nombre_contratista: { bsonType: 'string', minLength: 1 },
  },
}

const detalleAcademico = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['plataforma', 'periodo_escolar', 'estudiantes_impactados'],
  properties: {
    plataforma: { bsonType: 'string', minLength: 1 },
    periodo_escolar: { bsonType: 'string', minLength: 1 },
    estudiantes_impactados: { ...numero, minimum: 0 },
    codigo_curso: { bsonType: 'string', minLength: 1 },
    tipo_falla: { bsonType: 'string', minLength: 1 },
  },
}

export const validadorIncidencias = {
  bsonType: 'object',
  additionalProperties: false,
  required: [
    'codigo',
    'titulo',
    'descripcion',
    'categoria',
    'prioridad',
    'estado',
    'reportante',
    'ubicacion',
    'detalle_especifico',
    'tags',
    'historial_seguimiento',
    'evidencias_adjuntas',
    'horas_invertidas',
    'fecha_creacion',
    'fecha_actualizacion',
  ],
  properties: {
    _id: { bsonType: 'objectId' },
    codigo: { bsonType: 'string', pattern: PATRON_FOLIO },
    titulo: { bsonType: 'string', minLength: 3, maxLength: 160 },
    descripcion: { bsonType: 'string', minLength: 3, maxLength: 4000 },
    categoria: { enum: CATEGORIAS },
    prioridad: { enum: PRIORIDADES },
    estado: { enum: ESTADOS },
    reportante: {
      bsonType: 'object',
      additionalProperties: false,
      required: ['usuario_id', 'nombre', 'perfil', 'correo'],
      properties: {
        usuario_id: { bsonType: 'objectId' },
        nombre: { bsonType: 'string', minLength: 1 },
        perfil: { enum: PERFILES },
        correo: { bsonType: 'string' },
      },
    },
    ubicacion: {
      bsonType: 'object',
      additionalProperties: false,
      required: ['edificio', 'aula_o_zona'],
      properties: {
        edificio: { bsonType: 'string', minLength: 1 },
        aula_o_zona: { bsonType: 'string', minLength: 1 },
      },
    },
    detalle_especifico: { bsonType: 'object' },
    tags: {
      bsonType: 'array',
      uniqueItems: true,
      items: { bsonType: 'string', pattern: '^[a-z0-9áéíóúüñ-]{2,30}$' },
    },
    historial_seguimiento: {
      bsonType: 'array',
      minItems: 1,
      items: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['fecha', 'autor', 'estado_resultante', 'comentario', 'horas_registradas'],
        properties: {
          fecha: { bsonType: 'date' },
          autor: { bsonType: 'string', minLength: 1 },
          estado_resultante: { enum: ESTADOS },
          comentario: { bsonType: 'string', minLength: 1 },
          horas_registradas: { ...numero, minimum: 0 },
        },
      },
    },
    evidencias_adjuntas: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['nombre_archivo', 'tipo_mime', 'peso_kb', 'url_storage', 'fecha_carga'],
        properties: {
          nombre_archivo: { bsonType: 'string', minLength: 1 },
          tipo_mime: { enum: TIPOS_EVIDENCIA },
          peso_kb: { ...numero, minimum: 0 },
          url_storage: { bsonType: 'string', minLength: 1 },
          fecha_carga: { bsonType: 'date' },
        },
      },
    },
    horas_invertidas: { ...numero, minimum: 0 },
    fecha_creacion: { bsonType: 'date' },
    fecha_actualizacion: { bsonType: 'date' },
    fecha_resolucion: { bsonType: 'date' },
    tecnico_asignado: { bsonType: 'string', minLength: 1 },
  },
  oneOf: [
    {
      properties: {
        categoria: { enum: ['computo_redes'] },
        detalle_especifico: detalleComputo,
      },
    },
    {
      properties: {
        categoria: { enum: ['infraestructura'] },
        detalle_especifico: detalleInfraestructura,
      },
    },
    {
      properties: {
        categoria: { enum: ['academico'] },
        detalle_especifico: detalleAcademico,
      },
    },
  ],
}
