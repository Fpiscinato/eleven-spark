import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

/**
 * ElevenSpark icon generator.
 *
 * Everything is drawn from scratch so the browser tab icon, the home screen
 * icon and the app logo always look like the same brand:
 *
 * - favicon.ico / favicon.svg  : bold spark on indigo, readable at 16px
 * - icon-192.png / icon-512.png: the full shield logo (home screen icon)
 * - maskable-*.png             : shield on a full bleed background, safe for
 *                                the round masks Android and iOS apply
 * - apple-touch-icon.png       : the maskable version at 180x180
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

function cubic(p0, p1, p2, p3, steps = 24) {
  const points = []
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const mt = 1 - t
    const x =
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0]
    const y =
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1]
    points.push([x, y])
  }
  return points
}

/** The shield of the app logo, drawn in the 64x72 space of the SVG logo. */
const SHIELD = [
  [32, 3],
  [60, 13],
  [60, 35],
  ...cubic([60, 35], [60, 53], [48, 65.5], [32, 70]),
  ...cubic([32, 70], [16, 65.5], [4, 53], [4, 35]),
  [4, 13],
]

/** The spark that sits on the shield. */
const SPARK = [
  [44, 40],
  [34.5, 54],
  [40.5, 54],
  [33, 66],
  [52, 48.5],
  [45, 48.5],
  [53.5, 40],
]

/** The two "1" digits of the logo. */
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

function place(points, placement) {
  return points.map(([x, y]) => [x * placement.scale + placement.offsetX, y * placement.scale + placement.offsetY])
}

function roundedRectPoints(x, y, w, h, r) {
  const points = []
  const steps = 8
  const corners = [
    [x + w - r, y + r, -90],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, 90],
    [x + r, y + r, 180],
  ]
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i += 1) {
      const angle = ((start + (i * 90) / steps) * Math.PI) / 180
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
    }
  }
  return points
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
        const alpha = paint && colour ? 1 : 1
        r += final[0] * alpha
        g += final[1] * alpha
        b += final[2] * alpha
        a += 255
      }
    }
    const total = samples * samples
    if (a === 0) return [0, 0, 0, 0]
    return [Math.round(r / (a / 255)), Math.round(g / (a / 255)), Math.round(b / (a / 255)), Math.round(a / total)]
  })
}

/** The shield logo, drawn inside a square canvas. */
function shieldIcon(size, opaque, inset = 0.08) {
  const padding = size * inset
  const scale = (size - padding * 2) / 72
  const offsetX = (size - 64 * scale) / 2
  const offsetY = padding
  const shield = place(SHIELD, { scale, offsetX, offsetY })
  const spark = place(SPARK, { scale, offsetX, offsetY })
  const digits = DIGITS.map((digit) => place(digit, { scale, offsetX, offsetY }))
  const background = opaque
    ? (x, y) =>
        x < 0 || y < 0 || x > size || y > size
          ? null
          : gradient(INDIGO_TOP, INDIGO_BOTTOM, y, size)
    : null
  const artwork = (x, y) => {
    if (inPolygon(x, y, spark)) return gradient(AMBER_TOP, AMBER_BOTTOM, y, size)
    for (const digit of digits) {
      if (inPolygon(x, y, digit)) return WHITE
    }
    if (inPolygon(x, y, shield)) return gradient(INDIGO_TOP, INDIGO_BOTTOM, y, size)
    return null
  }
  return renderIcon(size, background, artwork)
}

/** A bold spark on a rounded indigo tile, readable at 16 pixels. */
function sparkIcon(size) {
  const tile = roundedRectPoints(size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.22)
  const scale = (size * 0.62) / 40
  const offsetX = (size - 40 * scale) / 2
  const offsetY = (size - 40 * scale) / 2
  const spark = place(
    [
      [10, 0],
      [0, 14],
      [6, 14],
      [0, 26],
      [20, 8],
      [13, 8],
    ],
    { scale, offsetX, offsetY },
  )
  const artwork = (x, y) => {
    if (inPolygon(x, y, spark)) return gradient(AMBER_TOP, AMBER_BOTTOM, y, size)
    if (inPolygon(x, y, tile)) return gradient(INDIGO_TOP, INDIGO_BOTTOM, y, size)
    return null
  }
  return renderIcon(size, null, artwork)
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect x="2.5" y="2.5" width="59" height="59" rx="14" fill="url(#tile)"/>
  <path d="M37 15 L17 37 H27 L24 49 L44 27 H34 Z" fill="url(#bolt)"/>
</svg>
`

mkdirSync('public', { recursive: true })
writeFileSync('public/favicon.svg', FAVICON_SVG)
writeFileSync('public/favicon.ico', encodeIco([16, 32, 48].map((size) => ({ size, png: sparkIcon(size) }))))
writeFileSync('public/favicon-32.png', sparkIcon(32))
writeFileSync('public/icon-192.png', shieldIcon(192, false))
writeFileSync('public/icon-512.png', shieldIcon(512, false))
writeFileSync('public/maskable-192.png', shieldIcon(192, true, 0.15))
writeFileSync('public/maskable-512.png', shieldIcon(512, true, 0.15))
writeFileSync('public/apple-touch-icon.png', shieldIcon(180, true, 0.15))
console.log('Generated favicon.svg, favicon.ico, favicon-32.png, icon-192.png, icon-512.png, maskable-192.png, maskable-512.png, apple-touch-icon.png')
