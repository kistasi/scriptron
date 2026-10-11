import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { defaultSettings, type RecentDocument, type Settings } from '../../shared/ipc'
import { Editor, type EditorHandle } from './Editor'
import { PrintView } from './PrintView'
import { SettingsDialog } from './SettingsDialog'
import { Sidebar } from './Sidebar'
import { outlineScenes, sceneAt } from './lib/outline'
import { layoutScreenplay, type PrintedScreenplay } from './lib/printLayout'
import {
  activeTab,
  closeTab,
  cycleTab,
  NEW_SCRIPT,
  NEW_SCRIPT_CURSOR,
  noTabs,
  isDirty,
  moveTab,
  openTab,
  restoreTabs,
  sessionOf,
  showWelcome,
  updateTab,
  type Tab,
  type Tabs
} from './lib/tabs'
import { TabBar } from './TabBar'
import { Welcome } from './Welcome'

// Tab ids; each tab keys its own editor.
let nextTabId = 0

// The faces of the screenplay font, loaded before printing so the PDF doesn't fall back to another.
const printFonts = ['', 'bold ', 'italic ', 'bold italic '].map(
  (style) => `${style}12pt 'Courier Prime'`
)

// "Big Fish.fountain" → "Big Fish"
const baseName = (name: string): string => name.replace(/\.fountain$/i, '')

// Whether the sidebar is shown is remembered per machine; storage may be unavailable.
const sidebarKey = 'sidebar-visible'

function loadSidebarVisible(): boolean {
  try {
    return localStorage.getItem(sidebarKey) !== 'false'
  } catch {
    return true
  }
}

