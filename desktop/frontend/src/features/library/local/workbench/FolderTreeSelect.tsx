'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, ChevronRight, Folder, FolderOpen, Search } from 'lucide-react'
import type { FolderItem } from '../types'

/* ─── Tree types ─── */

interface TreeNode {
  id: string
  parentId?: string
  relativePath: string
  name: string
  depth: number
  children: TreeNode[]
}

/* ─── Tree builder ─── */

function buildTree(folders: FolderItem[]): TreeNode[] {
  const all = new Map<string, TreeNode>()
  for (const f of folders) {
    all.set(f.id, { ...f, depth: 0, children: [] })
  }

  const roots: TreeNode[] = []
  for (const node of all.values()) {
    if (node.parentId && all.has(node.parentId)) {
      const parent = all.get(node.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortByName = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach((n) => { if (n.children.length > 0) sortByName(n.children) })
  }
  sortByName(roots)

  return roots
}

/* ─── Flatten tree for rendering ─── */

interface FlatEntry {
  node: TreeNode
  hasChildren: boolean
  isExpanded: boolean
}

function flattenTree(roots: TreeNode[], expandedSet: Set<string>, depth = 0): FlatEntry[] {
  const result: FlatEntry[] = []
  for (const node of roots) {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedSet.has(node.id)
    result.push({ node, hasChildren, isExpanded })
    if (hasChildren && isExpanded) {
      result.push(...flattenTree(node.children, expandedSet, depth + 1))
    }
  }
  return result
}

/* ─── Props ─── */

interface FolderTreeSelectProps {
  value: string
  folders: FolderItem[]
  placeholder?: string
  searchPlaceholder?: string
  searchEmpty?: string
  emptyText?: string
  disabled?: boolean
  ariaLabel?: string
  onChange: (relativePath: string) => void
}

/* ─── Component ─── */

export function FolderTreeSelect({
  value,
  folders,
  placeholder = 'Root',
  searchPlaceholder = placeholder,
  searchEmpty = 'No matching folders',
  emptyText = 'No folders',
  disabled = false,
  ariaLabel,
  onChange,
}: FolderTreeSelectProps) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const roots = useMemo(() => buildTree(folders), [folders])

  const flatItems = useMemo(() => flattenTree(roots, expanded), [roots, expanded])

  // Search: flatten the whole tree (ignoring expansion) and filter by name/path
  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = useMemo<FlatEntry[]>(() => {
    if (!normalizedQuery) return flatItems
    const allNodes: TreeNode[] = []
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        allNodes.push(node)
        if (node.children.length > 0) walk(node.children)
      }
    }
    walk(roots)
    return allNodes
      .filter((node) => (
        node.name.toLowerCase().includes(normalizedQuery)
        || node.relativePath.toLowerCase().includes(normalizedQuery)
      ))
      .map((node) => ({ node, hasChildren: node.children.length > 0, isExpanded: false }))
  }, [normalizedQuery, roots, flatItems])

  // Auto-expand ancestors of the selected value when opening
  useEffect(() => {
    if (!open) return

    const selected = folders.find((f) => f.relativePath === value)
    if (!selected) return

    const toExpand = new Set(expanded)
    let current = selected
    const ancestors: string[] = []
    while (current.parentId) {
      ancestors.push(current.parentId)
      const parent = folders.find((f) => f.id === current.parentId)
      if (!parent) break
      current = parent
    }
    ancestors.reverse().forEach((id) => toExpand.add(id))
    setExpanded(toExpand)
    // Only run once when opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const toggleExpand = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const select = useCallback(
    (relativePath: string) => {
      onChange(relativePath)
      setOpen(false)
    },
    [onChange],
  )

  const selectedLabel = value === '' ? placeholder : value

  return (
    <div ref={rootRef} className="relative">
      {/* ── Trigger ── */}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="tree"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((v) => {
            if (!v) {
              setQuery('')
              setTimeout(() => searchRef.current?.focus(), 0)
            }
            return !v
          })
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs text-left outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--background)',
          color: value ? 'var(--foreground)' : 'var(--muted-foreground)',
        }}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronRight
          size={12}
          className="shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : '', color: 'var(--muted-foreground)' }}
        />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          ref={listRef}
          role="tree"
          className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Search box */}
          <div className="border-b px-2.5 py-2" style={{ borderColor: 'var(--border)' }}>
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--muted-foreground)' }}
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-8 w-full rounded-md border bg-input pl-7 pr-2.5 text-xs outline-none focus:border-primary"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>
          </div>

          {/* Root option */}
          <button
            type="button"
            role="treeitem"
            aria-selected={value === ''}
            onClick={() => select('')}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted/50"
            style={{ color: value === '' ? 'var(--primary)' : 'var(--foreground)' }}
          >
            <FolderOpen size={13} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />
            <span className="flex-1">{placeholder}</span>
            {value === '' && <CheckCircle size={12} className="shrink-0" style={{ color: 'var(--primary)' }} />}
          </button>

          {/* Tree items */}
          {filteredItems.map(({ node, hasChildren, isExpanded }) => {
            const isSelected = node.relativePath === value
            return (
              <div
                key={node.id}
                role="none"
                className="flex items-stretch"
              >
                {/* Indentation + tree connector line */}
                {node.depth > 0 && (
                  <>
                    <div className="shrink-0" style={{ width: node.depth * 20 }} />
                    <div className="relative shrink-0" style={{ width: 16 }}>
                      <span
                        className="absolute left-0 top-0 block h-full"
                        style={{ width: 1, backgroundColor: 'var(--border)' }}
                      />
                      <span
                        className="absolute left-0 top-1/2 block h-px"
                        style={{ width: 10, backgroundColor: 'var(--border)' }}
                      />
                    </div>
                  </>
                )}

                <div
                  role="treeitem"
                  aria-selected={isSelected}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  onClick={() => select(node.relativePath)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select(node.relativePath)
                    }
                  }}
                  tabIndex={0}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-2 pr-3 text-xs text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                  style={{ color: isSelected ? 'var(--primary)' : 'var(--foreground)' }}
                >
                  {/* Expand/collapse toggle (hidden while searching) */}
                  {hasChildren && !normalizedQuery ? (
                    <button
                      type="button"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      onClick={(e) => toggleExpand(node.id, e)}
                      className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted active:bg-muted/70"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      <ChevronRight
                        size={12}
                        className="transition-transform duration-150"
                        style={{ transform: isExpanded ? 'rotate(90deg)' : '' }}
                      />
                    </button>
                  ) : (
                    <span className="size-5 shrink-0" />
                  )}

                  <Folder size={12} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                  <span className="truncate">{node.name}</span>

                  {isSelected && (
                    <CheckCircle size={12} className="ml-auto shrink-0" style={{ color: 'var(--primary)' }} />
                  )}
                </div>
              </div>
            )
          })}

          {filteredItems.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {normalizedQuery ? searchEmpty : emptyText}
            </div>
          )}
        </div>
      )}
    </div>
  )
}