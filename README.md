# Komarima

Komarima is an open-source, Xcode-inspired public probe workspace theme for Komari.

The first compatibility target is Komari 1.3.2. The theme uses only public same-origin APIs, does not replace `/admin` or `/terminal`, and does not load remote fonts, analytics, or tracking resources.

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
Pushing a matching `vX.Y.Z` tag publishes the verified ZIP, checksum, and SBOM.

## License

MIT
