import { Menu, MenuItemConstructorOptions, app, nativeTheme } from 'electron'
import { type Appearance, setAppearance } from './appearance'
import { newDocument, openDocument, sendMenuCommand } from './document'

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => newDocument() },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => openDocument() },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('save') },
        {
          label: 'Save As…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => sendMenuCommand('save-as')
        },
        { type: 'separator' },
        {
          label: 'Export PDF…',
          accelerator: 'Shift+CmdOrCtrl+E',
          click: () => sendMenuCommand('export-pdf')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: (['system', 'light', 'dark'] as Appearance[]).map((appearance) => ({
            label: appearance[0].toUpperCase() + appearance.slice(1),
            type: 'radio',
            checked: nativeTheme.themeSource === appearance,
            click: () => setAppearance(appearance)
          }))
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
