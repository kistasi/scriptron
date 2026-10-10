import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import type { Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

// The find & replace panel above the page, opened with Ctrl/Cmd+F, styled like the toolbar.
const searchTheme = EditorView.theme({
  '.cm-panels': {
    background: 'var(--sidebar)',
    color: 'var(--sidebar-ink)',
    font: 'var(--ui-font-size) / 1.35 system-ui, -apple-system, sans-serif'
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--sidebar-border)' },
  '.cm-panel.cm-search': { padding: '6px 2em 6px 8px' },
  '.cm-panel.cm-search label': { fontSize: 'inherit' },
  '.cm-panel.cm-search [name=close]': {
    color: 'var(--sidebar-muted)',
    fontSize: '1.3em',
    top: '4px',
    right: '8px'
  },
  '.cm-textfield': {
    fontSize: 'inherit',
    padding: '2px 6px',
    border: '1px solid var(--sidebar-border)',
    borderRadius: '6px',
    background: 'var(--sidebar-field)',
    color: 'var(--sidebar-ink)'
  },
  '.cm-textfield:focus': { outline: '2px solid var(--accent)', outlineOffset: '-1px' },
  '.cm-button': {
    fontSize: 'inherit',
    padding: '2px 8px',
    border: '1px solid var(--sidebar-border)',
    borderRadius: '6px',
    backgroundImage: 'none',
    background: 'var(--sidebar-field)',
    color: 'var(--sidebar-ink)',
    cursor: 'pointer'
  },
  '.cm-button:hover': { background: 'var(--sidebar-hover)' },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)',
    borderRadius: '2px'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 50%, transparent)'
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)' }
})

export function screenplaySearch(): Extension {
  return [search({ top: true }), highlightSelectionMatches(), keymap.of(searchKeymap), searchTheme]
}
