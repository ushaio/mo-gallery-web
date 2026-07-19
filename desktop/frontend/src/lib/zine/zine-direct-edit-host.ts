import {
  assertEditorAiRevision,
  canonicalizeJson,
  createZineDocumentSnapshot,
  EditorAiExecutionError,
  hasEditorAiValidationErrors,
  type AiDocumentHost,
  type DeepReadonly,
  type EditorAiCommitResult,
  type EditorAiImageInput,
  type EditorAiSimulationResult,
  type EditorAiValidationIssue,
  type JsonValue,
  type ReadonlyAiChangeEntry,
  type ZineDocumentSnapshot,
  type ZineEditorOperation,
} from '@mo-gallery/ai-agent'

import { cloneSpreads } from './history'
import { getSpreadSize } from './page-sizes'
import { getProjectBleedMm } from './print'
import { captureZineSpreadVisualContext } from './spread-raster'
import {
  buildSpreadFromTemplate,
  ZINE_COVER_TEMPLATE,
  ZINE_TEMPLATES,
} from './templates'
import type {
  Slot,
  Spread,
  TextSlot,
  ZineProject,
} from './types'
import { useZineStore } from '@/store/zine'

export interface ZineAiTaskHistoryState {
  state: 'applied' | 'undone' | 'redone'
  canUndo: boolean
  canRedo: boolean
}

export interface ZineDirectEditHost extends AiDocumentHost<'zine'> {
  getTaskHistoryState(taskId: string): ZineAiTaskHistoryState | null
  undoTask(taskId: string): boolean
  redoTask(taskId: string): boolean
}

interface TaskHistoryRecord {
  baseRevision: string
  resultRevision: string
  appliedUndoDepth: number
  state: ZineAiTaskHistoryState['state']
}

interface SuccessfulSimulation {
  operationsRevision: string
  spread: Spread
}

interface ZineSnapshotVisuals {
  preview?: EditorAiImageInput
  thumbnails?: ReadonlyMap<string, EditorAiImageInput>
}

const BASE_SLOT_ATTRS = new Set(['page', 'x', 'y', 'w', 'h', 'rotation', 'zIndex'])
const TEXT_SLOT_ATTRS = new Set(['content', 'align', 'fontSize', 'lineHeight', 'color', 'fontFamily'])

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Zine direct-edit task was aborted', 'AbortError')
  }
}

function slotToJson(slot: Slot): Record<string, JsonValue> {
  const base: Record<string, JsonValue> = {
    id: slot.id,
    kind: slot.kind,
    page: slot.page,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    rotation: slot.rotation,
    zIndex: slot.zIndex,
  }
  if (slot.kind === 'image') {
    return {
      ...base,
      assetId: slot.assetId,
      imageTransform: {
        scale: slot.imageTransform.scale,
        offsetX: slot.imageTransform.offsetX,
        offsetY: slot.imageTransform.offsetY,
        rotation: slot.imageTransform.rotation,
      },
    }
  }
  return {
    ...base,
    content: slot.content,
    align: slot.align,
    fontSize: slot.fontSize,
    lineHeight: slot.lineHeight,
    color: slot.color,
    fontFamily: slot.fontFamily,
  }
}

function spreadToJson(spread: Spread): Record<string, JsonValue> {
  return {
    id: spread.id,
    templateId: spread.templateId,
    ...(spread.role ? { role: spread.role } : {}),
    slots: spread.slots.map(slotToJson),
  }
}

function spreadSummary(spread: Spread): Record<string, JsonValue> {
  const text = spread.slots
    .filter((slot): slot is TextSlot => slot.kind === 'text')
    .map((slot) => slot.content.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 500)
  return {
    templateId: spread.templateId,
    role: spread.role ?? 'content',
    slotCount: spread.slots.length,
    imageSlotCount: spread.slots.filter((slot) => slot.kind === 'image').length,
    textSlotCount: spread.slots.filter((slot) => slot.kind === 'text').length,
    ...(text ? { text } : {}),
  }
}

