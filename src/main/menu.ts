/**
 * Standard editing affordances the renderer's custom UI would otherwise lack:
 *  - a right-click context menu (Cut / Copy / Paste / Select All) on inputs and
 *    text selections, and
 *  - an application menu with Edit/View roles so the keyboard shortcuts
 *    (Ctrl/Cmd+C/V/X/A/Z, zoom, reload, devtools) work everywhere.
 * The app menu bar is kept hidden (autoHideMenuBar) so the custom UI is unchanged;
 * the roles still register their accelerators.
 */
import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

/** Attach a right-click context menu with the usual editing actions. */
export function installContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, selectionText } = params
    const hasSelection = Boolean(selectionText && selectionText.trim())
    if (!isEditable && !hasSelection) return

    const template: MenuItemConstructorOptions[] = []
    if (isEditable) {
      template.push(
        { role: 'undo', enabled: editFlags.canUndo },
        { role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' }
      )
    }
    template.push(
      { role: 'cut', enabled: isEditable && editFlags.canCut },
      { role: 'copy', enabled: editFlags.canCopy },
      { role: 'paste', enabled: isEditable && editFlags.canPaste }
    )
    if (isEditable) {
      template.push({ type: 'separator' }, { role: 'selectAll', enabled: editFlags.canSelectAll })
    }
    Menu.buildFromTemplate(template).popup({ window: win })
  })
}

/** Minimal application menu so editing shortcuts work; the bar itself stays hidden. */
export function installAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
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