function App(): React.JSX.Element {
  const [state, setState] = useState<Tabs>(noTabs)
  // Set while exporting a PDF: the screenplay laid out for printing.
  const [printed, setPrinted] = useState<PrintedScreenplay | null>(null)
  const [sidebarVisible, setSidebarVisible] = useState(loadSidebarVisible)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Whether the tabs from the last launch have been reopened; until then, they aren't saved.
  const [restored, setRestored] = useState(false)
  const [recent, setRecent] = useState<RecentDocument[]>([])
  const [samples, setSamples] = useState<string[]>([])
  // The editor of each tab, by tab id.
  const editors = useRef(new Map<number, EditorHandle>())
  const { tabs, activeId } = state
  // null on the welcome screen.
  const doc = activeTab(state)
  const dirty = doc !== null && isDirty(doc)
  const anyDirty = tabs.some(isDirty)

  // Deferred so that typing isn't slowed down by re-outlining long screenplays.
  const outlinedText = useDeferredValue(doc?.text ?? '')
  const scenes = useMemo(() => outlineScenes(outlinedText.split('\n')), [outlinedText])
  const currentScene = sceneAt(scenes, doc?.cursorLine ?? 0)

  // Menu commands arrive outside React's render cycle and need the latest values.
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  }, [state])

  const newTab = useCallback((): void => {
    const id = nextTabId++
    setState((state) => openTab(state, { id, path: null, name: null, text: NEW_SCRIPT }))
  }, [])

  // Asks first if the document has unsaved changes. Closing the last tab shows the welcome screen.
  const close = useCallback(async (id: number): Promise<void> => {
    const tab = latest.current.tabs.find((tab) => tab.id === id)
    if (!tab) return
    if (isDirty(tab) && !(await window.api.confirmClose(tab.name))) return
    setState((state) => closeTab(state, id))
  }, [])

  useEffect(() => {
    const save = async (tab: Tab, saveAs: boolean): Promise<void> => {
      const name = `${baseName(tab.name)}.fountain`
      const saved = await window.api.saveFile(tab.text, saveAs ? null : tab.path, name)
      if (!saved) return
      // The tab may have been edited, or closed, while the save dialog was open.
      setState((state) => updateTab(state, tab.id, { ...saved, savedText: tab.text }))
    }

    const exportPdf = async ({ name, text }: Tab): Promise<void> => {
      const screenplay = layoutScreenplay(text)
      flushSync(() => setPrinted(screenplay))
      // The window title becomes the PDF's title.
      const windowTitle = document.title
      document.title = screenplay.title || baseName(name)
      try {
        await Promise.all(printFonts.map((font) => document.fonts?.load(font)))
        await window.api.exportPdf(`${baseName(name)}.pdf`)
      } finally {
        document.title = windowTitle
        setPrinted(null)
      }
    }

    const unsubscribeOpened = window.api.onFileOpened(({ path, name, content }) => {
      const id = nextTabId++
      setState((state) => openTab(state, { id, path, name, text: content }))
    })
    const unsubscribeMenu = window.api.onMenuCommand((command) => {
      const tab = activeTab(latest.current)
      if (command === 'new') newTab()
      else if (command === 'next-tab') setState((state) => cycleTab(state, 1))
      else if (command === 'previous-tab') setState((state) => cycleTab(state, -1))
      else if (command === 'toggle-sidebar') setSidebarVisible((visible) => !visible)
      else if (command === 'open-settings') setSettingsOpen(true)
      // The rest act on the shown document, which the welcome screen doesn't have.
      else if (!tab) return
      else if (command === 'close-tab') close(tab.id)
      else if (command === 'export-pdf') exportPdf(tab)
      else if (command === 'find') editors.current.get(tab.id)?.openSearch()
      else save(tab, command === 'save-as')
    })

    // Ctrl+Tab and Ctrl+Shift+Tab switch tabs, as in browsers.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.key !== 'Tab') return
      event.preventDefault()
      setState((state) => cycleTab(state, event.shiftKey ? -1 : 1))
    }
    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      unsubscribeOpened()
      unsubscribeMenu()
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [newTab, close])

  useEffect(() => {
    window.api.restoreSession().then(({ files, activePath }) => {
      const documents = files.map(({ path, name, content }) => ({
        id: nextTabId++,
        path,
        name,
        text: content
      }))
      setState((state) => restoreTabs(state, documents, activePath))
      setRestored(true)
    })
  }, [])

  // Only changes when a file is opened, closed, saved, moved or shown, not on every keystroke.
  const session = JSON.stringify(sessionOf(state))
  useEffect(() => {
    if (restored) window.api.saveSession(JSON.parse(session))
  }, [restored, session])

  useEffect(() => {
    let changed = false
    const unsubscribe = window.api.onSettingsChanged((settings) => {
      changed = true
      setSettings(settings)
    })
    window.api.getSettings().then((settings) => {
      if (!changed) setSettings(settings)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    let changed = false
    const unsubscribe = window.api.onRecentChanged((recent) => {
      changed = true
      setRecent(recent)
    })
    window.api.getRecent().then((recent) => {
      if (!changed) setRecent(recent)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    window.api.getSamples().then(setSamples)
  }, [])

  // A pinched text size is remembered in Settings.
  const zoomEditor = useCallback((editorFontSize: number): void => {
    window.api.updateSettings({ editorFontSize })
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`)
  }, [settings.uiFontSize])

  useEffect(() => {
    try {
      localStorage.setItem(sidebarKey, String(sidebarVisible))
    } catch {
      // Not remembered, which is fine.
    }
  }, [sidebarVisible])

  useEffect(() => {
    window.api.setDirty(anyDirty)
  }, [anyDirty])

  const docName = doc?.name ?? null
  useEffect(() => {
    document.title = docName === null ? 'Scriptron' : `${dirty ? '• ' : ''}${docName} — Scriptron`
  }, [dirty, docName])

  const settingsDialog = settingsOpen && (
    <SettingsDialog
      settings={settings}
      onChange={window.api.updateSettings}
      onClose={() => setSettingsOpen(false)}
    />
  )

  // Until the last launch's tabs are reopened, it isn't known whether to welcome.
  if (!restored) return <div className="app" />

  return (
    <>
      <div className="app">
        <TabBar
          tabs={tabs.map((tab) => ({
            id: tab.id,
            label: baseName(tab.name),
            title: tab.path ?? tab.name,
            dirty: isDirty(tab)
          }))}
          activeId={activeId}
          onHome={() => setState(showWelcome)}
          onSelect={(id) => setState((state) => ({ ...state, activeId: id }))}
          onClose={close}
          onNew={newTab}
          onMove={(id, index) => setState((state) => moveTab(state, id, index))}
        />
        <div className="workspace">
          {!doc ? (
            <Welcome
              recent={recent}
              samples={samples}
              onNew={newTab}
              onOpen={window.api.openDialog}
              onOpenRecent={window.api.openPath}
              onOpenSample={window.api.openSample}
            />
          ) : sidebarVisible ? (
            <Sidebar
              scenes={scenes}
              current={currentScene}
              onSelect={(scene) => editors.current.get(doc.id)?.goToLine(scene.line)}
              onCollapse={() => setSidebarVisible(false)}
            />
          ) : (
            <button
              type="button"
              className="sidebar-toggle sidebar-show"
              title="Show Sidebar"
              aria-label="Show Sidebar"
              onClick={() => setSidebarVisible(true)}
            >
              ›
            </button>
          )}
          {tabs.map((tab) => (
            <Editor
              key={tab.id}
              ref={(handle) => {
                if (handle) editors.current.set(tab.id, handle)
                return () => void editors.current.delete(tab.id)
              }}
              initialText={tab.initialText}
              initialCursor={tab.initialText === NEW_SCRIPT ? NEW_SCRIPT_CURSOR : 0}
              fontSize={settings.editorFontSize}
              checkSpelling={settings.checkSpelling}
              visible={tab.id === activeId}
              onChange={(text) => setState((state) => updateTab(state, tab.id, { text }))}
              onCursorLine={(cursorLine) =>
                setState((state) => updateTab(state, tab.id, { cursorLine }))
              }
              onZoom={zoomEditor}
            />
          ))}
        </div>
      </div>
      {settingsDialog}
      {printed && <PrintView screenplay={printed} />}
    </>
  )
}

export default App
