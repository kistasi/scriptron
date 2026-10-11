import { describe, expect, it } from 'vitest'
import {
  activeTab,
  closeTab,
  cycleTab,
  moveTab,
  NEW_SCRIPT,
  noTabs,
  openTab,
  restoreTabs,
  sessionOf,
  showWelcome,
  updateTab,
  type Tabs
} from './tabs'

const names = (state: Tabs): string[] => state.tabs.map((tab) => tab.name)
const activeName = (state: Tabs): string | undefined =>
  state.tabs.find((tab) => tab.id === state.activeId)?.name

const file = (id: number, name: string): Parameters<typeof openTab>[1] => ({
  id,
  path: `/scripts/${name}`,
  name,
  text: name
})
const untitled = (id: number): Parameters<typeof openTab>[1] => ({
  id,
  path: null,
  name: null,
  text: NEW_SCRIPT
})

// A blank untitled tab, as New opens.
const blank = (id: number): Tabs => openTab(noTabs, untitled(id))

describe('tabs', () => {
  it('starts on the welcome screen, with no tabs', () => {
    expect(names(noTabs)).toEqual([])
    expect(activeTab(noTabs)).toBeNull()
  })

  it('numbers new untitled tabs, reusing freed names', () => {
    let state = openTab(openTab(blank(0), untitled(1)), untitled(2))
    expect(names(state)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3'])

    state = closeTab(state, 1)
    state = openTab(state, untitled(3))
    expect(names(state)).toEqual(['Untitled', 'Untitled 3', 'Untitled 2'])
  })

  it('opens a file in place of a blank untitled tab', () => {
    const state = openTab(blank(0), file(1, 'A.fountain'))
    expect(names(state)).toEqual(['A.fountain'])
    expect(state.activeId).toBe(1)
  })

  it('keeps an untitled tab that has been typed into', () => {
    const typed = updateTab(blank(0), 0, { text: 'INT. HOUSE' })
    expect(names(openTab(typed, file(1, 'A.fountain')))).toEqual(['Untitled', 'A.fountain'])
  })

  it('shows a file that is already open rather than opening it again', () => {
    let state = openTab(openTab(blank(0), file(1, 'A.fountain')), file(2, 'B.fountain'))
    state = openTab(state, file(3, 'A.fountain'))
    expect(names(state)).toEqual(['A.fountain', 'B.fountain'])
    expect(state.activeId).toBe(1)
  })

  it('shows the next tab when the shown one is closed, or the previous for the last', () => {
    let state = openTab(blank(0), file(0, 'A'))
    for (const [id, name] of ['B', 'C', 'D'].entries()) state = openTab(state, file(id + 1, name))
    state = { ...state, activeId: 1 }

    state = closeTab(state, 1)
    expect(activeName(state)).toBe('C')

    state = closeTab(state, 3)
    expect(activeName(state)).toBe('C')

    state = closeTab(state, 2)
    expect(activeName(state)).toBe('A')
  })

  it('shows the welcome screen when the last tab is closed', () => {
    expect(closeTab(openTab(blank(0), file(1, 'A.fountain')), 1)).toEqual(noTabs)
  })

  it('shows the welcome screen, keeping the tabs, until a tab is shown', () => {
    const state = showWelcome(openTab(blank(0), file(1, 'A')))
    expect(names(state)).toEqual(['A'])
    expect(activeTab(state)).toBeNull()
    expect(sessionOf(state)).toEqual({ paths: ['/scripts/A'], activePath: null })
  })

  it('opens a file in a new tab from the welcome screen, keeping a blank one', () => {
    const state = openTab(showWelcome(blank(0)), file(1, 'A'))
    expect(names(state)).toEqual(['Untitled', 'A'])
  })

  it('cycles through the tabs, wrapping around', () => {
    const state = openTab(openTab(blank(0), untitled(1)), untitled(2))
    expect(cycleTab(state, 1).activeId).toBe(0)
    expect(cycleTab(state, -1).activeId).toBe(1)
    expect(cycleTab(showWelcome(state), 1).activeId).toBe(0)
    expect(cycleTab(showWelcome(state), -1).activeId).toBe(2)
    expect(cycleTab(noTabs, 1)).toBe(noTabs)
  })

  it('ignores updates to a closed tab', () => {
    const state = blank(0)
    expect(updateTab(state, 5, { text: 'x' })).toBe(state)
  })

  it('moves a tab, shifting the others', () => {
    let state = blank(0)
    for (const [id, name] of ['A', 'B', 'C'].entries()) state = openTab(state, file(id, name))
    expect(names(moveTab(state, 0, 2))).toEqual(['B', 'C', 'A'])
    expect(names(moveTab(state, 2, 0))).toEqual(['C', 'A', 'B'])
  })

  it('restores files in place of the blank tab, showing the one that was shown', () => {
    const state = restoreTabs(blank(0), [file(1, 'A'), file(2, 'B')], '/scripts/A')
    expect(names(state)).toEqual(['A', 'B'])
    expect(activeName(state)).toBe('A')
  })

  it('remembers the files, not the untitled documents', () => {
    let state = openTab(blank(0), file(1, 'A'))
    state = openTab(openTab(state, untitled(2)), file(3, 'B'))
    expect(sessionOf(state)).toEqual({
      paths: ['/scripts/A', '/scripts/B'],
      activePath: '/scripts/B'
    })
  })
})
