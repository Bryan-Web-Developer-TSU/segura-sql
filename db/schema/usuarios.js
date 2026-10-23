import { PERFILES, ROLES } from './catalogo.js'

export const validadorUsuarios = {
  bsonType: 'object',
  required: ['correo', 'hash_contrasena', 'nombre', 'rol', 'perfil', 'activo'],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'objectId' },
    correo: { bsonType: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
    hash_contrasena: { bsonType: 'string', minLength: 20 },
    nombre: { bsonType: 'string', minLength: 1, maxLength: 120 },
    rol: { enum: ROLES },
    perfil: { enum: PERFILES },
    activo: { bsonType: 'bool' },
  },
}
