import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []

const PATH_FILES = ['AGENTS.md', 'docs/design.md', 'docs/providers.md']
const PATH_PREFIXES = ['src/', 'scripts/', 'public/', 'tests/', 'assets/', 'docs/']
const SKIP_PREFIXES = ['dist/']

function stripFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '')
}

function expandWildcard(token) {
  const star = token.indexOf('*')
  if (star < 0) return [token]
  const base = token.slice(0, star)
  const slash = base.lastIndexOf('/')
  return [slash >= 0 ? base.slice(0, slash) : base]
}

function checkToken(rawToken, source) {
  let token = rawToken.trim()
  if (!token) return
  if (!PATH_PREFIXES.some((prefix) => token.startsWith(prefix))) return
  if (SKIP_PREFIXES.some((prefix) => token.startsWith(prefix))) return
  if (/[\s<>{}|]/.test(token)) return
  token = token.replace(/[),.;:，。）]+$/, '')
  for (const target of expandWildcard(token)) {
    if (!existsSync(join(root, target))) {
      problems.push(`${source}: 路径不存在 -> ${target}`)
    }
  }
}

for (const file of PATH_FILES) {
  const full = join(root, file)
  if (!existsSync(full)) continue
  const content = stripFences(readFileSync(full, 'utf8'))
  const regex = /`([^`\n]+)`/g
  let match = regex.exec(content)
  while (match) {
    checkToken(match[1], file)
    match = regex.exec(content)
  }
}

function walkMarkdown(dir) {
  if (!existsSync(dir)) return []
  const result = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) result.push(...walkMarkdown(full))
    else if (name.endsWith('.md')) result.push(full)
  }
  return result
}

const linkFiles = [join(root, 'README.md'), join(root, 'AGENTS.md'), ...walkMarkdown(join(root, 'docs'))]

for (const file of linkFiles) {
  if (!existsSync(file)) continue
  const content = stripFences(readFileSync(file, 'utf8'))
  const regex = /\]\(([^)\s]+)\)/g
  let match = regex.exec(content)
  while (match) {
    const target = match[1]
    if (/^(https?:|mailto:|#|data:)/.test(target)) {
      match = regex.exec(content)
      continue
    }
    const clean = decodeURI(target.split('#')[0] ?? '')
    if (!clean) {
      match = regex.exec(content)
      continue
    }
    const full = resolve(dirname(file), clean)
    if (!existsSync(full)) {
      problems.push(`${relative(root, file)}: 链接失效 -> ${target}`)
    }
    match = regex.exec(content)
  }
}

if (problems.length > 0) {
  console.error('[docs] 失败：')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('[docs] 改了文件名或删了文件，记得同步 AGENTS.md / docs')
  process.exit(1)
}

console.log(`[docs] 通过：${PATH_FILES.length} 份文档的路径与 ${linkFiles.length} 份文档的链接全部有效`)
