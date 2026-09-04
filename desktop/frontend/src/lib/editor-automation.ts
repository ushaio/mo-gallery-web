import { EventsOn } from '../../wailsjs/runtime/runtime'

import type { NarrativeTipTapEditorHandle } from '@mo-gallery/tiptap-editor'

type EditorKind = 'story' | 'blog'
type DocumentSource = 'draft' | 'database'

const MENU_PATHS = {
  home: '/home',
  library: '/library?source=local',
  'local-library': '/library?source=local',
  'cloud-library': '/library?source=cloud',
  photos: '/library?source=cloud',
  albums: '/library?source=cloud&view=albums',
  'film-rolls': '/library?source=cloud&view=film-rolls',
  upload: '/upload',
  'photo-journal': '/photo-journal',
  design: '/design',
  'ai-assistant': '/ai-assistant',
  inspiration: '/inspiration',
  storage: '/storage',
  settings: '/settings',
  friends: '/friends',
} as const

interface AutomationCommand {
  id: string
  method: string
  params?: Record<string, unknown>
}

interface AutomationTarget {
  documentId: string
  documentKind: EditorKind
  handle: NarrativeTipTapEditorHandle
  registeredAt: number
}

interface AutomationAppBridge {
  CompleteAutomationCommand(requestId: string, result: string): Promise<void>
}

const targets = new Map<string, AutomationTarget>()
let unsubscribe: (() => void) | null = null
let navigateApp: ((path: string) => void) | null = null
let readLocation: (() => { path: string; menu: string; search: string }) | null = null

function targetKey(documentKind: EditorKind, documentId: string) {
  return `${documentKind}:${documentId}`
}

function appBridge(): AutomationAppBridge | null {
  const app = (window as unknown as {
    go?: { main?: { App?: Partial<AutomationAppBridge> } }
  }).go?.main?.App
  return typeof app?.CompleteAutomationCommand === 'function'
    ? app as AutomationAppBridge
    : null
}

function resolveTarget(params: Record<string, unknown>): AutomationTarget | null {
  const documentId = typeof params.documentId === 'string' ? params.documentId : ''
  const documentKind = params.documentKind === 'blog' ? 'blog' : params.documentKind === 'story' ? 'story' : null
  if (documentId && documentKind) {
    return targets.get(targetKey(documentKind, documentId)) ?? null
  }
  if (documentId) {
    return [...targets.values()].find((target) => target.documentId === documentId) ?? null
  }
  return [...targets.values()].toSorted((a, b) => b.registeredAt - a.registeredAt)[0] ?? null
}

function targetDescriptor(target: AutomationTarget) {
  return {
    documentId: target.documentId,
    documentKind: target.documentKind,
    registeredAt: target.registeredAt,
  }
}

function editorHost(target: AutomationTarget) {
  const hostSelector = '.tiptap-editor[data-document-id="' + CSS.escape(target.documentId)
    + '"][data-document-kind="' + target.documentKind + '"]'
  const host = document.querySelector<HTMLElement>(hostSelector)
  if (!host) throw new Error('The target editor is unavailable')
  return host
}

function toolbarRoot(target: AutomationTarget) {
  const toolbar = editorHost(target).querySelector<HTMLFieldSetElement>('fieldset[data-automation-toolbar]')
  if (!toolbar) throw new Error('The target editor toolbar is unavailable')
  return toolbar
}

function listMetrics(target: AutomationTarget) {
  const host = editorHost(target)
  return Array.from(host.querySelectorAll<HTMLElement>('.tiptap li')).map((item, index) => {
    const list = item.parentElement
    const marker = getComputedStyle(item, '::marker')
    let listDepth = 0
    let current: Element | null = list
    while (current && !current.matches('.tiptap')) {
      if (current.matches('ul, ol')) listDepth += 1
      current = current.parentElement
    }
    return {
      index,
      text: item.innerText.trim(),
      listType: list?.tagName.toLowerCase() ?? null,
      depth: listDepth,
      liFontSize: getComputedStyle(item).fontSize,
      markerFontSize: marker.fontSize,
      liFontFamily: getComputedStyle(item).fontFamily,
      markerFontFamily: marker.fontFamily,
      inlineStyle: item.getAttribute('style') ?? '',
    }
  })
}

function toolbarState(target: AutomationTarget) {
  const toolbar = toolbarRoot(target)
  return {
    commands: Array.from(toolbar.querySelectorAll<HTMLElement>('[data-automation-command]')).map((control) => ({
      id: control.dataset.automationCommand,
      disabled: control.matches(':disabled'),
      pressed: control.getAttribute('aria-pressed'),
      expanded: control.getAttribute('aria-expanded'),
    })),
    selects: Array.from(toolbar.querySelectorAll<HTMLSelectElement>('select[data-automation-control]')).map((control) => ({
      id: control.dataset.automationControl,
      value: control.value,
      options: Array.from(control.options).map((option) => option.value),
      disabled: control.disabled,
    })),
  }
}

