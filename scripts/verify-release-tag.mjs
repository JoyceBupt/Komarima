import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')

async function verifyReleaseTag() {
  const packageJson = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  )
  const manifest = JSON.parse(
    await readFile(resolve(root, 'komari-theme.json'), 'utf8'),
  )
  const expectedTag = `v${packageJson.version}`
  const actualTag = process.env.GITHUB_REF_NAME

  if (manifest.version !== packageJson.version) {
    throw new Error('package.json and komari-theme.json versions differ')
  }
  if (actualTag !== expectedTag) {
    throw new Error(`release tag must be ${expectedTag}, received ${actualTag}`)
  }
  console.log(`Release tag verified: ${actualTag}`)
}

verifyReleaseTag().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
