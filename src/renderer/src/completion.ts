import { autocompletion } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { characterCompletions } from './characterCompletion'
import { sceneHeadingCompletions, sceneTimeCompletions } from './sceneHeadingCompletion'

// Completes character cues from the names already in the script, adding (CONT'D) when the
// same character spoke last in the scene, and scene headings from their prefixes, locations and
// times of day.
export function screenplayCompletion(): Extension {
  return [
    autocompletion({
      override: [characterCompletions, sceneHeadingCompletions, sceneTimeCompletions],
      icons: false
    }),
    EditorView.theme({
      '.cm-tooltip.cm-tooltip-autocomplete': {
        background: 'var(--sidebar-field)',
        color: 'var(--sidebar-ink)',
        border: '1px solid var(--sidebar-border)',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgb(0 0 0 / 0.15)',
        overflow: 'hidden'
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: "'Courier Prime', Courier, monospace",
        fontSize: 'var(--ui-font-size)'
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px' },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        background: 'var(--accent)',
        color: '#fff'
      },
      '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: 'bold' }
    })
  ]
}