function createSnapshot(
  project: ZineProject,
  targetSpreadId: string,
  visuals: ZineSnapshotVisuals = {},
): ZineDocumentSnapshot {
  const targetIndex = project.spreads.findIndex((spread) => spread.id === targetSpreadId)
  if (targetIndex < 0) {
    throw new EditorAiExecutionError('stale_revision', `Zine spread ${targetSpreadId} no longer exists`)
  }
  const currentSpread = project.spreads[targetIndex]
  const adjacentSpreads = [project.spreads[targetIndex - 1], project.spreads[targetIndex + 1]]
    .filter((spread): spread is Spread => spread !== undefined)
    .map((spread) => ({
      spreadId: spread.id,
      index: project.spreads.findIndex((candidate) => candidate.id === spread.id),
      structure: spreadToJson(spread),
      summary: spreadSummary(spread),
    }))
  const spreadSummaries: Record<string, JsonValue> = {}
  for (const spread of project.spreads) spreadSummaries[spread.id] = spreadSummary(spread)

  return createZineDocumentSnapshot({
    projectId: project.id,
    targetSpreadId,
    project: {
      projectId: project.id,
      settings: {
        title: project.title,
        pageSize: project.pageSize,
        pageOrientation: project.pageOrientation,
        ...(project.customSizeMm ? {
          customSizeMm: {
            width: project.customSizeMm.width,
            height: project.customSizeMm.height,
          },
        } : {}),
        bleedMm: project.bleedMm ?? 0,
        ...(project.pageNumbers ? {
          pageNumbers: {
            enabled: project.pageNumbers.enabled,
            position: project.pageNumbers.position,
          },
        } : {}),
      },
      spreadOrder: project.spreads.map((spread) => spread.id),
      spreadSummaries,
    },
    currentSpread: {
      spreadId: currentSpread.id,
      index: targetIndex,
      structure: spreadToJson(currentSpread),
      summary: spreadSummary(currentSpread),
      ...(visuals.preview ? { preview: visuals.preview } : {}),
    },
    adjacentSpreads,
    assetCandidates: project.assets.map((asset) => {
      const thumbnail = visuals.thumbnails?.get(asset.id)
      return {
        assetId: asset.id,
        metadata: {
          fileName: asset.fileName,
          source: asset.source,
          width: asset.width,
          height: asset.height,
          ...(asset.dpi !== undefined ? { dpi: asset.dpi } : {}),
        },
        ...(thumbnail ? { thumbnail } : {}),
      }
    }),
  })
}

function operationTargets(operation: DeepReadonly<ZineEditorOperation>): string[] {
  if ('slotId' in operation) return [operation.slotId]
  if (operation.type === 'apply_layout_template') return [...operation.targetSlotIds]
  return []
}

