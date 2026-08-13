/**
 * Converts build/icon.png into a multi-size build/icon.ico that electron-builder
 * uses for the Windows app/installer icon. Run in CI after make-icon.js.
 */
const pngToIco = require('png-to-ico')
const fs = require('node:fs')

pngToIco('build/icon.png')
  .then((buf) => {
    fs.writeFileSync('build/icon.ico', buf)
    console.log('build/icon.ico written', buf.length, 'bytes')
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
