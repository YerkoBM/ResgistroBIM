import type { CoreState, Observation, Version } from './domain.ts';
/** Entirely fictitious, disposable demo data. No real projects, files, or URLs. */
export function seedState(now = new Date()): CoreState {
  const day = (offset: number) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
  const deliverables = [
    { id: 'doc-1', code: 'VIA-001', name: 'Planta de trazado · tramo norte', discipline: 'Vialidad', specialist: 'Equipo Vial · Demo' },
    { id: 'doc-2', code: 'DRE-002', name: 'Drenaje transversal', discipline: 'Drenaje', specialist: 'Equipo Agua · Demo' },
    { id: 'doc-3', code: 'EST-003', name: 'Paso superior PS-01', discipline: 'Estructuras', specialist: 'Equipo Estructuras · Demo' },
    { id: 'doc-4', code: 'GEO-004', name: 'Secciones y movimiento de tierras', discipline: 'Geotecnia', specialist: 'Equipo Terreno · Demo' },
    { id: 'doc-5', code: 'INS-005', name: 'Canalizaciones e iluminación', discipline: 'Instalaciones', specialist: 'Equipo Sistemas · Demo' },
    { id: 'doc-6', code: 'ARQ-006', name: 'Edificio técnico · arquitectura', discipline: 'Arquitectura', specialist: 'Equipo Arquitectura · Demo' },
  ];
  const spec: [string, string, number, 'received' | 'approved', string][] = [
    ['doc-1', 'P01', -20, 'approved', 'Primera entrega de geometría del eje.'],
    ['doc-2', 'P01', -18, 'approved', 'Red de drenaje y cotas de descarga.'],
    ['doc-3', 'P01', -16, 'approved', 'Predimensionado de tablero y apoyos.'],
    ['doc-4', 'P01', -14, 'approved', 'Secciones de referencia y taludes.'],
    ['doc-5', 'P01', -12, 'received', 'Trazado inicial de canalizaciones.'],
    ['doc-6', 'P01', -10, 'approved', 'Distribución inicial de espacios.'],
    ['doc-1', 'P02', -6, 'received', 'Ajuste del eje entre PK 1+200 y PK 1+800.'],
    ['doc-2', 'P02', -4, 'received', 'Reubicación de dos cruces de drenaje.'],
    ['doc-3', 'P02', -3, 'approved', 'Ajuste de estribo y cota de apoyo.'],
    ['doc-6', 'P02', -1, 'received', 'Nueva distribución del cuarto técnico.'],
  ];
  const versions: Version[] = spec.map(([deliverableId, revision, offset, status, declaredChanges], index) => {
    const d = deliverables.find(d => d.id === deliverableId)!;
    return { id: `ver-${index + 1}`, deliverableId, revision, date: day(offset), status, fileName: `DEMO_${d.code}_${revision}.ifc`, location: '', declaredChanges, checkedChanges: status === 'approved' ? 'Comprobación manual de ejemplo: cambios contrastados.' : 'Pendiente de comprobación técnica. Declaración de ejemplo, no validación automática.', submittedBy: d.specialist };
  });
  const observations: Observation[] = [
    { id: 'obs-1', code: 'OBS-001', versionId: 'ver-1', title: 'Revisar transición de peralte en PK 1+450', priority: 'high', assignee: deliverables[0].specialist, dueDate: day(-2), status: 'open' },
    { id: 'obs-2', code: 'OBS-002', versionId: 'ver-2', title: 'Cruce de drenaje incompatible con el eje actualizado', priority: 'high', assignee: deliverables[1].specialist, dueDate: day(2), status: 'responded', response: 'Se desplazó el cruce conforme al trazado de ejemplo.', resolvedVersionId: 'ver-8', evidence: 'Evidencia ficticia: sección D-04, detalle 2. Pendiente de revisión.' },
    { id: 'obs-3', code: 'OBS-003', versionId: 'ver-3', title: 'Ajustar la cota de apoyo del estribo este', priority: 'medium', assignee: deliverables[2].specialist, dueDate: day(-3), status: 'closed', response: 'Cota corregida en P02.', resolvedVersionId: 'ver-9', evidence: 'Evidencia ficticia: plano E-12, revisión P02.', reviewedBy: 'Coordinación · Demo' },
    { id: 'obs-4', code: 'OBS-004', versionId: 'ver-5', title: 'Completar separación entre canalizaciones', priority: 'medium', assignee: deliverables[4].specialist, dueDate: day(4), status: 'open' },
    { id: 'obs-5', code: 'OBS-005', versionId: 'ver-10', title: 'Verificar espacio de mantenimiento del cuadro', priority: 'high', assignee: deliverables[5].specialist, dueDate: day(1), status: 'open' },
    { id: 'obs-6', code: 'OBS-006', versionId: 'ver-4', title: 'Aclarar criterio de talud en sección tipo', priority: 'low', assignee: deliverables[3].specialist, dueDate: day(6), status: 'open' },
  ];
  return { deliverables, versions, observations,
    deliveries: versions.map((v, i) => ({ id: `del-${i + 1}`, date: v.date, versionIds: [v.id], by: v.submittedBy })),
    models: [
      { id: 'model-1', name: 'Federado · corredor norte', inputVersionIds: ['ver-1', 'ver-2', 'ver-3'], date: day(-15) },
      { id: 'model-2', name: 'Coordinación · edificio técnico', inputVersionIds: ['ver-5', 'ver-6'], date: day(-8) },
      { id: 'model-3', name: 'Revisión · estructura y terreno', inputVersionIds: ['ver-9', 'ver-4'], date: day(-2) },
    ],
    history: [{ id: 'evt-1', at: `${day(-20)}T09:00:00.000Z`, actor: 'Sistema · Demo', action: 'Datos ficticios de demostración inicializados', target: 'demo' }],
  };
}
