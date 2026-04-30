# Versioning Strategy

## Overview

CloudSignalWS uses semantic versioning (SemVer) for safe, predictable upgrades.

## Version Format

`MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

- **MAJOR**: Breaking changes (incompatible API changes)
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

## Build Output Structure

```
cdn/
├── CloudSignalWS.js                    # Latest version (always current)
├── CloudSignalWS.v2.0.0.js            # Versioned file
├── latest.json                         # Latest version manifest
└── versions/
    └── v2.0.0/
        ├── CloudSignalWS.js          # Versioned copy
        └── manifest.json             # Version metadata

dist/
└── CloudSignalClient.node.js           # Node.js bundle (mqtts:// support)
```

## Manifest Format

Each version includes a `manifest.json`:

```json
{
  "version": "2.0.0",
  "filename": "CloudSignalWS.v2.0.0.js",
  "buildDate": "2025-01-09T00:00:00.000Z",
  "gitCommit": "abc1234",
  "url": "https://cdn.cloudsignal.io/CloudSignalWS.v2.0.0.js"
}
```

## Usage Patterns

### 1. Always Latest (Auto-Updates)
```html
<script src="https://cdn.cloudsignal.io/CloudSignalWS.js"></script>
```
- ✅ Always gets latest features/fixes
- ⚠️ May break if breaking changes introduced

### 2. Specific Version (Safe Upgrades)
```html
<script src="https://cdn.cloudsignal.io/CloudSignalWS.v2.0.0.js"></script>
```
- ✅ Stable, predictable behavior
- ✅ No unexpected breaking changes
- ⚠️ Must manually update for new features

### 3. Version Range (Recommended)
```html
<!-- Use latest patch of 2.0.x -->
<script src="https://cdn.cloudsignal.io/CloudSignalWS.v2.0.js"></script>
```
- ✅ Gets bug fixes automatically
- ✅ Avoids breaking changes
- ⚠️ Requires CDN support for version ranges

## Upgrade Strategy

### Patch Updates (1.0.0 → 1.0.1)
- **Safe**: Auto-update recommended
- **Changes**: Bug fixes only
- **Action**: Update `CloudSignalWS.v1.0.0.js` → `CloudSignalWS.v1.0.1.js`

### Minor Updates (1.0.0 → 1.1.0)
- **Safe**: Review changelog, then update
- **Changes**: New features, backward compatible
- **Action**: Test, then update `CloudSignalWS.v1.0.0.js` → `CloudSignalWS.v1.1.0.js`

### Major Updates (1.0.0 → 2.0.0)
- **Caution**: Breaking changes possible
- **Changes**: API changes, may require code updates
- **Action**: 
  1. Review migration guide
  2. Update code if needed
  3. Test thoroughly
  4. Update `CloudSignalWS.v1.0.0.js` → `CloudSignalWS.v2.0.0.js`

## Version Bumping Workflow

1. **Make changes** to `src/CloudSignalClient.js`
2. **Bump version**:
   ```bash
   npm version patch   # or minor/major
   ```
3. **Build**:
   ```bash
   npm run build
   ```
4. **Commit & push**:
   ```bash
   git add .
   git commit -m "chore: release v1.0.1"
   git push origin master
   ```
5. **GitHub Actions** automatically:
   - Builds versioned files
   - Creates version manifest
   - Commits to `cdn/` directory
   - Creates git tag `cdn-v1.0.1`

## CDN Deployment

The GitHub Actions workflow automatically:
- Builds on push to `cloudsignal-ws-client/`
- Creates versioned files
- Commits to `cdn/` directory
- Creates git tags for each version

## Rollback Strategy

If a version has issues:

1. **Identify problematic version**: Check error logs
2. **Revert to previous version**: Update script tag
   ```html
   <!-- From broken version -->
   <script src="https://cdn.cloudsignal.io/CloudSignalWS.v1.0.2.js"></script>
   
   <!-- To previous working version -->
   <script src="https://cdn.cloudsignal.io/CloudSignalWS.v1.0.1.js"></script>
   ```
3. **Fix issue** in source code
4. **Release new patch version** with fix

## Best Practices

1. **Pin to specific version** in production
2. **Test new versions** in staging first
3. **Monitor changelog** for breaking changes
4. **Use semantic versioning** consistently
5. **Document breaking changes** in release notes

