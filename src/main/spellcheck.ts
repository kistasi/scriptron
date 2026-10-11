import { BrowserWindow, Menu, type MenuItemConstructorOptions, session } from 'electron'
import { sendMenuCommand } from './document'
import { getSettings, onSettingsChanged, updateSettings } from './settings'

// Chromium's spellchecker accepts a word if any of these languages does. On macOS it uses the
// system's checker instead, which detects the language by itself, so this list does not apply.
const languages = ['en-US', 'hu']

const maxSuggestions = 6

// Makes the session's custom dictionary hold exactly the user's dictionary from the settings.
async function syncDictionary(): Promise<void> {
  const spellchecker = session.defaultSession
  const words = new Set(getSettings().dictionary)
  const known = new Set(await spellchecker.listWordsInSpellCheckerDictionary())
  for (const word of words) {
    if (!known.has(word)) spellchecker.addWordToSpellCheckerDictionary(word)
  }
  for (const word of known) {
    if (!words.has(word)) spellchecker.removeWordFromSpellCheckerDictionary(word)
  }
}

export function setUpSpellchecker(): void {
  const available = session.defaultSession.availableSpellCheckerLanguages
  if (available.length > 0) {
    session.defaultSession.setSpellCheckerLanguages(
      languages.filter((language) => available.includes(language))
    )
  }
  const sync = (): void => {
    syncDictionary().catch((error) => console.error('Could not update the dictionary', error))
  }
  sync()
  onSettingsChanged(sync)
}

// The context menu for text fields: spelling suggestions for the word under the pointer, then
// the edit commands. Whether a field is checked at all is up to its spellcheck attribute.
export function attachContextMenu(window: BrowserWindow): void {
  const { webContents } = window
  webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    const word = params.misspelledWord
    const template: MenuItemConstructorOptions[] = []
    if (word) {
      const suggestions = params.dictionarySuggestions.slice(0, maxSuggestions)
      if (suggestions.length === 0) template.push({ label: 'No Guesses Found', enabled: false })
      for (const suggestion of suggestions) {
        template.push({
          label: suggestion,
          click: () => webContents.replaceMisspelling(suggestion)
        })
      }
      template.push(
        { type: 'separator' },
        {
          label: 'Add to Dictionary',
          // The dictionary syncs to the spellchecker once the settings change.
          click: () => updateSettings({ dictionary: [...getSettings().dictionary, word] })
        },
        { type: 'separator' }
      )
    }
    template.push(
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' }
    )
    if (getSettings().checkSpelling) {
      template.push(
        { type: 'separator' },
        { label: 'Edit Dictionary…', click: () => sendMenuCommand('open-settings') }
      )
    }
    Menu.buildFromTemplate(template).popup({ window })
  })
}
