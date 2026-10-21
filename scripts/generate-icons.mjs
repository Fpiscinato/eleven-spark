import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

/**
 * ElevenSpark icon generator.
 *
 * The favicon (browser tab) and the home screen icon are the same brand mark
 * as the logo shown inside the app: the indigo shield with "11+" and the amber
 * spark.
 *
 * Files are written into a versioned folder (public/app-icons/vX.Y.Z) and the
 * manifest points at that folder, so a new release always serves a brand new
 * icon URL and phones pick up the new icon without the student having to
 * uninstall and install the app again.
 */

const INDIGO_TOP = [79, 70, 229]
const INDIGO_BOTTOM = [49, 46, 129]
const AMBER_TOP = [252, 211, 77]
const AMBER_BOTTOM = [245, 158, 11]
const WHITE = [255, 255, 255]

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
  return out
}

function encodePng(size, pixelAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelAt(x, y)
      const o = rowStart + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = []
  const payloads = []
  for (const image of images) {
    const entry = Buffer.alloc(16)
    entry[0] = image.size >= 256 ? 0 : image.size
    entry[1] = image.size >= 256 ? 0 : image.size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(image.png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += image.png.length
    entries.push(entry)
    payloads.push(image.png)
  }
  return Buffer.concat([header, ...entries, ...payloads])
}

function inPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const crosses = yi > y !== yj > y
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function cubic(p0, p1, p2, p3, steps = 24) {
  const points = []
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const mt = 1 - t
    const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0]
    const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1]
    points.push([x, y])
  }
  return points
}

/** The shield of the app logo, in the 64x72 space of the SVG logo. */
const SHIELD = [
  [32, 3],
  [60, 13],
  [60, 35],
  ...cubic([60, 35], [60, 53], [48, 65.5], [32, 70]),
  ...cubic([32, 70], [16, 65.5], [4, 53], [4, 35]),
  [4, 13],
]

/** The amber spark that sits on the shield. */
const SPARK = [
  [44, 40],
  [34.5, 54],
  [40.5, 54],
  [33, 66],
  [52, 48.5],
  [45, 48.5],
  [53.5, 40],
]

/** The white "11+" of the logo. */
const DIGITS = [
  [
    [16, 24],
    [21, 24],
    [21, 44],
    [16, 44],
  ],
  [
    [12.5, 24],
    [19.5, 24],
    [19.5, 28],
    [12.5, 28],
  ],
  [
    [24, 24],
    [29, 24],
    [29, 44],
    [24, 44],
  ],
  [
    [20.5, 24],
    [27.5, 24],
    [27.5, 28],
    [20.5, 28],
  ],
  [
    [32.5, 25.5],
    [44.5, 25.5],
    [44.5, 30],
    [32.5, 30],
  ],
  [
    [36.25, 22],
    [40.75, 22],
    [40.75, 33.5],
    [36.25, 33.5],
  ],
]

/** The two little dots of the logo. */
const DOTS = [
  { cx: 50, cy: 28, r: 2.2, color: [252, 211, 77] },
  { cx: 12, cy: 46, r: 1.5, color: [253, 230, 138] },
]

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function gradient(top, bottom, y, height) {
  return mix(top, bottom, Math.max(0, Math.min(1, y / Math.max(1, height))))
}

function place(points, scale, offsetX, offsetY) {
  return points.map(([x, y]) => [x * scale + offsetX, y * scale + offsetY])
}

function renderIcon(size, background, artwork) {
  const samples = 3
  return encodePng(size, (px, py) => {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < samples; sy += 1) {
      for (let sx = 0; sx < samples; sx += 1) {
        const x = px + (sx + 0.5) / samples
        const y = py + (sy + 0.5) / samples
        const colour = background ? background(x, y) : null
        const paint = artwork(x, y)
        const final = paint ?? colour
        if (!final) continue
        r += final[0]
        g += final[1]
        b += final[2]
        a += 255
      }
    }
    const total = samples * samples
    if (a === 0) return [0, 0, 0, 0]
    return [
      Math.round(r / (a / 255)),
      Math.round(g / (a / 255)),
      Math.round(b / (a / 255)),
      Math.round(a / total),
    ]
  })
}

/**
 * The app logo drawn inside a square canvas.
 * `detail` adds the "11+" and the dots; the tiny 16px favicon keeps only the
 * shield and the spark so it stays readable.
 */
