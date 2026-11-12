import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const problems = []

function check(condition, message) {
  if (!condition) problems.push(message)
}

function exists(relativePath) {
  return existsSync(join(dist, relativePath))
}

function walk(dir) {
  const result = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) result.push(...walk(full))
    else result.push(full)
  }
  return result
}

if (!existsSync(dist)) {
  console.error('[verify] dist 不存在，请先运行 pnpm build')
  process.exit(1)
}

if (!exists('manifest.json')) {
  console.error('[verify] dist/manifest.json 缺失')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))

check(manifest.manifest_version === 3, 'manifest_version 必须是 3')
check(typeof manifest.name === 'string' && manifest.name.length > 0, 'manifest 缺少 name')
check(typeof manifest.version === 'string' && manifest.version.length > 0, 'manifest 缺少 version')

const referenced = []
referenced.push(manifest.background?.service_worker)
referenced.push(manifest.side_panel?.default_path)
referenced.push(manifest.options_ui?.page)
referenced.push(manifest.action?.default_popup)
for (const icon of Object.values(manifest.icons ?? {})) referenced.push(icon)
for (const script of manifest.content_scripts ?? []) {
  for (const js of script.js ?? []) referenced.push(js)
  for (const css of script.css ?? []) referenced.push(css)
}

for (const path of referenced) {
  if (!path) continue
  check(exists(path), `manifest 引用的文件不存在：${path}`)
}

const htmlFiles = walk(dist).filter((file) => file.endsWith('.html'))
check(htmlFiles.length >= 3, `期望至少 3 个页面，实际找到 ${htmlFiles.length} 个`)

const assetRefs = []
for (const file of htmlFiles) {
  const content = readFileSync(file, 'utf8')
  check(content.includes('type="module"'), `${file} 没有加载模块脚本`)
  const regex = /(?:src|href)="\/(assets\/[^"]+)"/g
  let match = regex.exec(content)
  while (match) {
    assetRefs.push(match[1])
    match = regex.exec(content)
  }
}

for (const asset of assetRefs) {
  check(exists(asset), `页面引用的资源不存在：${asset}`)
}

const contentScript = join(dist, 'content.js')
if (existsSync(contentScript)) {
  const text = readFileSync(contentScript, 'utf8').trim()
  check(/^\(function|^!function|^\(\(\)/.test(text), 'content.js 不是 IIFE 打包，content script 无法加载')
  check(!/^import\s/m.test(text), 'content.js 里出现了 import 语句，content script 不支持 ESM')
} else {
  problems.push('dist/content.js 缺失')
}

const background = join(dist, 'background.js')
if (existsSync(background)) {
  const text = readFileSync(background, 'utf8')
  check(text.length > 1000, 'background.js 体积异常，可能没有打包成功')
} else {
  problems.push('dist/background.js 缺失')
}

if (problems.length > 0) {
  console.error('[verify] 失败：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`[verify] 通过：manifest 与 ${htmlFiles.length} 个页面、${assetRefs.length} 个资源引用全部有效`)
