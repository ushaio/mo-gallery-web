'use client'

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, Sparkles, Wand2, X } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  getStoryAiModels,
  streamStoryAiGenerate,
  type StoryAiAction,
  type StoryAiModelOption,
} from '@/lib/api'

export interface TipTapAiAssistantOptions {
  enabled: boolean
  token?: string | null
  title?: string
}

export interface TipTapAiAssistantContext {
  selectionRange: { from: number; to: number } | null
  hasSelection: boolean
  selectedText: string
  currentParagraph: string
  contextBefore: string
  contextAfter: string
}

export type TipTapAiApplyMode = 'replace' | 'insert' | 'append'

interface TipTapAiAssistantProps {
  options?: TipTapAiAssistantOptions
  context: TipTapAiAssistantContext
  onApplyResult: (
    mode: TipTapAiApplyMode,
    preview: string,
    selectionRange: TipTapAiAssistantContext['selectionRange'],
  ) => void
  onSyncContext?: () => void
}

const AI_SELECTION_PREVIEW_LIMIT = 28
const AI_MODELS_STORAGE_KEY = 'tiptap-editor-ai-models'
const AI_SELECTED_MODEL_STORAGE_KEY = 'tiptap-editor-ai-selected-model'

const AI_PRESET_ACTIONS: Array<{ action: StoryAiAction; key: string }> = [
  { action: 'rewrite', key: 'rewrite' },
  { action: 'expand', key: 'expand' },
  { action: 'shorten', key: 'shorten' },
  { action: 'continue', key: 'continue' },
  { action: 'summarize', key: 'summarize' },
]

function compactTextPreview(input: string, limit: number) {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) {
    return normalized
  }

  const headLength = Math.ceil((limit - 3) / 2)
  const tailLength = Math.floor((limit - 3) / 2)
  return `${normalized.slice(0, headLength)}...${normalized.slice(normalized.length - tailLength)}`
}

