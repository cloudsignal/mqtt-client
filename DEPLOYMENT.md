# Deployment Guide

## Overview

The CloudSignal MQTT Client is automatically published to npm and optionally synced to a public GitHub repository when a version tag is pushed.

## Automated Deployment

### Triggering a Release

1. **Update version** in `package.json` and `version.md`
2. **Commit changes**:
   ```bash
   git add .
   git commit -m "chore: release v2.2.2"
   ```
3. **Create and push a version tag**:
   ```bash
   git tag v2.2.2
   git push origin main --tags
   ```

The GitHub Action will automatically:
- Build the library
- Publish to npm as `@cloudsignal/mqtt-client`
- Sync to the public repository (if configured)

## Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Description | Required |
|--------|-------------|----------|
| `NPM_TOKEN` | npm automation token for publishing | Yes |
| `PUBLIC_REPO_TOKEN` | GitHub PAT with repo access | Only if syncing to public repo |

### Optional Variables

Configure these in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Description | Example |
|----------|-------------|--------|
| `PUBLIC_REPO` | Public repository to sync to | `cloudsignal-public/mqtt-client` |

## Getting npm Token

1. Go to [npmjs.com](https://www.npmjs.com/) → **Access Tokens**
2. Click **Generate New Token** → **Automation**
3. Copy the token and add it as `NPM_TOKEN` secret

## Setting Up Public Repo Sync (Optional)

If you want to sync releases to a public GitHub repository:

1. **Create a GitHub Personal Access Token (PAT)**:
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - Create token with `Contents: Read and write` permission for the target repo
   - Add as `PUBLIC_REPO_TOKEN` secret

2. **Set the PUBLIC_REPO variable**:
   - Go to repo Settings → Secrets and variables → Actions → Variables
   - Add `PUBLIC_REPO` with value like `cloudsignal-public/mqtt-client`

## Manual Publishing

If you need to publish manually:

```bash
# Build
npm run build

# Login to npm (if not already)
npm login

# Publish
npm publish --access public
```

## Package Distribution

After publishing, the package is available via:

### npm
```bash
npm install @cloudsignal/mqtt-client
```

### CDN (via unpkg/jsdelivr)
```html
<!-- Latest -->
<script src="https://unpkg.com/@cloudsignal/mqtt-client"></script>

<!-- Specific version -->
<script src="https://unpkg.com/@cloudsignal/mqtt-client@2.2.2/dist/index.global.js"></script>
```

## Troubleshooting

### npm publish fails

1. **Check NPM_TOKEN** is set correctly
2. **Verify token permissions** (must be Automation type)
3. **Check version** hasn't been published already

### Public repo sync fails

1. **Check PUBLIC_REPO_TOKEN** has correct permissions
2. **Verify PUBLIC_REPO** variable is set correctly
3. **Ensure target repo exists**

### Build fails

1. Run locally to check for errors:
   ```bash
   npm ci
   npm run build
   ```

