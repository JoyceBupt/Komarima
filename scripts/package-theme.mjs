import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { unzipSync, zipSync } from 'fflate'

const root = resolve(import.meta.dirname, '..')

async function collect(directory) {
  const result = []
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await collect(path)))
    } else if (entry.isFile()) {
      result.push(path)
    }
  }

  return result
}

async function packageTheme() {
  const manifest = JSON.parse(
    await readFile(resolve(root, 'komari-theme.json'), 'utf8'),
  )
  const packageJson = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  )
  const version = String(manifest.version ?? '0.0.0')
  if (version !== packageJson.version) {
    throw new Error('package.json and komari-theme.json versions differ')
  }
  const artifacts = resolve(root, 'artifacts')
  const archivePath = resolve(artifacts, `komarima-v${version}.zip`)
  const shaPath = `${archivePath}.sha256`
  const files = [
    resolve(root, 'LICENSE'),
    resolve(root, 'THIRD_PARTY_NOTICES.md'),
    resolve(root, 'komari-theme.json'),
    resolve(root, 'preview.png'),
    resolve(root, 'sbom.cdx.json'),
    ...(await collect(resolve(root, 'dist'))),
  ]
  const archiveEntries = {}

  for (const file of files) {
    const name = file.includes(`${sep}dist${sep}`)
      ? relative(root, file).split(sep).join('/')
      : basename(file)
    archiveEntries[name] = await readFile(file)
  }

  const archive = zipSync(archiveEntries, {
    level: 9,
    mtime: new Date(2000, 0, 1, 0, 0, 0),
    os: 3,
    attrs: 0o644 << 16,
  })
  const digest = createHash('sha256').update(archive).digest('hex')
  const packagedEntries = unzipSync(archive)
  const expectedNames = Object.keys(archiveEntries).sort()
  const packagedNames = Object.keys(packagedEntries).sort()
  if (JSON.stringify(packagedNames) !== JSON.stringify(expectedNames)) {
    throw new Error('packaged archive entries differ from the source set')
  }

  await mkdir(artifacts, { recursive: true })
  await writeFile(archivePath, archive)
  await writeFile(shaPath, `${digest}  ${basename(archivePath)}\n`, 'utf8')
  console.log(relative(root, archivePath))
  console.log(digest)
}

packageTheme().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
