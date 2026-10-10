import { BrowserWindow, Menu, type MenuItemConstructorOptions, ipcMain } from 'electron'
import {
  channels,
  type TextCheckOptions,
  type TextIssue,
  type TextMenuAction,
  type TextMenuIssue
} from '../shared/ipc'
import { sendMenuCommand } from './document'

interface NativeTextChecker {
  check: (texts: string[], options: TextCheckOptions) => Promise<TextIssue[][]>
  guesses: (word: string) => string[]
}

// The operating system's spelling and grammar checker: NSSpellChecker on macOS, through a native
// module. Elsewhere there is none, and nothing is checked.
function loadChecker(): NativeTextChecker | null {
  if (process.platform !== 'darwin') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('text-checker')
  } catch (error) {
    console.error('Could not load the text checker', error)
    return null
  }
}

const checker = loadChecker()

const maxSuggestions = 6

function issueItems(
  issue: TextMenuIssue,
  choose: (action: TextMenuAction) => void
): MenuItemConstructorOptions[] {
  const suggestions =
    issue.kind === 'spelling' ? (checker?.guesses(issue.text) ?? []) : (issue.corrections ?? [])
  const items: MenuItemConstructorOptions[] = []
  if (issue.message) items.push({ label: issue.message, enabled: false })
  if (suggestions.length === 0 && issue.kind === 'spelling') {
    items.push({ label: 'No Guesses Found', enabled: false })
  }
  for (const text of suggestions.slice(0, maxSuggestions)) {
    items.push({ label: text, click: () => choose({ type: 'replace', text }) })
  }
  items.push({ type: 'separator' })
  if (issue.kind === 'spelling') {
    items.push({ label: 'Add to Dictionary', click: () => choose({ type: 'learn' }) })
  }
  items.push(
    {
      label: issue.kind === 'spelling' ? 'Ignore Spelling' : 'Ignore Grammar',
      click: () => choose({ type: 'ignore' })
    },
    { type: 'separator' }
  )
  return items
}

// The editor's context menu: suggestions for the issue under the pointer, then the edit commands.
function showTextMenu(window: BrowserWindow, issue: TextMenuIssue | null): Promise<TextMenuAction> {
  return new Promise((resolve) => {
    // A promise settles only once, so whichever comes first wins.
    const choose = (action: TextMenuAction): void => resolve(action)
    const template: MenuItemConstructorOptions[] = [
      ...(issue ? issueItems(issue, choose) : []),
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' },
      ...(checker
        ? ([
            { type: 'separator' },
            { label: 'Edit Dictionary…', click: () => sendMenuCommand('open-settings') }
          ] satisfies MenuItemConstructorOptions[])
        : [])
    ]
    // The menu may close before its item's click handler runs, so give it a moment.
    Menu.buildFromTemplate(template).popup({
      window,
      callback: () => setTimeout(() => resolve(null), 100)
    })
  })
}

export const textCheckAvailable = (): boolean => checker !== null

export function registerTextCheckHandlers(): void {
  ipcMain.handle(channels.textCheckAvailable, () => textCheckAvailable())
  ipcMain.handle(channels.checkText, (_event, texts: string[], options: TextCheckOptions) =>
    checker && (options.spelling || options.grammar)
      ? checker.check(texts, options)
      : texts.map(() => [])
  )
  ipcMain.handle(channels.showTextMenu, (event, issue: TextMenuIssue | null) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? showTextMenu(window, issue) : null
  })
}
