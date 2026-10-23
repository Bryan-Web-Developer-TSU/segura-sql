import assert from 'node:assert/strict'
import test from 'node:test'
import { crearFolios, fechaMerida } from '../src/services/folio.js'

test('la fecha de folio usa America/Merida, no UTC', () => {
  const antesDeMedianoche = fechaMerida(new Date('2026-10-23T05:30:00.000Z'))
  const despues = fechaMerida(new Date('2026-10-23T06:30:00.000Z'))
  assert.equal(antesDeMedianoche.compacto, '20261022')
  assert.equal(antesDeMedianoche.clave, '2026-10-22')
  assert.equal(despues.compacto, '20261023')
})

test('el consecutivo sale de INCR y no se reutiliza la clave', async () => {
  const llamadas = []
  const redis = {
    async incr(llave) {
      llamadas.push(llave)
      return llamadas.length
    },
  }
  const folios = crearFolios(redis, () => new Date('2026-10-22T18:00:00.000Z'))
  const primero = await folios.siguiente('computo_redes')
  const segundo = await folios.siguiente('infraestructura')
  assert.equal(primero.codigo, 'INC-20261022-CR-0001')
  assert.equal(primero.llave, 'contador:incidencias:2026-10-22:computo_redes')
  assert.equal(segundo.codigo, 'INC-20261022-IN-0002')
  assert.equal(segundo.llave, 'contador:incidencias:2026-10-22:infraestructura')
})
