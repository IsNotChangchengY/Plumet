import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const outDir = resolve(root, 'release')
const REQUIRED = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup/index.html',
  'options/index.html',
  'learning/index.html',
]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosStamp(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f)
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f)
  return { time, day }
}

function collect(dir) {
  const entries = []
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name)
      const info = statSync(full)
      if (info.isDirectory()) {
        visit(full)
        continue
      }
      entries.push({ name: relative(dist, full).split(sep).join('/'), data: readFileSync(full), mtime: info.mtime })
    }
  }
  visit(dir)
  return entries
}

function buildZip(entries) {
  const local = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const compressed = deflateRawSync(entry.data, { level: 9 })
    const checksum = crc32(entry.data)
    const stamp = dosStamp(entry.mtime)

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(8, 8)
    header.writeUInt16LE(stamp.time, 10)
    header.writeUInt16LE(stamp.day, 12)
    header.writeUInt32LE(checksum, 14)
    header.writeUInt32LE(compressed.length, 18)
    header.writeUInt32LE(entry.data.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    header.writeUInt16LE(0, 28)
    local.push(header, nameBytes, compressed)

    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0x0800, 8)
    directory.writeUInt16LE(8, 10)
    directory.writeUInt16LE(stamp.time, 12)
    directory.writeUInt16LE(stamp.day, 14)
    directory.writeUInt32LE(checksum, 16)
    directory.writeUInt32LE(compressed.length, 20)
    directory.writeUInt32LE(entry.data.length, 24)
    directory.writeUInt16LE(nameBytes.length, 28)
    directory.writeUInt16LE(0, 30)
    directory.writeUInt16LE(0, 32)
    directory.writeUInt16LE(0, 34)
    directory.writeUInt16LE(0, 36)
    directory.writeUInt32LE((0o100644 << 16) >>> 0, 38)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, nameBytes)

    offset += header.length + nameBytes.length + compressed.length
  }

  const directoryBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directoryBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...local, directoryBuffer, end])
}

if (!existsSync(dist)) {
  console.error('[package] dist 不存在，请先运行 pnpm build')
  process.exit(1)
}

const manifestPath = join(dist, 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error('[package] dist/manifest.json 缺失，构建可能失败')
  process.exit(1)
}

const missing = REQUIRED.filter((file) => !existsSync(join(dist, file)))
if (missing.length > 0) {
  console.error(`[package] 产物缺少必需文件：${missing.join('、')}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (manifest.version !== pkg.version) {
  console.warn(`[package] manifest 版本 ${manifest.version} 与 package.json 版本 ${pkg.version} 不一致`)
}

const entries = collect(dist)
const zip = buildZip(entries)
const rawSize = entries.reduce((sum, entry) => sum + entry.data.length, 0)

mkdirSync(outDir, { recursive: true })
const output = join(outDir, `yuyi-${manifest.version}.zip`)
writeFileSync(output, zip)

const digest = createHash('sha256').update(zip).digest('hex').slice(0, 12)
const ratio = rawSize > 0 ? Math.round((zip.length / rawSize) * 100) : 0

console.log(
  `[package] 打包完成：${output}\n` +
    `           ${entries.length} 个文件，原始 ${(rawSize / 1024).toFixed(1)} KB → zip ${(zip.length / 1024).toFixed(1)} KB（${ratio}%）\n` +
    `           sha256 ${digest}…\n` +
    `           安装：解压到任意目录 → edge://extensions → 开发人员模式 → 加载解压缩的扩展`,
)