async function nextPaint() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

async function clickToolbarCommand(target: AutomationTarget, commandId: string) {
  const toolbar = toolbarRoot(target)
  const selector = 'button[data-automation-command="' + CSS.escape(commandId) + '"]'
  let control = toolbar.querySelector<HTMLButtonElement>(selector)
  if (!control && (commandId === 'textColor' || commandId === 'backgroundColor')) {
    toolbar.querySelector<HTMLButtonElement>('button[data-automation-command="formatMenu"]')?.click()
    await nextPaint()
    control = toolbar.querySelector<HTMLButtonElement>(selector)
  }
  if (!control) throw new Error('Toolbar command is unavailable: ' + commandId)
  if (control.disabled) throw new Error('Toolbar command is disabled: ' + commandId)
  control.click()
  await nextPaint()
}

async function selectToolbarValue(target: AutomationTarget, controlId: string, value: string) {
  const selector = 'select[data-automation-control="' + CSS.escape(controlId) + '"]'
  const control = toolbarRoot(target).querySelector<HTMLSelectElement>(selector)
  if (!control) throw new Error('Toolbar select is unavailable: ' + controlId)
  if (control.disabled) throw new Error('Toolbar select is disabled: ' + controlId)
  if (!Array.from(control.options).some((option) => option.value === value)) {
    throw new Error('Unsupported ' + controlId + ' value: ' + value)
  }
  control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  control.value = value
  control.dispatchEvent(new Event('change', { bubbles: true }))
  await nextPaint()
}

async function setToolbarColor(target: AutomationTarget, kind: 'textColor' | 'backgroundColor', value: string) {
  await clickToolbarCommand(target, kind)
  const menuSelector = '[data-automation-color-menu="' + kind + '"]'
  const menu = document.querySelector<HTMLElement>(menuSelector)
  if (!menu) throw new Error(kind + ' picker is unavailable')
  const preset = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[data-automation-color]'))
    .find((button) => button.dataset.automationColor?.toLowerCase() === value.toLowerCase())
  if (preset) {
    preset.click()
    await nextPaint()
    return
  }
  const input = menu.querySelector<HTMLInputElement>('input[data-automation-color-input="' + kind + '"]')
  const confirm = menu.querySelector<HTMLButtonElement>('button[data-automation-color-confirm="' + kind + '"]')
  if (!input || !confirm) throw new Error(kind + ' custom color controls are unavailable')
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await nextPaint()
  confirm.click()
  await nextPaint()
}

