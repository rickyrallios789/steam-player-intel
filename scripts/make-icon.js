/**
 * Pure-Node app icon generator (no dependencies).
 *
 * Renders a 256x256 PNG at build/icon.png: the "Player Intel" mark — a white
 * shield with a blue check on a blue→purple gradient (matching the app's brand).
 * The CI workflow then converts it to build/icon.ico via png-to-ico so
 * electron-builder ships a real Windows icon instead of the default Electron one.
 */
const fs = require('node:fs')
const zlib = require('node:zlib')

const SIZE = 256

// ---- vector design, evaluated in a 256-unit space ----
function inShield(nx, ny) {
  // bottom triangle tapering to a point
  if (ny >= 150 && ny <= 214) {
    const t = (ny - 150) / (214 - 150)
    if (Math.abs(nx - 128) <= 76 * (1 - t)) return true
  }
  // body with rounded top corners
  if (ny >= 50 && ny <= 156) {
    const r = 28
    const left = 52
    const right = 204
    if (ny >= 50 + r) {
      if (nx >= left && nx <= right) return true
    } else {
      if (nx >= left + r && nx <= right - r) return true
      const dxl = nx - (left + r)
      const dyl = ny - (50 + r)
      if (dxl < 0 && dyl < 0 && dxl * dxl + dyl * dyl <= r * r) return true
      const dxr = nx - (right - r)
      const dyr = ny - (50 + r)
      if (dxr > 0 && dyr < 0 && dxr * dxr + dyr * dyr <= r * r) return true
    }
  }
  return false
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

// checkmark polyline
function inCheck(nx, ny) {
  const d = Math.min(distToSeg(nx, ny, 96, 128, 118, 150), distToSeg(nx, ny, 118, 150, 168, 92))
  return d <= 9
}

function sample(nx, ny) {
  // diagonal gradient: blue (#4f9dff) -> purple (#7c5cff)
  const t = (nx + ny) / (2 * SIZE)
  let r = Math.round(79 + (124 - 79) * t)
  let g = Math.round(157 + (92 - 157) * t)
  let b = 255
  if (inShield(nx, ny)) {
    r = 255
    g = 255
    b = 255
    if (inCheck(nx, ny)) {
      r = 43
      g = 111
      b = 224
    }
  }
  return [r, g, b, 255]
}

// ---- render RGBA (top-down) ----
const rgba = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = sample(x + 0.5, y + 0.5)
    const i = (y * SIZE + x) * 4
    rgba[i] = r
    rgba[i + 1] = g
    rgba[i + 2] = b
    rgba[i + 3] = a
  }
}

// ---- PNG encode (8-bit RGBA, color type 6) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

const stride = SIZE * 4 + 1
const raw = Buffer.alloc(stride * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * stride] = 0 // filter: none
  rgba.copy(raw, y * stride + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const idat = zlib.deflateSync(raw, { level: 9 })

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])

fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('build/icon.png', png)
console.log('build/icon.png written', png.length, 'bytes')