function issue(
  operation: DeepReadonly<ZineEditorOperation>,
  code: string,
  message: string,
): EditorAiValidationIssue {
  const targetIds = operationTargets(operation)
  return {
    code,
    severity: 'error',
    message,
    operationId: operation.operationId,
    ...(targetIds.length > 0 ? { targetIds } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseSlot(value: unknown): Slot | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string'
    || (value.kind !== 'image' && value.kind !== 'text')
    || (value.page !== 'left' && value.page !== 'right')
    || !finiteNumber(value.x)
    || !finiteNumber(value.y)
    || !finiteNumber(value.w)
    || value.w <= 0
    || !finiteNumber(value.h)
    || value.h <= 0
    || !finiteNumber(value.rotation)
    || !finiteNumber(value.zIndex)
  ) return null

  const base = {
    id: value.id,
    kind: value.kind,
    page: value.page,
    x: value.x,
    y: value.y,
    w: value.w,
    h: value.h,
    rotation: value.rotation,
    zIndex: value.zIndex,
  } as const

  if (value.kind === 'image') {
    const transform = value.imageTransform
    if (
      (value.assetId !== null && typeof value.assetId !== 'string')
      || !isRecord(transform)
      || !finiteNumber(transform.scale)
      || transform.scale <= 0
      || !finiteNumber(transform.offsetX)
      || !finiteNumber(transform.offsetY)
      || !finiteNumber(transform.rotation)
    ) return null
    return {
      ...base,
      kind: 'image',
      assetId: value.assetId,
      imageTransform: {
        scale: transform.scale,
        offsetX: transform.offsetX,
        offsetY: transform.offsetY,
        rotation: transform.rotation,
      },
    }
  }

  if (
    typeof value.content !== 'string'
    || (value.align !== 'left' && value.align !== 'center' && value.align !== 'right')
    || !finiteNumber(value.fontSize)
    || value.fontSize <= 0
    || !finiteNumber(value.lineHeight)
    || value.lineHeight <= 0
    || typeof value.color !== 'string'
    || typeof value.fontFamily !== 'string'
  ) return null
  return {
    ...base,
    kind: 'text',
    content: value.content,
    align: value.align,
    fontSize: value.fontSize,
    lineHeight: value.lineHeight,
    color: value.color,
    fontFamily: value.fontFamily,
  }
}

function validateSlotAttrs(slot: Slot, attrs: Readonly<Record<string, unknown>>): string | null {
  for (const [key, value] of Object.entries(attrs)) {
    const allowed = BASE_SLOT_ATTRS.has(key) || (slot.kind === 'text' && TEXT_SLOT_ATTRS.has(key))
    if (!allowed) return `Attribute ${key} is not editable for ${slot.kind} slots`
    if (key === 'page' && value !== 'left' && value !== 'right') return 'Slot page must be left or right'
    if ((key === 'w' || key === 'h' || key === 'fontSize' || key === 'lineHeight') && (!finiteNumber(value) || value <= 0)) {
      return `Attribute ${key} must be a positive number`
    }
    if ((key === 'x' || key === 'y' || key === 'rotation' || key === 'zIndex') && !finiteNumber(value)) {
      return `Attribute ${key} must be a finite number`
    }
    if (key === 'align' && value !== 'left' && value !== 'center' && value !== 'right') {
      return 'Text alignment must be left, center, or right'
    }
    if ((key === 'content' || key === 'color' || key === 'fontFamily') && typeof value !== 'string') {
      return `Attribute ${key} must be a string`
    }
  }
  return null
}

function failedSimulation(
  snapshot: DeepReadonly<ZineDocumentSnapshot>,
  issues: EditorAiValidationIssue[],
): EditorAiSimulationResult<ZineDocumentSnapshot> {
  return { snapshot, resultRevision: snapshot.revision, issues, changeEntries: [] }
}

function operationsRevision(operations: ReadonlyArray<DeepReadonly<ZineEditorOperation>>): string {
  return canonicalizeJson(operations as unknown as JsonValue)
}

export function createZineDirectEditHost(
  projectId: string,
  targetSpreadId: string,
): ZineDirectEditHost {
  const taskHistory = new Map<string, TaskHistoryRecord>()
  const successfulSimulations = new WeakMap<object, SuccessfulSimulation>()

  function currentProject(): ZineProject {
    const project = useZineStore.getState().project
    if (!project || project.id !== projectId) {
      throw new EditorAiExecutionError('stale_revision', `Zine project ${projectId} is not loaded`)
    }
    return project
  }

  function currentSnapshot(): ZineDocumentSnapshot {
    return createSnapshot(currentProject(), targetSpreadId)
  }

  function historyState(taskId: string): ZineAiTaskHistoryState | null {
    const record = taskHistory.get(taskId)
    if (!record) return null
    const state = useZineStore.getState()
    const revision = currentSnapshot().revision
    if (revision === record.resultRevision && state.undoStack.length === record.appliedUndoDepth) {
      if (record.state === 'undone') record.state = 'redone'
      return { state: record.state, canUndo: true, canRedo: false }
    }
    if (
      revision === record.baseRevision
      && state.undoStack.length === record.appliedUndoDepth - 1
      && state.redoStack.length > 0
    ) {
      record.state = 'undone'
      return { state: 'undone', canUndo: false, canRedo: true }
    }
    return { state: record.state, canUndo: false, canRedo: false }
  }

  return {
    async captureSnapshot(signal) {
      throwIfAborted(signal)
      const project = currentProject()
      const visuals = await captureZineSpreadVisualContext(project, targetSpreadId, signal)
      const snapshot = createSnapshot(project, targetSpreadId, visuals)
      throwIfAborted(signal)
      return snapshot
    },

    getCurrentRevision() {
      return currentSnapshot().revision
    },

    async simulate(snapshot, operations, signal) {
      throwIfAborted(signal)
      const liveProject = currentProject()
      const liveSnapshot = createSnapshot(liveProject, targetSpreadId)
      assertEditorAiRevision(snapshot.revision, liveSnapshot.revision)

      const sourceSpread = liveProject.spreads.find((spread) => spread.id === targetSpreadId)
      if (!sourceSpread) throw new EditorAiExecutionError('stale_revision', 'Target Zine spread is unavailable')
      let sandboxSpread = cloneSpreads([sourceSpread])[0]
      const issues: EditorAiValidationIssue[] = []
      const changeEntries: ReadonlyAiChangeEntry[] = []

      for (const operation of operations) {
        throwIfAborted(signal)
        if (operation.spreadId !== targetSpreadId) {
          issues.push(issue(operation, 'wrong_target_spread', 'Operation targets another Zine spread'))
          continue
        }

        if (operation.type === 'insert_slot') {
          const slot = parseSlot(operation.slot)
          if (!slot) {
            issues.push(issue(operation, 'invalid_slot', 'Inserted slot is not a valid Zine slot'))
            continue
          }
          if (sandboxSpread.slots.some((candidate) => candidate.id === slot.id)) {
            issues.push(issue(operation, 'duplicate_slot_id', `Slot ${slot.id} already exists`))
            continue
          }
          if (operation.index > sandboxSpread.slots.length) {
            issues.push(issue(operation, 'invalid_slot_index', 'Inserted slot index is outside the spread'))
            continue
          }
          sandboxSpread.slots.splice(operation.index, 0, slot)
          changeEntries.push({
            operation: operation.type,
            targetId: slot.id,
            targetLabel: `${slot.kind} slot`,
            category: 'structure',
            after: slotToJson(slot),
          })
          continue
        }

        if (operation.type === 'apply_layout_template') {
          const currentIds = new Set(sandboxSpread.slots.map((slot) => slot.id))
          const targetIds = new Set(operation.targetSlotIds)
          const targetsMatch = currentIds.size === targetIds.size
            && [...currentIds].every((slotId) => targetIds.has(slotId))
          if (!targetsMatch) {
            issues.push(issue(operation, 'invalid_template_targets', 'Layout template must target every slot in the current spread'))
            continue
          }
          if (operation.options && Object.keys(operation.options).length > 0) {
            issues.push(issue(operation, 'unsupported_template_options', 'This Zine host does not support layout template options'))
            continue
          }
          const templateAllowed = sandboxSpread.role === 'cover'
            ? operation.templateId === ZINE_COVER_TEMPLATE.id
            : ZINE_TEMPLATES.some((template) => template.id === operation.templateId)
          if (!templateAllowed) {
            issues.push(issue(operation, 'template_not_found', `Template ${operation.templateId} is unavailable for this spread`))
            continue
          }
          const { pageW, pageH } = getSpreadSize(
            liveProject.pageSize,
            liveProject.pageOrientation,
            liveProject.customSizeMm,
          )
          const replacement = buildSpreadFromTemplate(operation.templateId, pageW, pageH, {
            role: sandboxSpread.role,
            bleedMm: getProjectBleedMm(liveProject),
          })
          const before = sandboxSpread.slots.map(slotToJson)
          sandboxSpread = { ...replacement, id: sandboxSpread.id, role: sandboxSpread.role }
          changeEntries.push({
            operation: operation.type,
            targetId: sandboxSpread.id,
            targetLabel: 'spread layout',
            category: 'layout',
            before,
            after: sandboxSpread.slots.map(slotToJson),
          })
          continue
        }

        const slotIndex = sandboxSpread.slots.findIndex((slot) => slot.id === operation.slotId)
        const slot = sandboxSpread.slots[slotIndex]
        if (!slot) {
          issues.push(issue(operation, 'slot_not_found', `Slot ${operation.slotId} was not found`))
          continue
        }

        if (operation.type === 'delete_slot') {
          sandboxSpread.slots.splice(slotIndex, 1)
          changeEntries.push({
            operation: operation.type,
            targetId: slot.id,
            targetLabel: `${slot.kind} slot`,
            category: 'structure',
            before: slotToJson(slot),
          })
          continue
        }

        if (operation.type === 'set_slot_attrs') {
          const attrs = operation.attrs as Readonly<Record<string, unknown>>
          const attrError = validateSlotAttrs(slot, attrs)
          if (attrError) {
            issues.push(issue(operation, 'invalid_slot_attrs', attrError))
            continue
          }
          const before: Record<string, JsonValue> = {}
          const after: Record<string, JsonValue> = {}
          for (const [key, value] of Object.entries(attrs)) {
            before[key] = slotToJson(slot)[key]
            after[key] = value as JsonValue
          }
          sandboxSpread.slots[slotIndex] = { ...slot, ...attrs } as Slot
          changeEntries.push({
            operation: operation.type,
            targetId: slot.id,
            targetLabel: `${slot.kind} slot`,
            category: slot.kind === 'text' ? 'content' : 'layout',
            before,
            after,
          })
          continue
        }

        if (operation.type === 'assign_asset') {
          if (slot.kind !== 'image') {
            issues.push(issue(operation, 'slot_kind_mismatch', 'Assets can only be assigned to image slots'))
            continue
          }
          if (!liveProject.assets.some((asset) => asset.id === operation.assetId)) {
            issues.push(issue(operation, 'asset_not_found', `Asset ${operation.assetId} is not in this project`))
            continue
          }
          sandboxSpread.slots[slotIndex] = { ...slot, assetId: operation.assetId }
          changeEntries.push({
            operation: operation.type,
            targetId: slot.id,
            targetLabel: 'image slot',
            category: 'asset',
            before: slot.assetId,
            after: operation.assetId,
          })
          continue
        }

        if (operation.type === 'set_image_crop') {
          if (slot.kind !== 'image') {
            issues.push(issue(operation, 'slot_kind_mismatch', 'Image crop can only be changed on image slots'))
            continue
          }
          sandboxSpread.slots[slotIndex] = {
            ...slot,
            imageTransform: { ...operation.crop },
          }
          changeEntries.push({
            operation: operation.type,
            targetId: slot.id,
            targetLabel: 'image crop',
            category: 'asset',
            before: { ...slot.imageTransform },
            after: { ...operation.crop },
          })
          continue
        }

        sandboxSpread.slots[slotIndex] = { ...slot, zIndex: operation.zIndex }
        changeEntries.push({
          operation: operation.type,
          targetId: slot.id,
          targetLabel: `${slot.kind} layer`,
          category: 'layout',
          before: slot.zIndex,
          after: operation.zIndex,
        })
      }

      if (issues.length > 0) return failedSimulation(liveSnapshot, issues)
      const nextProject: ZineProject = {
        ...liveProject,
        spreads: liveProject.spreads.map((spread) => (
          spread.id === targetSpreadId ? sandboxSpread : spread
        )),
      }
      const resultSnapshot = createSnapshot(nextProject, targetSpreadId)
      const result: EditorAiSimulationResult<ZineDocumentSnapshot> = {
        snapshot: resultSnapshot,
        resultRevision: resultSnapshot.revision,
        issues: [],
        changeEntries,
      }
      successfulSimulations.set(result, {
        operationsRevision: operationsRevision(operations),
        spread: cloneSpreads([sandboxSpread])[0],
      })
      return result
    },

    async commit(batch, simulation): Promise<EditorAiCommitResult> {
      if (taskHistory.has(batch.taskId)) {
        throw new EditorAiExecutionError('invalid_operation_batch', `Zine task ${batch.taskId} was already committed`)
      }
      if (
        batch.target.documentId !== projectId
        || batch.target.spreadId !== targetSpreadId
      ) {
        throw new EditorAiExecutionError('invalid_operation_batch', 'Zine operation batch targets another project or spread')
      }
      if (hasEditorAiValidationErrors(simulation.issues)) {
        throw new EditorAiExecutionError('validation_failed', 'Zine simulation contains validation errors', {
          issues: simulation.issues,
        })
      }
      const successful = successfulSimulations.get(simulation)
      if (!successful || successful.operationsRevision !== operationsRevision(batch.operations)) {
        throw new EditorAiExecutionError('validation_failed', 'Zine operation batch does not match its host simulation')
      }
      const before = currentSnapshot()
      assertEditorAiRevision(batch.baseRevision, before.revision)
      assertEditorAiRevision(simulation.resultRevision, simulation.snapshot.revision)

      const store = useZineStore.getState()
      if (!store.applyAiSpread(batch.taskId, projectId, successful.spread)) {
        throw new EditorAiExecutionError('commit_failed', 'Zine store rejected the atomic AI spread commit')
      }
      const committed = currentSnapshot()
      assertEditorAiRevision(simulation.resultRevision, committed.revision)
      taskHistory.set(batch.taskId, {
        baseRevision: batch.baseRevision,
        resultRevision: committed.revision,
        appliedUndoDepth: useZineStore.getState().undoStack.length,
        state: 'applied',
      })
      const saved = await useZineStore.getState().save()
      return {
        resultRevision: committed.revision,
        historyEntryId: `zine-ai:${batch.taskId}`,
        saved,
        ...(!saved ? { saveError: 'Zine draft save failed' } : {}),
      }
    },

    lock(taskId) {
      if (!useZineStore.getState().lockAiTask(taskId)) {
        throw new EditorAiExecutionError('commit_failed', 'Another Zine AI task already owns the editor')
      }
    },

    unlock(taskId) {
      if (!useZineStore.getState().unlockAiTask(taskId)) {
        throw new EditorAiExecutionError('commit_failed', `Zine AI task ${taskId} does not own the editor lock`)
      }
    },

    getTaskHistoryState(taskId) {
      return historyState(taskId)
    },

    undoTask(taskId) {
      const before = historyState(taskId)
      if (!before?.canUndo) return false
      useZineStore.getState().undo()
      const after = historyState(taskId)
      return after?.state === 'undone'
    },

    redoTask(taskId) {
      const before = historyState(taskId)
      if (!before?.canRedo) return false
      useZineStore.getState().redo()
      const after = historyState(taskId)
      return after?.state === 'redone'
    },
  }
}
