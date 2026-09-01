# Komarima

Komarima is an open-source, Xcode and Liquid Glass-inspired public probe workspace theme for Komari.

The first compatibility target is Komari 1.3.2. The theme uses only public same-origin APIs, does not replace `/admin` or `/terminal`, and does not load remote fonts, analytics, or tracking resources.

## Installation

Download the theme ZIP from the latest GitHub Release, then upload it in Komari's theme management page. Do not use GitHub's automatically generated source archives.

## Updates

The packaged manifest points to this public repository. Komari 1.3.2 can therefore update an installed theme from the latest GitHub Release. The installable theme ZIP is intentionally the only Release asset because Komari 1.3.2 selects the first attached asset.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build:theme
```

Released ZIP files contain `komari-theme.json`, `preview.png`, `dist/`, the project license, third-party notices, and the SBOM at the archive root.
Production dependency notices and a CycloneDX 1.6 SBOM are committed with each release.
Pushing a matching `vX.Y.Z` tag publishes the verified theme ZIP as the sole GitHub Release asset. The checksum and SBOM remain available in the release workflow artifact, and the SBOM is also embedded in the ZIP.

## License

MIT
