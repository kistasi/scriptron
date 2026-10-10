import React from 'react'
import type { Emphasis } from './emphasis'

export type ToolbarCommand = Emphasis | 'centered' | 'page-break'

const isMac = navigator.platform.startsWith('Mac')
const mod = isMac ? '⌘' : 'Ctrl+'

interface ToolbarButton {
  command: ToolbarCommand
  label: string
  shortcut?: string
  glyph: React.ReactNode
  // Inserts something rather than applying a style, so it is never shown as pressed.
  action?: boolean
}

// Groups of buttons, separated by a divider.
const groups: ToolbarButton[][] = [
  [
    { command: 'bold', label: 'Bold', shortcut: `${mod}B`, glyph: <b>B</b> },
    { command: 'italic', label: 'Italic', shortcut: `${mod}I`, glyph: <i>I</i> },
    { command: 'underline', label: 'Underline', shortcut: `${mod}U`, glyph: <u>U</u> },
    { command: 'note', label: 'Note', glyph: '[[ ]]' }
  ],
  [
    { command: 'centered', label: 'Centered', glyph: '> <' },
    { command: 'page-break', label: 'Page Break', glyph: '===', action: true }
  ]
]

interface ToolbarProps {
  // The formats at the selection, shown as pressed.
  active: Set<ToolbarCommand>
  onCommand: (command: ToolbarCommand) => void
}

// Formatting buttons above the page; they apply Fountain markup to the selected text.
export function Toolbar({ active, onCommand }: ToolbarProps): React.JSX.Element {
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {groups.map((group, index) => (
        <div key={index} className="toolbar-group">
          {group.map(({ command, label, shortcut, glyph, action }) => (
            <button
              key={command}
              type="button"
              className="toolbar-button"
              title={shortcut ? `${label} (${shortcut})` : label}
              aria-label={label}
              aria-pressed={action ? undefined : active.has(command)}
              // Keeps the focus, and with it the selection, in the editor.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onCommand(command)}
            >
              {glyph}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
