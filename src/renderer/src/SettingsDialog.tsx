import React, { useEffect, useRef } from 'react'
import {
  appearances,
  defaultSettings,
  editorFontSizes,
  type Settings,
  uiFontSizes
} from '../../shared/ipc'

interface SettingsDialogProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
  onClose: () => void
}

const capitalized = (text: string): string => text[0].toUpperCase() + text.slice(1)

// Changes apply as soon as they are made; there is nothing to confirm.
export function SettingsDialog({
  settings,
  onChange,
  onClose
}: SettingsDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Restores focus (to the editor, usually) when the dialog closes.
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('input:checked')?.focus()
    return () => previous?.focus()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  const sizeSelect = (
    key: 'uiFontSize' | 'editorFontSize',
    sizes: number[],
    unit: string
  ): React.JSX.Element => (
    <select
      id={key}
      className="settings-select"
      value={settings[key]}
      onChange={(event) => onChange({ [key]: Number(event.target.value) })}
    >
      {sizes.map((size) => (
        <option key={size} value={size}>
          {size} {unit}
          {size === defaultSettings[key] ? ' (default)' : ''}
        </option>
      ))}
    </select>
  )

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id="settings-title" className="settings-title">
          Settings
        </h2>

        <div className="settings-row">
          <span className="settings-label" id="appearance-label">
            Appearance
          </span>
          <div className="settings-segments" role="radiogroup" aria-labelledby="appearance-label">
            {appearances.map((appearance) => (
              <label key={appearance} className="settings-segment">
                <input
                  type="radio"
                  name="appearance"
                  value={appearance}
                  checked={settings.appearance === appearance}
                  onChange={() => onChange({ appearance })}
                />
                <span>{capitalized(appearance)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label" htmlFor="uiFontSize">
            Interface text size
          </label>
          {sizeSelect('uiFontSize', uiFontSizes, 'px')}
        </div>

        <div className="settings-row">
          <label className="settings-label" htmlFor="editorFontSize">
            Screenplay text size
          </label>
          {sizeSelect('editorFontSize', editorFontSizes, 'pt')}
        </div>
        <p className="settings-hint">
          The page scales with the text, so lines and page breaks stay as printed. Exported PDFs
          always use 12 pt.
        </p>

        <div className="settings-buttons">
          <button type="button" className="settings-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
