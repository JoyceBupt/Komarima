import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const checkOnly = process.argv.includes('--check')
const embeddedBuildInputs = new Set(['tailwindcss'])

function fail(message) {
  throw new Error(message)
}

function normalizeSource(value) {
  let source = typeof value === 'string' ? value : value?.url
  if (!source) return ''
  source = source.replace(/^git\+/, '').replace(/\.git(?:#.*)?$/u, '')
  if (source.startsWith('github:')) {
    return `https://github.com/${source.slice('github:'.length)}`
  }
  if (/^[\w.-]+\/[\w.-]+(?:#.*)?$/u.test(source)) {
    return `https://github.com/${source}`
  }
  return source.replace(/^git:\/\/github\.com\//u, 'https://github.com/')
}

function packageUrl(name, version) {
  const encodedName = name.startsWith('@')
    ? `${encodeURIComponent(name.slice(0, name.indexOf('/')))}/${encodeURIComponent(name.slice(name.indexOf('/') + 1))}`
    : encodeURIComponent(name)
  return `pkg:npm/${encodedName}@${version}`
}

function deterministicUuid(input) {
  const bytes = createHash('sha256').update(input).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function readLicenseText(packagePath) {
  const entries = await readdir(packagePath, { withFileTypes: true })
  const candidates = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(?:licen[cs]e|copying)(?:\..*)?$/iu.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  if (!candidates[0]) {
    fail(`missing license text for ${packagePath}`)
  }

  return (await readFile(resolve(packagePath, candidates[0]), 'utf8')).trim()
}

function readLicenseReport(args) {
  const raw = execFileSync('pnpm', ['licenses', 'list', ...args, '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })

  return JSON.parse(raw)
}

async function addLicensedPackages(packages, licenses, include, releaseRole) {
  for (const entries of Object.values(licenses)) {
    for (const entry of entries) {
      if (!include(entry)) continue

      for (const packagePath of entry.paths) {
        const packageJson = JSON.parse(
          await readFile(resolve(packagePath, 'package.json'), 'utf8'),
        )
        const key = `${packageJson.name}@${packageJson.version}`
        const existing = packages.get(key)
        if (existing) {
          if (releaseRole === 'embedded-build-input') {
            existing.releaseRole = releaseRole
          }
          continue
        }

        const source = normalizeSource(
          packageJson.homepage || packageJson.repository || entry.homepage,
        )
        packages.set(key, {
          name: packageJson.name,
          version: packageJson.version,
          license: packageJson.license || entry.license,
          source,
          licenseText: await readLicenseText(packagePath),
          releaseRole,
        })
      }
    }
  }
}

async function collectReleasePackages() {
  const packages = new Map()
  await addLicensedPackages(
    packages,
    readLicenseReport(['--prod']),
    () => true,
    'runtime-dependency',
  )
  await addLicensedPackages(
    packages,
    readLicenseReport([]),
    (entry) => embeddedBuildInputs.has(entry.name),
    'embedded-build-input',
  )
  for (const name of embeddedBuildInputs) {
    if (
      ![...packages.values()].some(
        (dependency) =>
          dependency.name === name &&
          dependency.releaseRole === 'embedded-build-input',
      )
    ) {
      fail(`missing embedded build input license: ${name}`)
    }
  }

  return [...packages.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version),
  )
}

function collectDependencyGraph() {
  const raw = execFileSync(
    'pnpm',
    ['list', '--prod', '--json', '--depth', 'Infinity'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  const [workspace] = JSON.parse(raw)
  const graph = new Map()

  function visit(dependencies = {}) {
    for (const [name, dependency] of Object.entries(dependencies)) {
      const ref = packageUrl(name, dependency.version)
      const childRefs = graph.get(ref) ?? new Set()
      for (const [childName, child] of Object.entries(
        dependency.dependencies ?? {},
      )) {
        childRefs.add(packageUrl(childName, child.version))
      }
      graph.set(ref, childRefs)
      visit(dependency.dependencies)
    }
  }

  visit(workspace.dependencies)
  return {
    directRefs: Object.entries(workspace.dependencies ?? {})
      .map(([name, dependency]) => packageUrl(name, dependency.version))
      .sort(),
    graph,
  }
}

function createNotices(packages) {
  const sections = packages.map((dependency) => {
    const source = dependency.source ? `\nSource: ${dependency.source}` : ''
    const releaseRole =
      dependency.releaseRole === 'embedded-build-input'
        ? '\nRelease role: Embedded build input'
        : ''
    return `## ${dependency.name} ${dependency.version}\n\nLicense: ${dependency.license}${source}${releaseRole}\n\n\`\`\`text\n${dependency.licenseText}\n\`\`\``
  })

  return `# Third-Party Notices\n\nKomarima includes the following runtime dependencies and build inputs whose code is embedded in the release artifact. The CycloneDX SBOM records the same release dependency set.\n\n${sections.join('\n\n')}\n`
}

async function createSbom(packages) {
  const project = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  )
  const rootRef = `pkg:npm/${encodeURIComponent(project.name)}@${project.version}`
  const { directRefs, graph } = collectDependencyGraph()
  const embeddedBuildInputRefs = packages
    .filter((dependency) => dependency.releaseRole === 'embedded-build-input')
    .map((dependency) => packageUrl(dependency.name, dependency.version))
  const releaseRefs = [
    ...new Set([...directRefs, ...embeddedBuildInputRefs]),
  ].sort()
  const components = packages.map((dependency) => {
    const component = {
      type: 'library',
      'bom-ref': packageUrl(dependency.name, dependency.version),
      name: dependency.name,
      version: dependency.version,
      licenses: [{ expression: dependency.license }],
      purl: packageUrl(dependency.name, dependency.version),
    }
    if (dependency.releaseRole === 'embedded-build-input') {
      component.properties = [
        {
          name: 'komarima:release-role',
          value: dependency.releaseRole,
        },
      ]
    }
    if (dependency.source) {
      component.externalReferences = [
        { type: 'website', url: dependency.source },
      ]
    }
    return component
  })

  const projectComponent = {
    type: 'application',
    'bom-ref': rootRef,
    name: project.name,
    version: project.version,
    licenses: [{ expression: project.license }],
    purl: rootRef,
  }
  const dependencies = [
    { ref: rootRef, dependsOn: releaseRefs },
    ...components.map((component) => ({
      ref: component['bom-ref'],
      dependsOn: [...(graph.get(component['bom-ref']) ?? [])].sort(),
    })),
  ]
  const fingerprint = JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    component: projectComponent,
    components,
    dependencies,
  })
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${deterministicUuid(fingerprint)}`,
    version: 1,
    metadata: { component: projectComponent },
    components,
    dependencies,
  }

  const componentRefs = new Set(
    components.map((component) => component['bom-ref']),
  )
  const reachable = new Set()
  const pending = [...releaseRefs]
  while (pending.length) {
    const ref = pending.pop()
    if (!ref || reachable.has(ref)) continue
    reachable.add(ref)
    pending.push(...(graph.get(ref) ?? []))
  }
  for (const ref of componentRefs) {
    if (!reachable.has(ref)) fail(`SBOM component is unreachable: ${ref}`)
  }

  return `${JSON.stringify(sbom, null, 2)}\n`
}

async function writeOrCheck(path, expected) {
  if (checkOnly) {
    const actual = await readFile(path, 'utf8').catch(() => '')
    if (actual !== expected) fail(`${path} is out of date`)
    return
  }
  await writeFile(path, expected, 'utf8')
}

async function main() {
  const packages = await collectReleasePackages()
  const notices = createNotices(packages)
  const sbom = await createSbom(packages)

  await writeOrCheck(resolve(root, 'THIRD_PARTY_NOTICES.md'), notices)
  await writeOrCheck(resolve(root, 'sbom.cdx.json'), sbom)
  console.log(
    `${checkOnly ? 'Verified' : 'Generated'} notices and SBOM for ${packages.length} release packages`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
