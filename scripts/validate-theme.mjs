import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const manifestPath = resolve(root, 'komari-theme.json')
const packagePath = resolve(root, 'package.json')
const previewPath = resolve(root, 'preview.png')
const indexPath = resolve(root, 'dist/index.html')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)))
    } else if (entry.isFile()) {
      files.push(path)
    }
  }

  return files
}

async function validate() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const indexHtml = await readFile(indexPath, 'utf8')
  const previewStats = await stat(previewPath)
  const distFiles = await collectFiles(resolve(root, 'dist'))
  const allowedManagedTypes = new Set([
    'title',
    'switch',
    'select',
    'number',
    'string',
  ])

  assert(
    typeof manifest.name === 'string' && manifest.name,
    'manifest.name must be a string',
  )
  assert(
    typeof manifest.short === 'string' && manifest.short,
    'manifest.short must be a string',
  )
  assert(
    /^[A-Za-z0-9_-]+$/.test(manifest.short),
    'manifest.short contains unsupported characters',
  )
  assert(
    manifest.short.toLowerCase() !== 'default',
    'manifest.short cannot be default',
  )
  assert(
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
      manifest.version,
    ),
    'manifest.version must be valid SemVer',
  )
  assert(
    manifest.version === packageJson.version,
    'manifest.version must match package.json',
  )
  assert(
    manifest.configuration?.type === 'managed',
    'configuration.type must be managed',
  )

  for (const field of manifest.configuration?.data ?? []) {
    assert(
      allowedManagedTypes.has(field.type),
      `unsupported managed field type: ${field.type}`,
    )
  }

  assert(previewStats.size > 0, 'preview.png is empty')
  assert(
    indexHtml.includes('<title>Komari Monitor</title>'),
    'dist/index.html is missing the exact Komari title placeholder',
  )
  assert(
    indexHtml.includes(
      '<meta name="description" content="A simple server monitor tool." />',
    ),
    'dist/index.html is missing the exact Komari description placeholder',
  )
  assert(
    indexHtml.includes('</head>') && indexHtml.includes('</body>'),
    'dist/index.html is malformed',
  )
  assert(distFiles.length <= 10_000, 'dist contains more than 10,000 files')

  let totalBytes = 0
  let hasAttribution = false
  for (const file of distFiles) {
    const fileStats = await stat(file)
    totalBytes += fileStats.size
    assert(
      fileStats.size <= 128 * 1024 * 1024,
      `${file} exceeds the 128 MiB file limit`,
    )

    if (/\.(?:html|css|js)$/u.test(file)) {
      const content = await readFile(file, 'utf8')
      hasAttribution ||= content.includes('Powered by Komari Monitor.')
      assert(
        !/navigator\.serviceWorker/u.test(content),
        `${file} registers a service worker`,
      )
      assert(
        !/(?:src|href)=["']https?:\/\//u.test(content),
        `${file} contains a remote asset`,
      )
    }
  }

  assert(hasAttribution, 'dist is missing the required Komari attribution')
  assert(
    totalBytes <= 512 * 1024 * 1024,
    'dist exceeds the 512 MiB expanded limit',
  )
  console.log(
    `Theme validation passed: ${distFiles.length} files, ${totalBytes} bytes`,
  )
}

validate().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