async function waitForTarget(documentKind: EditorKind, documentId: string) {
  const key = targetKey(documentKind, documentId)
  const deadline = Date.now() + 7000
  while (Date.now() < deadline) {
    const target = targets.get(key)
    if (target) return target
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${documentKind} editor ${documentId}`)
}

async function executeCommand(command: AutomationCommand) {
  const params = command.params ?? {}
  if (command.method === 'status') {
    const availableTargets = [...targets.values()]
      .toSorted((a, b) => b.registeredAt - a.registeredAt)
      .map(targetDescriptor)
    return { availableTargets, activeTarget: availableTargets[0] ?? null }
  }

  if (command.method === 'navigate') {
    const menu = typeof params.menu === 'string' ? params.menu : ''
    const path = MENU_PATHS[menu as keyof typeof MENU_PATHS]
    if (!path) throw new Error(`Unsupported Emulsion menu: ${menu}`)
    if (!navigateApp) throw new Error('Emulsion navigation is not ready')
    navigateApp(path)
    return { menu, path }
  }

  if (command.method === 'location') {
    if (!readLocation) throw new Error('Emulsion location is not ready')
    const location = readLocation()
    const availableTargets = [...targets.values()]
      .toSorted((a, b) => b.registeredAt - a.registeredAt)
      .map(targetDescriptor)
    return { ...location, activeTarget: availableTargets[0] ?? null }
  }

  if (command.method === 'open_document') {
    const documentId = typeof params.documentId === 'string' ? params.documentId.trim() : ''
    const documentKind = params.documentKind === 'blog' ? 'blog' : params.documentKind === 'story' ? 'story' : null
    const source: DocumentSource = params.source === 'database' ? 'database' : 'draft'
    if (!documentId || !documentKind) throw new Error('documentId and documentKind are required')
    if (!navigateApp) throw new Error('Emulsion navigation is not ready')

    const query = new URLSearchParams({
      automationDocument: documentId,
      automationKind: documentKind,
      automationSource: source,
    })
    navigateApp(`/photo-journal?${query.toString()}`)
    // Let React Router commit the query change and the editor host apply the
    // requested source before reading the target state. Story and blog tabs
    // stay mounted while hidden, so the existing target may otherwise be
    // returned before its source-switch effect runs.
    await new Promise((resolve) => window.setTimeout(resolve, 100))
    const target = await waitForTarget(documentKind, documentId)
    target.handle.focus()
    return {
      target: targetDescriptor(target),
      source,
      state: target.handle.getAutomationState(),
    }
  }

  const target = resolveTarget(params)
  if (!target) {
    throw new Error('No active TipTap editor matches the requested document')
  }

  const before = target.handle.getAutomationState()
  switch (command.method) {
    case 'focus':
      target.handle.focus()
      break
    case 'set_content': {
      const content = typeof params.content === 'string' ? params.content : ''
      target.handle.setValue(content)
      break
    }
    case 'type_text': {
      if (typeof params.text !== 'string') throw new Error('text must be a string')
      if (!target.handle.automationTypeText(params.text)) throw new Error('Editor rejected text input')
      break
    }
    case 'press_key': {
      if (typeof params.key !== 'string' || !params.key) throw new Error('key must be a non-empty string')
      target.handle.automationPressKey({
        key: params.key,
        code: typeof params.code === 'string' ? params.code : undefined,
        ctrlKey: params.ctrlKey === true,
        altKey: params.altKey === true,
        shiftKey: params.shiftKey === true,
        metaKey: params.metaKey === true,
      })
      break
    }
    case 'set_selection': {
      const from = typeof params.from === 'number' ? params.from : NaN
      const to = typeof params.to === 'number' ? params.to : from
      if (!target.handle.automationSetSelection(from, to)) throw new Error('Editor rejected selection')
      break
    }
    case 'get_state':
      break
    case 'toolbar_state':
      return { target: targetDescriptor(target), editor: before, toolbar: toolbarState(target) }
    case 'list_metrics':
      return { target: targetDescriptor(target), editor: before, lists: listMetrics(target) }
    case 'toolbar_click': {
      if (typeof params.commandId !== 'string' || !params.commandId) throw new Error('commandId is required')
      await clickToolbarCommand(target, params.commandId)
      break
    }
    case 'toolbar_select': {
      if (typeof params.controlId !== 'string' || typeof params.value !== 'string') {
        throw new Error('controlId and value are required')
      }
      await selectToolbarValue(target, params.controlId, params.value)
      break
    }
    case 'toolbar_color': {
      const kind = params.kind === 'backgroundColor' ? 'backgroundColor' : params.kind === 'textColor' ? 'textColor' : null
      if (!kind || typeof params.value !== 'string') throw new Error('kind and value are required')
      await setToolbarColor(target, kind, params.value)
      break
    }
    default:
      throw new Error(`Unsupported editor automation method: ${command.method}`)
  }

  return {
    target: targetDescriptor(target),
    before,
    after: target.handle.getAutomationState(),
    toolbar: toolbarState(target),
  }
}

function ensureAutomationListener() {
  if (unsubscribe) return
  unsubscribe = EventsOn('emulsion:automation:command', (rawCommand: unknown) => {
    const command = rawCommand as AutomationCommand
    const bridge = appBridge()
    if (!bridge || !command?.id) return

    void executeCommand(command)
      .then((data) => bridge.CompleteAutomationCommand(command.id, JSON.stringify({ ok: true, data })))
      .catch((error) => bridge.CompleteAutomationCommand(command.id, JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })))
  })
}

export function registerAutomationNavigator(navigate: (path: string) => void) {
  navigateApp = navigate
  return () => {
    if (navigateApp === navigate) navigateApp = null
  }
}

export function registerAutomationLocation(
  location: () => { path: string; menu: string; search: string },
) {
  readLocation = location
  return () => {
    if (readLocation === location) readLocation = null
  }
}

export function initializeEditorAutomation() {
  if (!appBridge()) return () => {}
  ensureAutomationListener()
  return () => {
    unsubscribe?.()
    unsubscribe = null
  }
}

export function registerEditorAutomationTarget(
  documentId: string,
  documentKind: EditorKind,
  handle: NarrativeTipTapEditorHandle,
) {
  ensureAutomationListener()
  const key = targetKey(documentKind, documentId)
  const target: AutomationTarget = { documentId, documentKind, handle, registeredAt: Date.now() }
  targets.set(key, target)

  return () => {
    if (targets.get(key) === target) targets.delete(key)
  }
}