export function TipTapAiAssistant({
  options,
  context,
  onApplyResult,
  onSyncContext,
}: TipTapAiAssistantProps) {
  const aiButtonRef = useRef<HTMLButtonElement | null>(null)
  const aiPanelRef = useRef<HTMLDivElement | null>(null)
  const aiModelButtonRef = useRef<HTMLDivElement | null>(null)
  const aiModelMenuRef = useRef<HTMLDivElement | null>(null)
  const aiModelListRef = useRef<HTMLDivElement | null>(null)
  const aiButtonPositionRef = useRef({ top: 0, left: 0 })
  const aiDragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originLeft: number
    originTop: number
    moved: boolean
  } | null>(null)
  const aiSuppressClickRef = useRef(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiPreview, setAiPreview] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiModelOptions, setAiModelOptions] = useState<StoryAiModelOption[]>([])
  const [aiSelectedModel, setAiSelectedModel] = useState('')
  const [aiModelsLoading, setAiModelsLoading] = useState(false)
  const [showAiModelMenu, setShowAiModelMenu] = useState(false)
  const [aiModelQuery, setAiModelQuery] = useState('')
  const [aiButtonPosition, setAiButtonPosition] = useState({ top: 0, left: 0 })
  const [aiPanelPosition, setAiPanelPosition] = useState({ top: 0, left: 0 })
  const [aiMode, setAiMode] = useState<StoryAiAction>('rewrite')
  const { t } = useLanguage()
  const aiModelMenuId = useId()

  const isEnabled = options?.enabled === true
  const aiSelectionPreview = useMemo(() => {
    if (!context.hasSelection || !context.selectedText) return ''
    return compactTextPreview(context.selectedText, AI_SELECTION_PREVIEW_LIMIT)
  }, [context.hasSelection, context.selectedText])
  const selectedAiModelLabel = useMemo(() => {
    return aiModelOptions.find((option) => option.id === aiSelectedModel)?.label
      ?? t('editor.ai_model_current_default')
  }, [aiModelOptions, aiSelectedModel, t])
  const filteredAiModelOptions = useMemo(() => {
    const query = aiModelQuery.trim().toLowerCase()
    if (!query) return aiModelOptions

    return aiModelOptions.filter((option) => option.label.toLowerCase().includes(query))
  }, [aiModelOptions, aiModelQuery])

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') return

    try {
      const cachedModels = window.localStorage.getItem(AI_MODELS_STORAGE_KEY)
      const cachedSelectedModel = window.localStorage.getItem(AI_SELECTED_MODEL_STORAGE_KEY)

      if (cachedModels) {
        const parsed = JSON.parse(cachedModels) as StoryAiModelOption[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAiModelOptions(parsed)
        } else {
          setAiModelOptions([])
        }
      } else {
        setAiModelOptions([])
      }

      if (cachedSelectedModel) {
        setAiSelectedModel(cachedSelectedModel)
      } else {
        setAiSelectedModel('')
      }
    } catch {
      setAiModelOptions([])
      setAiSelectedModel('')
    }
  }, [isEnabled])

  useEffect(() => {
    if (!aiSelectedModel || typeof window === 'undefined') return
    window.localStorage.setItem(AI_SELECTED_MODEL_STORAGE_KEY, aiSelectedModel)
  }, [aiSelectedModel])

  const refreshAiModels = useCallback(async () => {
    if (!isEnabled || !options?.token) {
      setAiError(t('editor.ai_missing_token'))
      return
    }

    setAiModelsLoading(true)
    setAiError('')

    try {
      const response = await getStoryAiModels(options.token)
      setAiModelOptions(response.models)
      setAiSelectedModel((current) => {
        const nextModel = current || response.defaultModel
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(AI_SELECTED_MODEL_STORAGE_KEY, nextModel)
          window.localStorage.setItem(AI_MODELS_STORAGE_KEY, JSON.stringify(response.models))
        }
        return nextModel
      })
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
    } finally {
      setAiModelsLoading(false)
    }
  }, [isEnabled, options?.token, t])

  const runAiAction = useCallback(async (action: StoryAiAction) => {
    if (!isEnabled) return
    if (!options?.token) {
      setAiError(t('editor.ai_missing_token'))
      return
    }

    setAiLoading(true)
    setAiError('')
    setAiPreview('')
    setAiMode(action)

    try {
      await streamStoryAiGenerate(options.token, {
        action,
        model: aiSelectedModel || undefined,
        prompt: aiPrompt.trim() || undefined,
        title: options.title,
        selectedText: context.selectedText || undefined,
        currentParagraph: context.currentParagraph || undefined,
        contextBefore: context.contextBefore || undefined,
        contextAfter: context.contextAfter || undefined,
      }, {
        onChunk: (chunk) => {
          setAiPreview((current) => current + chunk)
        },
      })
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
    } finally {
      setAiLoading(false)
    }
  }, [
    aiPrompt,
    aiSelectedModel,
    context.contextAfter,
    context.contextBefore,
    context.currentParagraph,
    context.selectedText,
    isEnabled,
    options?.title,
    options?.token,
    t,
  ])

  const updateAiPanelPosition = useCallback(() => {
    const buttonElement = aiButtonRef.current
    if (!buttonElement) return

    const rect = buttonElement.getBoundingClientRect()
    const panelWidth = 360
    const viewportPadding = 12
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - viewportPadding),
    )

    const nextPosition = {
      top: Math.max(viewportPadding, rect.top - 12),
      left,
    }

    if (aiPanelRef.current) {
      aiPanelRef.current.style.top = `${nextPosition.top}px`
      aiPanelRef.current.style.left = `${nextPosition.left}px`
    }

    setAiPanelPosition(nextPosition)
  }, [])

  const applyAiButtonPosition = useCallback((position: { top: number; left: number }) => {
    aiButtonPositionRef.current = position

    if (aiButtonRef.current) {
      aiButtonRef.current.style.top = `${position.top}px`
      aiButtonRef.current.style.left = `${position.left}px`
      aiButtonRef.current.style.right = 'auto'
      aiButtonRef.current.style.bottom = 'auto'
    }
  }, [])

  const clampAiButtonPosition = useCallback((left: number, top: number) => {
    const buttonElement = aiButtonRef.current
    const width = buttonElement?.offsetWidth || 160
    const height = buttonElement?.offsetHeight || 48
    const viewportPadding = 12

    return {
      left: Math.min(
        Math.max(viewportPadding, left),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      ),
      top: Math.min(
        Math.max(viewportPadding, top),
        Math.max(viewportPadding, window.innerHeight - height - viewportPadding),
      ),
    }
  }, [])

  const handleAiModelInputFocus = useCallback(() => {
    setAiModelQuery('')
    setShowAiModelMenu(true)
  }, [])

  const handleAiButtonPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const buttonElement = aiButtonRef.current
    if (!buttonElement) return

    event.preventDefault()
    onSyncContext?.()

    const rect = buttonElement.getBoundingClientRect()
    aiDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    }

    buttonElement.setPointerCapture(event.pointerId)
  }, [onSyncContext])

  const handleAiButtonPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = aiDragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const nextLeft = dragState.originLeft + (event.clientX - dragState.startX)
    const nextTop = dragState.originTop + (event.clientY - dragState.startY)
    const clamped = clampAiButtonPosition(nextLeft, nextTop)

    if (Math.abs(event.clientX - dragState.startX) > 4 || Math.abs(event.clientY - dragState.startY) > 4) {
      dragState.moved = true
      aiSuppressClickRef.current = true
    }

    applyAiButtonPosition(clamped)
    if (showAiPanel && aiPanelRef.current) {
      const panelWidth = aiPanelRef.current.offsetWidth || 360
      const viewportPadding = 12
      const buttonWidth = aiButtonRef.current?.offsetWidth || 160
      const left = Math.max(
        viewportPadding,
        Math.min(clamped.left + buttonWidth - panelWidth, window.innerWidth - panelWidth - viewportPadding),
      )
      const top = Math.max(viewportPadding, clamped.top - 12)
      aiPanelRef.current.style.top = `${top}px`
      aiPanelRef.current.style.left = `${left}px`
    }
  }, [applyAiButtonPosition, clampAiButtonPosition, showAiPanel])

  const handleAiButtonPointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = aiDragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    if (aiButtonRef.current?.hasPointerCapture(event.pointerId)) {
      aiButtonRef.current.releasePointerCapture(event.pointerId)
    }

    setAiButtonPosition(aiButtonPositionRef.current)
    if (showAiPanel) {
      updateAiPanelPosition()
    }
    aiDragStateRef.current = null
    window.setTimeout(() => {
      aiSuppressClickRef.current = false
    }, 0)
  }, [showAiPanel, updateAiPanelPosition])

  const handleAiButtonClick = useCallback(() => {
    if (aiSuppressClickRef.current) {
      return
    }
    setShowAiPanel((current) => !current)
  }, [])

  const handleApplyResult = useCallback((mode: TipTapAiApplyMode) => {
    if (!aiPreview.trim()) return

    onApplyResult(mode, aiPreview, context.selectionRange)
    setAiPreview('')
    setAiError('')
    setShowAiPanel(false)
  }, [aiPreview, context.selectionRange, onApplyResult])

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') return

    const buttonElement = aiButtonRef.current
    if (!buttonElement) return

    const rect = buttonElement.getBoundingClientRect()
    if (aiButtonPosition.top === 0 && aiButtonPosition.left === 0) {
      const nextPosition = {
        top: rect.top,
        left: rect.left,
      }
      aiButtonPositionRef.current = nextPosition
      setAiButtonPosition(nextPosition)
    }
  }, [aiButtonPosition.left, aiButtonPosition.top, isEnabled])

  useEffect(() => {
    if (!showAiPanel) return

    updateAiPanelPosition()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAiPanel(false)
      }
    }

    const handleViewportChange = () => {
      updateAiPanelPosition()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [showAiPanel, updateAiPanelPosition])

  useEffect(() => {
    if (!showAiModelMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (
        aiModelMenuRef.current?.contains(target)
        || aiModelButtonRef.current?.contains(target)
      ) {
        return
      }

      setShowAiModelMenu(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAiModelMenu(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showAiModelMenu])

  useEffect(() => {
    if (!showAiModelMenu) {
      setAiModelQuery('')
    }
  }, [showAiModelMenu])

  useEffect(() => {
    if (!showAiModelMenu) return
    if (aiModelQuery.trim()) return

    requestAnimationFrame(() => {
      const selectedOption = aiModelListRef.current?.querySelector<HTMLElement>('[data-ai-model-selected="true"]')
      selectedOption?.scrollIntoView({ block: 'nearest' })
    })
  }, [aiModelQuery, aiSelectedModel, showAiModelMenu])

  if (!isEnabled || typeof document === 'undefined') {
    return null
  }

  const aiPanel = showAiPanel
    ? createPortal(
        <div
          ref={aiPanelRef}
          className="fixed z-[140] flex h-[560px] w-[360px] flex-col rounded-2xl border border-border/80 bg-background/95 p-4 shadow-[0_24px_48px_rgba(15,23,42,0.16)] backdrop-blur"
          style={{
            top: aiPanelPosition.top,
            left: aiPanelPosition.left,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Wand2 className="h-4 w-4 text-primary" />
              {t('editor.ai_panel_title')}
            </div>
            <button
              type="button"
              onClick={() => setShowAiPanel(false)}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t('common.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {AI_PRESET_ACTIONS.map((item) => (
              <button
                key={item.action}
                type="button"
                onClick={() => setAiMode(item.action)}
                disabled={aiLoading}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  aiMode === item.action
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {t(`editor.ai_action_${item.key}`)}
              </button>
            ))}
          </div>

          <div
            className="mb-3 overflow-hidden rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground"
            title={context.hasSelection ? context.selectedText : undefined}
          >
            <span className="block whitespace-nowrap">
              {context.hasSelection ? aiSelectionPreview : t('editor.ai_scope_paragraph')}
            </span>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <div
                ref={aiModelButtonRef}
                className={`flex h-10 w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-[border-color,box-shadow,background-color] ${
                  showAiModelMenu
                    ? 'border-primary/50 bg-background shadow-[0_0_0_4px_rgba(59,130,246,0.08)]'
                    : 'border-border/80 bg-gradient-to-r from-background via-background to-muted/20 hover:border-primary/30'
                } ${aiModelsLoading || aiLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                role="combobox"
                aria-expanded={showAiModelMenu}
                aria-haspopup="listbox"
                aria-controls={aiModelMenuId}
              >
                <span className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={showAiModelMenu ? aiModelQuery : selectedAiModelLabel}
                    onFocus={handleAiModelInputFocus}
                    onChange={(event) => {
                      setAiModelQuery(event.target.value)
                      setShowAiModelMenu(true)
                    }}
                    onClick={() => setShowAiModelMenu(true)}
                    disabled={aiModelsLoading || aiLoading}
                    placeholder={aiModelsLoading ? t('editor.ai_models_loading') : t('editor.ai_model_search_placeholder')}
                    className="block h-5 w-full truncate bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => setShowAiModelMenu((current) => !current)}
                  disabled={aiModelsLoading || aiLoading}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
                  tabIndex={-1}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${showAiModelMenu ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              {showAiModelMenu ? (
                <div
                  ref={aiModelMenuRef}
                  id={aiModelMenuId}
                  className="absolute left-0 top-[calc(100%+8px)] z-20 max-h-56 w-full overflow-hidden rounded-2xl border border-border/80 bg-background/98 shadow-[0_20px_40px_rgba(15,23,42,0.16)] backdrop-blur"
                  role="listbox"
                >
                  <div ref={aiModelListRef} className="max-h-56 overflow-y-auto p-2">
                    {filteredAiModelOptions.length === 0 ? (
                      <div className="rounded-xl px-3 py-2 text-sm text-muted-foreground">
                        {aiModelsLoading ? t('editor.ai_models_loading') : t('editor.ai_models_empty')}
                      </div>
                    ) : (
                      filteredAiModelOptions.map((option) => {
                        const isSelected = option.id === aiSelectedModel
                        return (
                          <button
                            key={option.id}
                            type="button"
                            data-ai-model-selected={isSelected ? 'true' : undefined}
                            onClick={() => {
                              setAiSelectedModel(option.id)
                              setShowAiModelMenu(false)
                            }}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-muted/70'
                            }`}
                            title={option.label}
                          >
                            <span className="min-w-0 flex-1 truncate text-sm">{option.label}</span>
                            {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void refreshAiModels()}
              disabled={aiModelsLoading || aiLoading}
              className="inline-flex h-10 shrink-0 items-center rounded-2xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground transition-[border-color,background-color,color] hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiModelsLoading ? t('editor.ai_models_refreshing') : t('editor.ai_models_refresh')}
            </button>
          </div>

          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder={t('editor.ai_prompt_placeholder')}
            className="mb-3 h-24 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
          />

          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void runAiAction(aiMode)}
              disabled={aiLoading}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t('editor.ai_generate')}
            </button>
            {aiError ? <span className="text-xs text-destructive">{aiError}</span> : null}
          </div>

          <div className="mb-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-muted/10 p-3 text-sm text-foreground">
            {aiPreview ? (
              <div className="h-full overflow-y-auto whitespace-pre-wrap leading-6">{aiPreview}</div>
            ) : (
              <div className="h-full overflow-y-auto text-muted-foreground">{aiLoading ? t('editor.ai_generating') : t('editor.ai_preview_placeholder')}</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!aiPreview.trim() || !context.selectionRange}
              onClick={() => handleApplyResult('replace')}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('editor.ai_apply_replace')}
            </button>
            <button
              type="button"
              disabled={!aiPreview.trim()}
              onClick={() => handleApplyResult('insert')}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('editor.ai_apply_insert')}
            </button>
            <button
              type="button"
              disabled={!aiPreview.trim()}
              onClick={() => handleApplyResult('append')}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('editor.ai_apply_append')}
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  const aiFloatingButton = createPortal(
    <button
      ref={aiButtonRef}
      type="button"
      onPointerDown={handleAiButtonPointerDown}
      onPointerMove={handleAiButtonPointerMove}
      onPointerUp={handleAiButtonPointerUp}
      onPointerCancel={handleAiButtonPointerUp}
      onClick={handleAiButtonClick}
      className={`fixed z-[130] inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium backdrop-blur touch-none select-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.98] ${
        showAiPanel
          ? 'border-primary/35 bg-primary/12 text-primary shadow-[0_20px_40px_rgba(37,99,235,0.22)]'
          : 'border-primary/20 bg-background/95 text-foreground shadow-[0_18px_36px_rgba(15,23,42,0.18)] hover:border-primary/40 hover:bg-background hover:text-primary'
      }`}
      aria-pressed={showAiPanel}
      style={{
        top: aiButtonPosition.top || undefined,
        left: aiButtonPosition.left || undefined,
        right: aiButtonPosition.top || aiButtonPosition.left ? undefined : 20,
        bottom: aiButtonPosition.top || aiButtonPosition.left ? undefined : 20,
      }}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200 ${
          showAiPanel
            ? 'border-primary/30 bg-primary text-primary-foreground shadow-[0_0_18px_rgba(59,130,246,0.35)]'
            : 'border-primary/15 bg-primary/10 text-primary'
        }`}
      >
        <Sparkles className={`h-4 w-4 transition-transform duration-200 ${showAiPanel ? 'scale-110 rotate-12' : ''}`} />
      </span>
      <span className="tracking-[0.02em]">{t('editor.ai_button')}</span>
    </button>,
    document.body,
  )

  return (
    <>
      {aiFloatingButton}
      {aiPanel}
    </>
  )
}

export default TipTapAiAssistant
