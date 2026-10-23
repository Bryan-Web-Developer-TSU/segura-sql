import { useState } from 'react'
import { iniciarSesion, registrarIncidencia } from './api.js'

const VACIO = {
  titulo: '',
  descripcion: '',
  categoria: 'computo_redes',
  prioridad: 'media',
  edificio: '',
  aula: '',
  direccion_ip: '',
  vlan: '',
  puerto_uplink: '',
  equipos_afectados: '',
  dispositivo: '',
  tipo_dano: '',
  riesgo_seguridad: false,
  requiere_insumos: false,
  insumos: '',
  contratista_externo: false,
  nombre_contratista: '',
  plataforma: '',
  periodo_escolar: '',
  estudiantes_impactados: '',
  codigo_curso: '',
  tipo_falla: '',
}

function detalleDe(formulario) {
  if (formulario.categoria === 'computo_redes') {
    const detalle = {
      direccion_ip: formulario.direccion_ip.trim(),
      vlan: Number(formulario.vlan),
      puerto_uplink: formulario.puerto_uplink.trim(),
      equipos_afectados: Number(formulario.equipos_afectados),
    }
    if (formulario.dispositivo.trim()) detalle.dispositivo = formulario.dispositivo.trim()
    return detalle
  }
  if (formulario.categoria === 'infraestructura') {
    const detalle = {
      tipo_dano: formulario.tipo_dano.trim(),
      riesgo_seguridad: formulario.riesgo_seguridad,
      requiere_insumos: formulario.requiere_insumos,
      contratista_externo: formulario.contratista_externo,
    }
    if (formulario.requiere_insumos) {
      detalle.insumos = formulario.insumos.split(',').map((item) => item.trim()).filter(Boolean)
    }
    if (formulario.contratista_externo) detalle.nombre_contratista = formulario.nombre_contratista.trim()
    return detalle
  }
  const detalle = {
    plataforma: formulario.plataforma.trim(),
    periodo_escolar: formulario.periodo_escolar.trim(),
    estudiantes_impactados: Number(formulario.estudiantes_impactados),
  }
  if (formulario.codigo_curso.trim()) detalle.codigo_curso = formulario.codigo_curso.trim()
  if (formulario.tipo_falla.trim()) detalle.tipo_falla = formulario.tipo_falla.trim()
  return detalle
}

function Campo({ etiqueta, children }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{etiqueta}</span>
      {children}
    </label>
  )
}

const control =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-ink'

