const texto = { type: 'string', minLength: 1, maxLength: 160 }

export const detalleComputo = {
  type: 'object',
  additionalProperties: false,
  required: ['direccion_ip', 'vlan', 'puerto_uplink', 'equipos_afectados'],
  properties: {
    direccion_ip: { type: 'string', minLength: 1, maxLength: 64 },
    vlan: { type: 'integer', minimum: 0, maximum: 4094 },
    puerto_uplink: { type: 'string', minLength: 1, maxLength: 40 },
    equipos_afectados: { type: 'integer', minimum: 0 },
    dispositivo: texto,
    ssid_o_segmento: texto,
  },
}

export const detalleInfraestructura = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo_dano', 'riesgo_seguridad', 'requiere_insumos', 'contratista_externo'],
  properties: {
    tipo_dano: texto,
    riesgo_seguridad: { type: 'boolean' },
    requiere_insumos: { type: 'boolean' },
    insumos: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    contratista_externo: { type: 'boolean' },
    nombre_contratista: texto,
  },
  allOf: [
    {
      if: {
        properties: { requiere_insumos: { const: true } },
        required: ['requiere_insumos'],
      },
      then: { required: ['insumos'] },
    },
    {
      if: {
        properties: { requiere_insumos: { const: false } },
        required: ['requiere_insumos'],
      },
      then: { not: { required: ['insumos'] } },
    },
    {
      if: {
        properties: { contratista_externo: { const: true } },
        required: ['contratista_externo'],
      },
      then: { required: ['nombre_contratista'] },
    },
    {
      if: {
        properties: { contratista_externo: { const: false } },
        required: ['contratista_externo'],
      },
      then: { not: { required: ['nombre_contratista'] } },
    },
  ],
}

export const detalleAcademico = {
  type: 'object',
  additionalProperties: false,
  required: ['plataforma', 'periodo_escolar', 'estudiantes_impactados'],
  properties: {
    plataforma: texto,
    periodo_escolar: { type: 'string', minLength: 1, maxLength: 20 },
    estudiantes_impactados: { type: 'integer', minimum: 0 },
    codigo_curso: { type: 'string', minLength: 1, maxLength: 40 },
    tipo_falla: texto,
  },
}

export const altaIncidenciaBody = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'descripcion', 'categoria', 'prioridad', 'ubicacion', 'detalle_especifico'],
  properties: {
    titulo: { type: 'string', minLength: 3, maxLength: 160 },
    descripcion: { type: 'string', minLength: 3, maxLength: 4000 },
    categoria: { type: 'string', enum: ['computo_redes', 'infraestructura', 'academico'] },
    prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
    ubicacion: {
      type: 'object',
      additionalProperties: false,
      required: ['edificio', 'aula_o_zona'],
      properties: {
        edificio: { type: 'string', minLength: 1, maxLength: 80 },
        aula_o_zona: { type: 'string', minLength: 1, maxLength: 80 },
      },
    },
    detalle_especifico: { type: 'object' },
    tags: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^[a-z0-9áéíóúüñ-]{2,30}$' },
    },
  },
  allOf: [
    {
      if: { properties: { categoria: { const: 'computo_redes' } }, required: ['categoria'] },
      then: { properties: { detalle_especifico: detalleComputo } },
    },
    {
      if: { properties: { categoria: { const: 'infraestructura' } }, required: ['categoria'] },
      then: { properties: { detalle_especifico: detalleInfraestructura } },
    },
    {
      if: { properties: { categoria: { const: 'academico' } }, required: ['categoria'] },
      then: { properties: { detalle_especifico: detalleAcademico } },
    },
  ],
}

export const loginBody = {
  type: 'object',
  additionalProperties: false,
  required: ['correo', 'contrasena'],
  properties: {
    correo: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
    contrasena: { type: 'string', minLength: 1, maxLength: 200 },
  },
}
