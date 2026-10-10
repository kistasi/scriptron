import { Menu, MenuItemConstructorOptions, app } from 'electron'
import { appearances } from '../shared/ipc'
import { openDocument, openSample, sendMenuCommand } from './document'
import { samples } from './samples'
import { getSettings, updateSettings } from './settings'

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const settingsItem: MenuItemConstructorOptions = {
    label: isMac ? 'Settings…' : 'Preferences…',
    accelerator: 'CmdOrCtrl+,',
    click: () => sendMenuCommand('open-settings')
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => openDocument() },
        {
          label: 'Open Sample',
          submenu: samples.map(({ title, path }) => ({
            label: title,
            click: () => openSample(path)
          }))
        },
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
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendMenuCommand('close-tab')
        },
        ...((isMac
          ? [{ role: 'close', label: 'Close Window', accelerator: 'Shift+Cmd+W' }]
          : [
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'quit' }
            ]) as MenuItemConstructorOptions[])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [{ role: 'pasteAndMatchStyle' } as MenuItemConstructorOptions] : []),
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => sendMenuCommand('find') },
        { type: 'separator' },
        {
          label: 'Spelling',
          submenu: [
            {
              label: 'Check Spelling While Typing',
              type: 'checkbox',
              checked: getSettings().checkSpelling,
              click: () => updateSettings({ checkSpelling: !getSettings().checkSpelling })
            },
            { type: 'separator' },
            { label: 'Edit Dictionary…', click: () => sendMenuCommand('open-settings') }
          ]
        },
        ...((isMac
          ? [
              { type: 'separator' },
              { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] }
            ]
          : []) as MenuItemConstructorOptions[])
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: isMac ? 'Ctrl+Cmd+S' : 'Ctrl+Alt+S',
          click: () => sendMenuCommand('toggle-sidebar')
        },
        { type: 'separator' },
        // Ctrl+Tab and Ctrl+Shift+Tab also switch tabs; the renderer handles those.
        {
          label: 'Show Next Tab',
          accelerator: isMac ? 'Shift+Cmd+]' : 'Ctrl+PageDown',
          click: () => sendMenuCommand('next-tab')
        },
        {
          label: 'Show Previous Tab',
          accelerator: isMac ? 'Shift+Cmd+[' : 'Ctrl+PageUp',
          click: () => sendMenuCommand('previous-tab')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: appearances.map((appearance) => ({
            label: appearance[0].toUpperCase() + appearance.slice(1),
            type: 'radio',
            checked: getSettings().appearance === appearance,
            click: () => updateSettings({ appearance })
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
