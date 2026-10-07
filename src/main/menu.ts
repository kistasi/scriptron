import { BrowserWindow, Menu, MenuItemConstructorOptions, app, dialog } from 'electron'
import { readFile } from 'fs/promises'
import { basename } from 'path'

export interface OpenedFile {
  path: string
  name: string
  content: string
}

async function openFountainFile(): Promise<void> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!window) return

  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Open Screenplay',
    properties: ['openFile'],
    filters: [{ name: 'Fountain', extensions: ['fountain'] }]
  })
  if (canceled || filePaths.length === 0) return

  const path = filePaths[0]
  try {
    const content = await readFile(path, 'utf-8')
    const file: OpenedFile = { path, name: basename(path), content }
    window.webContents.send('file:opened', file)
  } catch (error) {
    dialog.showErrorBox('Could not open file', `${path}\n\n${(error as Error).message}`)
  }
}

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => openFountainFile() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
