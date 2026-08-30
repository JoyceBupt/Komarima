import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { basename, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { unzipSync } from 'fflate'

const root = resolve(import.meta.dirname, '..')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function collect(directory) {
  const result = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await collect(path)))
    else if (entry.isFile()) result.push(path)
  }
  return result
}

async function verifyArchive() {
  const manifest = JSON.parse(
    await readFile(resolve(root, 'komari-theme.json'), 'utf8'),
  )
  const packageJson = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  )
  assert(manifest.version === packageJson.version, 'release versions differ')

  const archiveName = `komarima-v${manifest.version}.zip`
  const archivePath = resolve(root, 'artifacts', archiveName)
  const shaPath = `${archivePath}.sha256`
  const archive = await readFile(archivePath)
  const expectedDigest = createHash('sha256').update(archive).digest('hex')
  const declaredDigest = (await readFile(shaPath, 'utf8')).trim()
  assert(
    declaredDigest === `${expectedDigest}  ${archiveName}`,
    'archive SHA-256 does not match',
  )

  const sourceFiles = [
    resolve(root, 'LICENSE'),
    resolve(root, 'THIRD_PARTY_NOTICES.md'),
    resolve(root, 'komari-theme.json'),
    resolve(root, 'preview.png'),
    resolve(root, 'sbom.cdx.json'),
    ...(await collect(resolve(root, 'dist'))),
  ]
  const expectedEntries = new Map()
  for (const path of sourceFiles) {
    const name = path.includes(`${sep}dist${sep}`)
      ? relative(root, path).split(sep).join('/')
      : basename(path)
    expectedEntries.set(name, await readFile(path))
  }

  const entries = unzipSync(archive)
  const names = Object.keys(entries).sort()
  assert(names.length === expectedEntries.size, 'archive entry count differs')
  assert(names.length <= 10_000, 'archive contains too many files')

  let totalBytes = 0
  for (const name of names) {
    assert(!name.startsWith('/'), `archive entry is absolute: ${name}`)
    assert(
      !name.split('/').includes('..'),
      `archive entry escapes root: ${name}`,
    )
    const expected = expectedEntries.get(name)
    assert(expected, `unexpected archive entry: ${name}`)
    const actual = Buffer.from(entries[name])
    totalBytes += actual.length
    assert(actual.length <= 128 * 1024 * 1024, `${name} exceeds 128 MiB`)
    assert(
      Buffer.compare(actual, expected) === 0,
      `${name} differs from source`,
    )
  }
  assert(totalBytes <= 512 * 1024 * 1024, 'archive expands beyond 512 MiB')

  console.log(
    `Archive verification passed: ${names.length} files, ${totalBytes} bytes, ${expectedDigest}`,
  )
}

verifyArchive().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
