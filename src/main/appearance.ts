import { app, nativeTheme } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type Appearance = typeof nativeTheme.themeSource

const settingsPath = (): string => join(app.getPath('userData'), 'appearance.json')

// nativeTheme.themeSource drives prefers-color-scheme in the renderer, which switches
// the CSS color variables. The choice is remembered across launches.
export function loadAppearance(): void {
  try {
    const { appearance } = JSON.parse(readFileSync(settingsPath(), 'utf8'))
    if (['system', 'light', 'dark'].includes(appearance)) nativeTheme.themeSource = appearance
  } catch {
    // No saved choice yet: follow the system.
  }
}

export function setAppearance(appearance: Appearance): void {
  nativeTheme.themeSource = appearance
  try {
    writeFileSync(settingsPath(), JSON.stringify({ appearance }))
  } catch (error) {
    console.error('Could not save appearance', error)
  }
}

// Matches the editor's desk color, so the window does not flash before the page loads.
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#141414' : '#eceae6'
}
