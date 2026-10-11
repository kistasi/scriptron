// The open documents, one per tab, and which one is shown.

import type { Session } from '../../../shared/ipc'

export interface Tab {
  // Identifies the tab, and keys its editor.
  id: number
  // null until the document has been saved somewhere.
  path: string | null
  name: string
  // What the editor was loaded with; the editor is uncontrolled.
  initialText: string
  text: string
  // The text as last saved or opened; the document has unsaved changes when it differs.
  savedText: string
  // The cursor's source line (0-based).
  cursorLine: number
}

export interface Tabs {
  tabs: Tab[]
  activeId: number
}

export interface NewDocument {
  id: number
  path: string | null
  // null for a new untitled document, which is named "Untitled", "Untitled 2", …
  name: string | null
  text: string
}

// What a new document starts with: a title page to fill in, then the screenplay.
export const NEW_SCRIPT = [
  'Title: ',
  'Credit: Written by',
  'Author:',
  'Draft date: {{date}}',
  'Contact:',
  '',
  ''
].join('\n')

// Where the cursor starts in a new document: ready to type the title.
export const NEW_SCRIPT_CURSOR = 'Title: '.length

export const isDirty = (tab: Tab): boolean => tab.text !== tab.savedText

export const activeTab = ({ tabs, activeId }: Tabs): Tab =>
  tabs.find((tab) => tab.id === activeId) ?? tabs[0]

// A new untitled document that hasn't been touched, which an opened file replaces.
const isBlank = (tab: Tab): boolean => tab.path === null && tab.text === NEW_SCRIPT && !isDirty(tab)

function untitledName(tabs: Tab[]): string {
  const names = new Set(tabs.map((tab) => tab.name))
  if (!names.has('Untitled')) return 'Untitled'
  let n = 2
  while (names.has(`Untitled ${n}`)) n++
  return `Untitled ${n}`
}

function createTab(tabs: Tab[], { id, path, name, text }: NewDocument): Tab {
  return {
    id,
    path,
    name: name ?? untitledName(tabs),
    initialText: text,
    text,
    savedText: text,
    cursorLine: 0
  }
}

export const initialTabs = (id: number): Tabs => {
  const tab = createTab([], { id, path: null, name: null, text: NEW_SCRIPT })
  return { tabs: [tab], activeId: tab.id }
}

// Opens the document in a new tab and shows it. A file that is already open is shown instead,
// and a blank untitled tab is replaced by an opened file.
export function openTab(state: Tabs, document: NewDocument): Tabs {
  const { tabs } = state
  const open = document.path !== null && tabs.find((tab) => tab.path === document.path)
  if (open) return { tabs, activeId: open.id }

  const current = activeTab(state)
  if (document.name !== null && isBlank(current)) {
    const others = tabs.filter((tab) => tab !== current)
    const tab = createTab(others, document)
    return { tabs: tabs.map((t) => (t === current ? tab : t)), activeId: tab.id }
  }

  const tab = createTab(tabs, document)
  return { tabs: [...tabs, tab], activeId: tab.id }
}

// Closes the tab, showing its neighbour if it was shown. Closing the last tab leaves a new
// untitled one, with id newId.
export function closeTab(state: Tabs, id: number, newId: number): Tabs {
  const index = state.tabs.findIndex((tab) => tab.id === id)
  if (index === -1) return state
  const tabs = state.tabs.filter((tab) => tab.id !== id)
  if (tabs.length === 0) return initialTabs(newId)
  if (state.activeId !== id) return { tabs, activeId: state.activeId }
  return { tabs, activeId: tabs[Math.min(index, tabs.length - 1)].id }
}

export function updateTab(state: Tabs, id: number, changes: Partial<Omit<Tab, 'id'>>): Tabs {
  if (!state.tabs.some((tab) => tab.id === id)) return state
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...changes } : tab))
  }
}

// Shows the tab offset tabs to the right (left when negative), wrapping around.
export function cycleTab(state: Tabs, offset: number): Tabs {
  const { tabs } = state
  const index = tabs.findIndex((tab) => tab.id === state.activeId)
  const next = (((index + offset) % tabs.length) + tabs.length) % tabs.length
  return { tabs, activeId: tabs[next].id }
}

// Moves the tab to index, shifting the tabs between.
export function moveTab(state: Tabs, id: number, index: number): Tabs {
  const tab = state.tabs.find((tab) => tab.id === id)
  if (!tab) return state
  const tabs = state.tabs.filter((t) => t !== tab)
  tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, tab)
  return { ...state, tabs }
}

// Opens the documents that were open when the app last ran, showing the one that was shown.
export function restoreTabs(
  state: Tabs,
  documents: NewDocument[],
  activePath: string | null
): Tabs {
  if (documents.length === 0) return state
  const restored = documents.reduce(openTab, state)
  const active = restored.tabs.find((tab) => tab.path !== null && tab.path === activePath)
  return active ? { ...restored, activeId: active.id } : restored
}

// What to remember about the tabs for the next launch: the files, in order, and the shown one.
export function sessionOf(state: Tabs): Session {
  return {
    paths: state.tabs.flatMap((tab) => (tab.path === null ? [] : [tab.path])),
    activePath: activeTab(state).path
  }
}