function logoIcon(size, { detail = true, background = false, inset = 0.08 } = {}) {
  const padding = size * inset
  const scale = (size - padding * 2) / 72
  const offsetX = (size - 64 * scale) / 2
  const offsetY = padding
  const shield = place(SHIELD, scale, offsetX, offsetY)
  const spark = place(SPARK, scale, offsetX, offsetY)
  const digits = DIGITS.map((digit) => place(digit, scale, offsetX, offsetY))
  const bg = background
    ? (x, y) =>
        x < 0 || y < 0 || x > size || y > size ? null : gradient(INDIGO_TOP, INDIGO_BOTTOM, y, size)
    : null
  const artwork = (x, y) => {
    if (inPolygon(x, y, spark)) return gradient(AMBER_TOP, AMBER_BOTTOM, y, size)
    if (detail) {
      for (const digit of digits) {
        if (inPolygon(x, y, digit)) return WHITE
      }
      for (const dot of DOTS) {
        if (inCircle(x, y, dot.cx * scale + offsetX, dot.cy * scale + offsetY, dot.r * scale)) {
          return dot.color
        }
      }
    }
    if (inPolygon(x, y, shield)) return gradient(INDIGO_TOP, INDIGO_BOTTOM, y, size)
    return null
  }
  return renderIcon(size, bg, artwork)
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72" width="64" height="72">
  <defs>
    <linearGradient id="es-shield" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="es-spark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <path d="M32 3 L60 13 V35 C60 53 48 65.5 32 70 C16 65.5 4 53 4 35 V13 Z" fill="url(#es-shield)"/>
  <path d="M32 3 L60 13 V35 C60 53 48 65.5 32 70 C16 65.5 4 53 4 35 V13 Z" fill="none" stroke="#4338ca" stroke-width="2" stroke-linejoin="round" opacity="0.55"/>
  <rect x="16" y="24" width="5" height="20" rx="2" fill="#ffffff"/>
  <rect x="12.5" y="24" width="7" height="4" rx="1.5" fill="#ffffff"/>
  <rect x="24" y="24" width="5" height="20" rx="2" fill="#ffffff"/>
  <rect x="20.5" y="24" width="7" height="4" rx="1.5" fill="#ffffff"/>
  <rect x="32.5" y="25.5" width="12" height="4.5" rx="1.8" fill="#ffffff"/>
  <rect x="36.25" y="22" width="4.5" height="11.5" rx="1.8" fill="#ffffff"/>
  <path d="M44 40 L34.5 54 H40.5 L33 66 L52 48.5 H45 L53.5 40 Z" fill="url(#es-spark)" stroke="#b45309" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="50" cy="28" r="2.2" fill="#fcd34d"/>
  <circle cx="12" cy="46" r="1.5" fill="#fde68a"/>
</svg>
`

function readAppVersion() {
  const source = readFileSync('src/config/version.ts', 'utf8')
  const match = source.match(/APP_VERSION\s*=\s*'([^']+)'/)
  if (!match) throw new Error('Could not read APP_VERSION from src/config/version.ts')
  return match[1]
}

const version = readAppVersion()
const iconDir = `public/app-icons/v${version}`

mkdirSync(iconDir, { recursive: true })
for (const entry of readdirSync('public/app-icons')) {
  if (entry !== `v${version}`) rmSync(`public/app-icons/${entry}`, { recursive: true, force: true })
}
writeFileSync('public/favicon.svg', FAVICON_SVG)
writeFileSync('public/favicon.ico', encodeIco([
  { size: 16, png: logoIcon(16, { detail: false }) },
  { size: 32, png: logoIcon(32, { detail: false }) },
  { size: 48, png: logoIcon(48, { detail: true }) },
]))
writeFileSync('public/favicon-32.png', logoIcon(32, { detail: false }))
writeFileSync('public/icon.svg', FAVICON_SVG)
writeFileSync(`${iconDir}/icon-192.png`, logoIcon(192, { detail: true }))
writeFileSync(`${iconDir}/icon-512.png`, logoIcon(512, { detail: true }))
writeFileSync(`${iconDir}/maskable-192.png`, logoIcon(192, { detail: true, background: true, inset: 0.15 }))
writeFileSync(`${iconDir}/maskable-512.png`, logoIcon(512, { detail: true, background: true, inset: 0.15 }))
writeFileSync(`${iconDir}/apple-touch-icon.png`, logoIcon(180, { detail: true, background: true, inset: 0.15 }))
console.log(`Generated icons for v${version} in ${iconDir}`)
