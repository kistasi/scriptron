import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { defaultSettings, type Settings } from '../../shared/ipc'
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
  initialTabs,
  isDirty,
  openTab,
  updateTab,
  type Tabs
} from './lib/tabs'
import { TabBar } from './TabBar'

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
  const [state, setState] = useState<Tabs>(() => initialTabs(nextTabId++))
  // Set while exporting a PDF: the screenplay laid out for printing.
  const [printed, setPrinted] = useState<PrintedScreenplay | null>(null)
  const [sidebarVisible, setSidebarVisible] = useState(loadSidebarVisible)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The editor of each tab, by tab id.
  const editors = useRef(new Map<number, EditorHandle>())
  const { tabs, activeId } = state
  const doc = activeTab(state)
  const dirty = isDirty(doc)
  const anyDirty = tabs.some(isDirty)

  // Deferred so that typing isn't slowed down by re-outlining long screenplays.
  const outlinedText = useDeferredValue(doc.text)
  const scenes = useMemo(() => outlineScenes(outlinedText.split('\n')), [outlinedText])
  const currentScene = sceneAt(scenes, doc.cursorLine)

  // Menu commands arrive outside React's render cycle and need the latest values.
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  }, [state])

  const newTab = useCallback((): void => {
    const id = nextTabId++
    setState((state) => openTab(state, { id, path: null, name: null, text: '' }))
  }, [])

  // Asks first if the document has unsaved changes.
  const close = useCallback(async (id: number): Promise<void> => {
    const tab = latest.current.tabs.find((tab) => tab.id === id)
    if (!tab) return
    if (isDirty(tab) && !(await window.api.confirmClose(tab.name))) return
    const newId = nextTabId++
    setState((state) => closeTab(state, id, newId))
  }, [])

  useEffect(() => {
    const save = async (saveAs: boolean): Promise<void> => {
      const tab = activeTab(latest.current)
      const name = `${baseName(tab.name)}.fountain`
      const saved = await window.api.saveFile(tab.text, saveAs ? null : tab.path, name)
      if (!saved) return
      // The tab may have been edited, or closed, while the save dialog was open.
      setState((state) => updateTab(state, tab.id, { ...saved, savedText: tab.text }))
    }

    const exportPdf = async (): Promise<void> => {
      const { name, text } = activeTab(latest.current)
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
      if (command === 'new') newTab()
      else if (command === 'close-tab') close(latest.current.activeId)
      else if (command === 'next-tab') setState((state) => cycleTab(state, 1))
      else if (command === 'previous-tab') setState((state) => cycleTab(state, -1))
      else if (command === 'export-pdf') exportPdf()
      else if (command === 'find') editors.current.get(latest.current.activeId)?.openSearch()
      else if (command === 'toggle-sidebar') setSidebarVisible((visible) => !visible)
      else if (command === 'open-settings') setSettingsOpen(true)
      else save(command === 'save-as')
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

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${doc.name} — scriptron`
  }, [dirty, doc.name])

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
          onSelect={(id) => setState((state) => ({ ...state, activeId: id }))}
          onClose={close}
          onNew={newTab}
        />
        <div className="workspace">
          {sidebarVisible ? (
            <Sidebar
              scenes={scenes}
              current={currentScene}
              onSelect={(scene) => editors.current.get(activeId)?.goToLine(scene.line)}
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
              fontSize={settings.editorFontSize}
              checkSpelling={settings.checkSpelling}
              visible={tab.id === activeId}
              onChange={(text) => setState((state) => updateTab(state, tab.id, { text }))}
              onCursorLine={(cursorLine) =>
                setState((state) => updateTab(state, tab.id, { cursorLine }))
              }
            />
          ))}
        </div>
      </div>
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={window.api.updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {printed && <PrintView screenplay={printed} />}
    </>
  )
}

export default App
