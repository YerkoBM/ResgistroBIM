import { date } from './document-register.ts';
import type { Register } from './document-register.ts';
import { records as inventoryRecords } from './inventory-domain.ts';
import type { FolderRule, InventoryRecord, InventorySnapshot, InventoryState } from './inventory-domain.ts';
import { deliveryList, modelList, revisionMatches, submissionList } from './model-register.ts';
import type { ModelDelivery, ModelSubmission, OutgoingModel } from './model-register.ts';

/** Folder-derived workflow indicators, not file-content validation or contractual approval. */
export const modelInventoryStages = ['Terminado', 'Trabajable con observaciones', 'Pendiente de revision', 'Sin clasificar', 'Archivado', 'Adjunto'] as const;
export type ModelInventoryStage = typeof modelInventoryStages[number];
export type ModelInventoryCounts = Record<ModelInventoryStage, number>;
export interface ModelInventoryEntry { record: InventoryRecord; stage: ModelInventoryStage }
export interface ModelSpecialtyKpis {
  name: string;
  /** Active selected-format files only. Archived and attachments never enter this denominator. */
  total: number;
  counts: ModelInventoryCounts;
  percent: number | null;
}
export interface ModelInventoryKpis {
  /** All records matching an explicitly selected final filename extension, including exclusions. */
  records: ModelInventoryEntry[];
  active: ModelInventoryEntry[];
  counts: ModelInventoryCounts;
  total: number;
  activeTotal: number;
  excludedTotal: number;
  remaining: number;
  /** Terminado / activeTotal * 100; null means no denominator, not zero progress. */
  percent: number | null;
  specialties: ModelSpecialtyKpis[];
  extensions: string[];
}

/** Accept 1–10 explicit alphanumeric extensions, optional leading dot; never a wildcard. */
export function parseExtensions(input: string): string[] {
  if (typeof input !== 'string' || input.length > 400) throw new Error('Indica entre 1 y 10 extensiones, separadas por coma o espacio.');
  const parts = input.trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.length || parts.length > 10 || parts.some(value => !/^\.?[a-z0-9]{1,20}$/i.test(value))) throw new Error('Indica entre 1 y 10 extensiones alfanumericas sin comodines (por ejemplo .ifc, .isa).');
  return [...new Set(parts.map(value => '.' + value.replace(/^\./, '').toLowerCase()))];
}
const emptyCounts = (): ModelInventoryCounts => ({ Terminado: 0, 'Trabajable con observaciones': 0, 'Pendiente de revision': 0, 'Sin clasificar': 0, Archivado: 0, Adjunto: 0 });
const normalizedPath = (path: string) => path.replaceAll('\\', '/').split('/').filter(Boolean).join('/').toLowerCase();
const workflowStages: Record<NonNullable<FolderRule['workflow']>, ModelInventoryStage> = {
  wip: 'Pendiente de revision', shared: 'Trabajable con observaciones', published: 'Terminado',
  archived: 'Archivado', attachment: 'Adjunto', unknown: 'Sin clasificar',
};
const segmentStages: Record<string, ModelInventoryStage> = {
  '1_wip': 'Pendiente de revision', '2_compartido': 'Trabajable con observaciones', '3_publicado': 'Terminado',
};

function classify(path: string, rules: FolderRule[]): ModelInventoryStage {
  const normalized = normalizedPath(path);
  const rule = rules.find(rule => {
    const prefix = normalizedPath(rule.prefix);
    return prefix !== '' && (normalized === prefix || normalized.startsWith(prefix + '/'));
  });
  // Display labels are deliberately irrelevant: renaming a label cannot mark files finished.
  if (rule?.workflow !== undefined) return Object.hasOwn(workflowStages, rule.workflow) ? workflowStages[rule.workflow] : 'Sin clasificar';
  const segments = normalized.split('/');
  // Exclusions dominate nested conventional folders; neither is an active completion candidate.
  if (segments.includes('.attachment')) return 'Adjunto';
  if (segments.includes('4_archivado')) return 'Archivado';
  const stages = new Set(segments.map(segment => Object.hasOwn(segmentStages, segment) ? segmentStages[segment] : undefined).filter((stage): stage is ModelInventoryStage => stage !== undefined));
  // Conflicting workflow segments are ambiguous rather than an invitation to guess completion.
  return stages.size === 1 ? [...stages][0] : 'Sin clasificar';
}

