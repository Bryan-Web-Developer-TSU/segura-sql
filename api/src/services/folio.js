import { CODIGO_CATEGORIA, ZONA_HORARIA } from '@utm-desk/db/catalogo'

export function fechaMerida(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)
  const valor = (tipo) => partes.find((parte) => parte.type === tipo).value
  const anio = valor('year')
  const mes = valor('month')
  const dia = valor('day')
  return { compacto: `${anio}${mes}${dia}`, clave: `${anio}-${mes}-${dia}` }
}

export function crearFolios(redis, ahora = () => new Date()) {
  return {
    async siguiente(categoria) {
      const codigoCategoria = CODIGO_CATEGORIA[categoria]
      if (!codigoCategoria) {
        const error = new Error('Categoria no valida')
        error.statusCode = 400
        throw error
      }
      const { compacto, clave } = fechaMerida(ahora())
      const llave = `contador:incidencias:${clave}:${categoria}`
      const consecutivo = await redis.incr(llave)
      return {
        codigo: `INC-${compacto}-${codigoCategoria}-${String(consecutivo).padStart(4, '0')}`,
        llave,
      }
    },
  }
}
