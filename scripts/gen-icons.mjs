// Renders the app icon to the PNG sizes Android and iOS need.
// Run with `npm run icons` after changing the artwork below.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const assetsDir = join(root, 'assets')

/** @param {number} pad fraction of the canvas to leave empty around the mark */
const icon = (pad) => {
  const inset = Math.round(512 * pad)
  const size = 512 - inset * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#12141a"/>
  <g transform="translate(${inset} ${inset}) scale(${size / 512})">
    <rect x="56" y="56" width="400" height="400" rx="96" fill="#6a92ff"/>
    <text x="256" y="256" font-family="Segoe UI, Helvetica, Arial, sans-serif"
          font-size="260" font-weight="700" fill="#ffffff"
          text-anchor="middle" dominant-baseline="central">$</text>
    <circle cx="372" cy="372" r="62" fill="#34d399" stroke="#12141a" stroke-width="18"/>
    <path d="M344 372 l20 22 l40 -46" fill="none" stroke="#12141a"
          stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`
}

await mkdir(publicDir, { recursive: true })

// The browser-tab favicon can be the SVG directly.
await writeFile(join(publicDir, 'favicon.svg'), icon(0))

const outputs = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  // Maskable icons get cropped to a circle/squircle by the launcher, so the mark
  // is inset to stay inside the safe zone.
  ['icon-512-maskable.png', 512, 0.12],
  ['apple-touch-icon-180.png', 180, 0],
]

for (const [name, size, pad] of outputs) {
  await sharp(Buffer.from(icon(pad))).resize(size, size).png().toFile(join(publicDir, name))
  console.log(`wrote public/${name}`)
}

// Sources for `npx @capacitor/assets generate`, which fans these out into the
// mipmap densities and adaptive-icon layers the Android launcher expects.
await mkdir(assetsDir, { recursive: true })
await sharp(Buffer.from(icon(0))).resize(1024, 1024).png().toFile(join(assetsDir, 'icon.png'))
console.log('wrote assets/icon.png')

const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#12141a"/>
  <g transform="translate(1110 1110) scale(1)">
    <rect x="0" y="0" width="512" height="512" rx="120" fill="#6a92ff"/>
    <text x="256" y="256" font-family="Segoe UI, Helvetica, Arial, sans-serif"
          font-size="300" font-weight="700" fill="#ffffff"
          text-anchor="middle" dominant-baseline="central">$</text>
  </g>
</svg>`
await sharp(Buffer.from(splash)).png().toFile(join(assetsDir, 'splash.png'))
await sharp(Buffer.from(splash)).png().toFile(join(assetsDir, 'splash-dark.png'))
console.log('wrote assets/splash.png + splash-dark.png')
