async function pedir(ruta, { token, ...opciones } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opciones.headers ?? {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const respuesta = await fetch(ruta, { ...opciones, headers })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) {
    const error = new Error(datos.error || 'No se pudo completar la operacion')
    error.detalles = datos.detalles
    throw error
  }
  return datos
}

export function iniciarSesion(correo, contrasena) {
  return pedir('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ correo, contrasena }),
  })
}

export function registrarIncidencia(token, incidencia) {
  return pedir('/api/incidencias', {
    method: 'POST',
    token,
    body: JSON.stringify(incidencia),
  })
}