export default function App() {
  const [sesion, setSesion] = useState(() => {
    const guardada = sessionStorage.getItem('utm-desk-sesion')
    return guardada ? JSON.parse(guardada) : null
  })
  const [formulario, setFormulario] = useState(VACIO)
  const [error, setError] = useState('')
  const [folio, setFolio] = useState(null)
  const [enviando, setEnviando] = useState(false)

  function actualizar(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
  }

  async function entrar(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const datos = await iniciarSesion(formulario.correo ?? '', formulario.contrasena ?? '')
      sessionStorage.setItem('utm-desk-sesion', JSON.stringify(datos))
      setSesion(datos)
      setFormulario(VACIO)
    } catch (causa) {
      setError(causa.message)
    } finally {
      setEnviando(false)
    }
  }

  async function registrar(evento) {
    evento.preventDefault()
    setError('')
    setFolio(null)
    setEnviando(true)
    try {
      const creada = await registrarIncidencia(sesion.token, {
        titulo: formulario.titulo.trim(),
        descripcion: formulario.descripcion.trim(),
        categoria: formulario.categoria,
        prioridad: formulario.prioridad,
        ubicacion: {
          edificio: formulario.edificio.trim(),
          aula_o_zona: formulario.aula.trim(),
        },
        detalle_especifico: detalleDe(formulario),
      })
      setFolio(creada)
      setFormulario(VACIO)
    } catch (causa) {
      setError(causa.message)
    } finally {
      setEnviando(false)
    }
  }

  function salir() {
    sessionStorage.removeItem('utm-desk-sesion')
    setSesion(null)
    setFolio(null)
    setError('')
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-3xl content-start gap-6 px-4 py-8">
      <header className="flex items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-stamp">UTM DESK</p>
          <h1 className="text-3xl font-semibold">Incidencias del campus</h1>
        </div>
        {sesion && (
          <button type="button" className="text-sm underline" onClick={salir}>
            Cerrar sesión
          </button>
        )}
      </header>

      {error && (
        <p role="alert" className="rounded-md border border-stamp/40 bg-paper px-3 py-2 text-sm text-stamp">
          {error}
        </p>
      )}

      {!sesion ? (
        <form className="grid gap-4 rounded-lg bg-paper p-5 shadow-sm" onSubmit={entrar}>
          <h2 className="text-lg font-semibold">Entrar</h2>
          <Campo etiqueta="Correo">
            <input className={control} type="email" autoComplete="username" required value={formulario.correo ?? ''} onChange={(evento) => actualizar('correo', evento.target.value)} />
          </Campo>
          <Campo etiqueta="Contraseña">
            <input className={control} type="password" autoComplete="current-password" required value={formulario.contrasena ?? ''} onChange={(evento) => actualizar('contrasena', evento.target.value)} />
          </Campo>
          <button className="rounded-md bg-ink px-4 py-2 text-paper disabled:opacity-60" disabled={enviando}>
            Entrar
          </button>
        </form>
      ) : (
        <form className="grid gap-4 rounded-lg bg-paper p-5 shadow-sm" onSubmit={registrar}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Registrar incidencia</h2>
            <p className="text-sm">{sesion.usuario.nombre}</p>
          </div>
          {folio && (
            <p className="rounded-md border border-dashed border-stamp px-3 py-3 font-mono text-lg text-stamp">
              {folio.codigo}
            </p>
          )}
          <Campo etiqueta="Título">
            <input className={control} required value={formulario.titulo} onChange={(evento) => actualizar('titulo', evento.target.value)} />
          </Campo>
          <Campo etiqueta="Descripción">
            <textarea className={control} required rows={3} value={formulario.descripcion} onChange={(evento) => actualizar('descripcion', evento.target.value)} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Categoría">
              <select className={control} value={formulario.categoria} onChange={(evento) => actualizar('categoria', evento.target.value)}>
                <option value="computo_redes">Cómputo y redes</option>
                <option value="infraestructura">Infraestructura</option>
                <option value="academico">Académico</option>
              </select>
            </Campo>
            <Campo etiqueta="Prioridad">
              <select className={control} value={formulario.prioridad} onChange={(evento) => actualizar('prioridad', evento.target.value)}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </Campo>
            <Campo etiqueta="Edificio">
              <input className={control} required value={formulario.edificio} onChange={(evento) => actualizar('edificio', evento.target.value)} />
            </Campo>
            <Campo etiqueta="Aula o zona">
              <input className={control} required value={formulario.aula} onChange={(evento) => actualizar('aula', evento.target.value)} />
            </Campo>
          </div>

          {formulario.categoria === 'computo_redes' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Dirección IP">
                <input className={control} required value={formulario.direccion_ip} onChange={(evento) => actualizar('direccion_ip', evento.target.value)} />
              </Campo>
              <Campo etiqueta="VLAN">
                <input className={control} required type="number" min="0" value={formulario.vlan} onChange={(evento) => actualizar('vlan', evento.target.value)} />
              </Campo>
              <Campo etiqueta="Puerto uplink">
                <input className={control} required value={formulario.puerto_uplink} onChange={(evento) => actualizar('puerto_uplink', evento.target.value)} />
              </Campo>
              <Campo etiqueta="Equipos afectados">
                <input className={control} required type="number" min="0" value={formulario.equipos_afectados} onChange={(evento) => actualizar('equipos_afectados', evento.target.value)} />
              </Campo>
              <Campo etiqueta="Dispositivo">
                <input className={control} value={formulario.dispositivo} onChange={(evento) => actualizar('dispositivo', evento.target.value)} />
              </Campo>
            </div>
          )}

          {formulario.categoria === 'infraestructura' && (
            <div className="grid gap-4">
              <Campo etiqueta="Tipo de daño">
                <input className={control} required value={formulario.tipo_dano} onChange={(evento) => actualizar('tipo_dano', evento.target.value)} />
              </Campo>
              <label className="flex gap-2 text-sm">
                <input type="checkbox" checked={formulario.riesgo_seguridad} onChange={(evento) => actualizar('riesgo_seguridad', evento.target.checked)} />
                Hay riesgo de seguridad
              </label>
              <label className="flex gap-2 text-sm">
                <input type="checkbox" checked={formulario.requiere_insumos} onChange={(evento) => actualizar('requiere_insumos', evento.target.checked)} />
                Requiere insumos
              </label>
              {formulario.requiere_insumos && (
                <Campo etiqueta="Insumos, separados por coma">
                  <input className={control} required value={formulario.insumos} onChange={(evento) => actualizar('insumos', evento.target.value)} />
                </Campo>
              )}
              <label className="flex gap-2 text-sm">
                <input type="checkbox" checked={formulario.contratista_externo} onChange={(evento) => actualizar('contratista_externo', evento.target.checked)} />
                Contratista externo
              </label>
              {formulario.contratista_externo && (
                <Campo etiqueta="Nombre del contratista">
                  <input className={control} required value={formulario.nombre_contratista} onChange={(evento) => actualizar('nombre_contratista', evento.target.value)} />
                </Campo>
              )}
            </div>
          )}

          {formulario.categoria === 'academico' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Plataforma">
                <input className={control} required value={formulario.plataforma} onChange={(evento) => actualizar('plataforma', evento.target.value)} />
              </Campo>
              <Campo etiqueta="Periodo escolar">
                <input className={control} required value={formulario.periodo_escolar} onChange={(evento) => actualizar('periodo_escolar', evento.target.value)} />
              </Campo>
              <Campo etiqueta="Estudiantes impactados">
                <input className={control} required type="number" min="0" value={formulario.estudiantes_impactados} onChange={(evento) => actualizar('estudiantes_impactados', evento.target.value)} />
              </Campo>
              <Campo etiqueta="Código de curso">
                <input className={control} value={formulario.codigo_curso} onChange={(evento) => actualizar('codigo_curso', evento.target.value)} />
              </Campo>
              <Campo etiqueta="Tipo de falla">
                <input className={control} value={formulario.tipo_falla} onChange={(evento) => actualizar('tipo_falla', evento.target.value)} />
              </Campo>
            </div>
          )}

          <button className="rounded-md bg-ink px-4 py-2 text-paper disabled:opacity-60" disabled={enviando || sesion.usuario.rol === 'directivo'}>
            Registrar
          </button>
          {sesion.usuario.rol === 'directivo' && (
            <p className="text-sm">Tu rol consulta. El alta corresponde a reportante, técnico, soporte o coordinación.</p>
          )}
        </form>
      )}
    </main>
  )
}