export function modelInventoryKpis(state: InventoryState, snapshot: InventorySnapshot, extensions: string[] = ['.ifc']): ModelInventoryKpis {
  if (!Array.isArray(extensions) || extensions.some(extension => typeof extension !== 'string' || /[\s,]/.test(extension))) throw new Error('Extensiones no validas.');
  const selectedExtensions = parseExtensions(extensions.join(','));
  const allowed = new Set(selectedExtensions);
  const rules = (state.folderRules ?? []).filter(rule => rule.scope === snapshot.scope)
    .slice().sort((a, b) => normalizedPath(b.prefix).length - normalizedPath(a.prefix).length);
  // One selected snapshot and one record per validated File VID. Never combine scopes, filenames or formats.
  const records = inventoryRecords(snapshot).filter(record => {
    const filename = record.name.trim().replaceAll('\\', '/').split('/').at(-1) ?? '';
    const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[0].toLowerCase();
    return extension !== undefined && allowed.has(extension);
  }).map(record => ({ record, stage: classify(record.path, rules) }));
  const counts = emptyCounts();
  for (const entry of records) counts[entry.stage]++;
  const active = records.filter(entry => entry.stage !== 'Archivado' && entry.stage !== 'Adjunto');
  const grouped = new Map<string, ModelSpecialtyKpis>();
  for (const entry of active) {
    const name = entry.record.specialty.trim() || 'Sin clasificar';
    const specialty = grouped.get(name) ?? { name, total: 0, counts: emptyCounts(), percent: null };
    specialty.total++; specialty.counts[entry.stage]++; grouped.set(name, specialty);
  }
  const specialties = [...grouped.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
  for (const specialty of specialties) specialty.percent = specialty.counts.Terminado / specialty.total * 100;
  return {
    records, active, counts, total: records.length, activeTotal: active.length,
    excludedTotal: records.length - active.length, remaining: active.length - counts.Terminado,
    percent: active.length ? counts.Terminado / active.length * 100 : null,
    specialties, extensions: selectedExtensions,
  };
}

export type ManualTargetMatch = 'Coincide' | 'Distinta' | 'Sin envio';
export type ManualDeadline = 'Vencido' | 'Previsto' | 'Sin plazo';
export interface ManualModelKpiRow extends OutgoingModel {
  /** Empty string means no registered version/submission; neither is inferred from a filename. */
  availableRevision: string;
  sentRevision: string;
  availableStage: ModelDelivery['stage'];
  targetMatch: ManualTargetMatch;
  deadline: ManualDeadline;
}
export interface ManualModelKpis {
  rows: ManualModelKpiRow[];
  metrics: {
    total: number; available: number; sent: number; unsent: number;
    targetMatches: number; targetDifferent: number;
    overdue: number; planned: number; withoutDeadline: number; unknownStage: number;
  };
  targetCounts: Record<ManualTargetMatch, number>;
  deadlineCounts: Record<ManualDeadline, number>;
}

/** Manual fiches only. CDE file counts and workflow folders never enter these metrics. */
export function manualModelKpis(register: Register, today: string): ManualModelKpis {
  date(today);
  const deliveries = deliveryList(register), byId = new Map(deliveries.map(delivery => [delivery.id, delivery]));
  const available = new Map<string, ModelDelivery>(), sent = new Map<string, ModelSubmission>();
  for (const delivery of deliveries) available.set(delivery.modelId, delivery);
  for (const submission of submissionList(register)) {
    const delivery = byId.get(submission.deliveryId);
    if (delivery) sent.set(delivery.modelId, submission);
  }
  const rows = modelList(register).map(model => {
    const latest = available.get(model.id), submission = sent.get(model.id);
    const sentDelivery = submission ? byId.get(submission.deliveryId) : undefined;
    const plannedDate = date(model.plannedDate, true);
    const row: ManualModelKpiRow = {
      ...model,
      availableRevision: latest?.revision ?? '', sentRevision: sentDelivery?.revision ?? '',
      // Unknown historical stage stays undefined even if production mode is present.
      availableStage: latest?.stage,
      targetMatch: !sentDelivery ? 'Sin envio' : revisionMatches(sentDelivery.revision, model.targetRevision) ? 'Coincide' : 'Distinta',
      // Only the pending manual deadline; historical delivery dates do not invent or close it.
      deadline: !plannedDate ? 'Sin plazo' : plannedDate < today ? 'Vencido' : 'Previsto',
    };
    return row;
  });
  const targetCounts: Record<ManualTargetMatch, number> = { Coincide: 0, Distinta: 0, 'Sin envio': 0 };
  const deadlineCounts: Record<ManualDeadline, number> = { Vencido: 0, Previsto: 0, 'Sin plazo': 0 };
  for (const row of rows) { targetCounts[row.targetMatch]++; deadlineCounts[row.deadline]++; }
  return {
    rows, targetCounts, deadlineCounts,
    metrics: {
      total: rows.length, available: rows.filter(row => available.has(row.id)).length,
      sent: rows.length - targetCounts['Sin envio'], unsent: targetCounts['Sin envio'],
      targetMatches: targetCounts.Coincide, targetDifferent: targetCounts.Distinta,
      overdue: deadlineCounts.Vencido, planned: deadlineCounts.Previsto, withoutDeadline: deadlineCounts['Sin plazo'],
      unknownStage: rows.filter(row => available.has(row.id) && row.availableStage === undefined).length,
    },
  };
}
