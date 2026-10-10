import { Menu, MenuItemConstructorOptions, app } from 'electron'
import { appearances } from '../shared/ipc'
import { newDocument, openDocument, openSample, sendMenuCommand } from './document'
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
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => newDocument() },
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
        ...(isMac ? [] : [settingsItem, { type: 'separator' } as MenuItemConstructorOptions]),
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: isMac ? 'Ctrl+Cmd+S' : 'Ctrl+Alt+S',
          click: () => sendMenuCommand('toggle-sidebar')
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
