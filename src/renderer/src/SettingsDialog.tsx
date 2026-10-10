import React, { useEffect, useRef, useState } from 'react'
import {
  appearances,
  defaultSettings,
  editorFontSizes,
  type Settings,
  uiFontSizes
} from '../../shared/ipc'

interface SettingsDialogProps {
  settings: Settings
  // Whether the operating system can check spelling and grammar (macOS only).
  textCheckAvailable: boolean
  onChange: (changes: Partial<Settings>) => void
  onClose: () => void
}

const capitalized = (text: string): string => text[0].toUpperCase() + text.slice(1)

// Changes apply as soon as they are made; there is nothing to confirm.
export function SettingsDialog({
  settings,
  textCheckAvailable,
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

        {textCheckAvailable && <SpellingSettings settings={settings} onChange={onChange} />}

        <div className="settings-buttons">
          <button type="button" className="settings-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

interface SpellingSettingsProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
}

// The checker's switches, and the user's dictionary, which the main process keeps tidy.
function SpellingSettings({ settings, onChange }: SpellingSettingsProps): React.JSX.Element {
  const [newWord, setNewWord] = useState('')
  const words = newWord.trim().split(/\s+/).filter(Boolean)

  const addWords = (event: React.FormEvent): void => {
    event.preventDefault()
    if (words.length === 0) return
    onChange({ dictionary: [...settings.dictionary, ...words] })
    setNewWord('')
  }

  return (
    <>
      <h3 className="settings-section">Spelling and Grammar</h3>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.checkSpelling}
          onChange={(event) => onChange({ checkSpelling: event.target.checked })}
        />
        Check spelling while typing
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.checkGrammar}
          onChange={(event) => onChange({ checkGrammar: event.target.checked })}
        />
        Check grammar
      </label>

      <h3 className="settings-section" id="dictionary-label">
        Dictionary
      </h3>
      <p className="settings-hint">
        Words added here are never marked as misspelled, on top of the system dictionary.
        Characters&apos; names are accepted automatically.
      </p>
      <form className="settings-dictionary-add" onSubmit={addWords}>
        <input
          type="text"
          className="settings-field"
          aria-label="New word"
          placeholder="Add a word"
          spellCheck={false}
          value={newWord}
          onChange={(event) => setNewWord(event.target.value)}
        />
        <button type="submit" className="settings-button" disabled={words.length === 0}>
          Add
        </button>
      </form>
      {settings.dictionary.length > 0 && (
        <ul className="settings-words" aria-labelledby="dictionary-label">
          {settings.dictionary.map((word) => (
            <li key={word} className="settings-word">
              <span>{word}</span>
              <button
                type="button"
                title={`Remove “${word}”`}
                aria-label={`Remove ${word}`}
                onClick={() =>
                  onChange({ dictionary: settings.dictionary.filter((other) => other !== word) })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
