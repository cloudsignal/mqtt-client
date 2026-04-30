# CDN Deployment Guide

## Overview

CloudSignalWS is automatically deployed to Cloudflare R2 when changes are pushed to the `cloudsignal-ws-client/` directory.

## Required GitHub Secrets

Configure these secrets in your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID | Dashboard URL or `wrangler whoami` |
| `R2_ACCESS_KEY_ID` | R2 API access key | R2 → Manage R2 API Tokens → Create |
| `R2_SECRET_ACCESS_KEY` | R2 API secret key | Same as above (shown once) |
| `R2_CDN_BUCKET` | R2 bucket name (optional) | Defaults to `cloudsignal-cdn` if not set |

### Getting R2 Credentials

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Get Account ID**:
   ```bash
   wrangler whoami
   # Copy the "Account ID" value
   ```

4. **Create R2 API Token**:
   - Go to: https://dash.cloudflare.com/
   - Navigate to: **R2** → **Manage R2 API Tokens**
   - Click: **Create API Token**
   - Permissions: **Object Read & Write**
   - Copy **Access Key ID** and **Secret Access Key**

## R2 Bucket Setup

### Create CDN Bucket

```bash
# Create bucket
wrangler r2 bucket create cloudsignal-cdn

# Verify
wrangler r2 bucket list
```

### Configure Custom Domain (Optional)

If you want to use `cdn.cloudsignal.io`:

1. **Create R2 Custom Domain**:
   - Go to: R2 → cloudsignal-cdn → Settings → Custom Domains
   - Add domain: `cdn.cloudsignal.io`
   - Follow DNS setup instructions

2. **Update CNAME Record**:
   - Add CNAME record: `cdn` → R2 domain provided by Cloudflare

## Deployment Process

### Automatic Deployment

When you push changes to `cloudsignal-ws-client/`:

1. **GitHub Actions** automatically:
   - Installs dependencies
   - Builds the library
   - Creates versioned files
   - Uploads to R2
   - Commits to git
   - Creates version tag

### Manual Deployment

If you need to deploy manually:

```bash
cd cloudsignal-ws-client

# Install dependencies
npm install

# Build
npm run build

# Upload versioned file to R2 (requires AWS CLI configured)
VERSION=$(node -p "require('./package.json').version")
aws s3 cp cdn/CloudSignalWS.v${VERSION}.js \
  s3://cloudsignal-cdn/CloudSignalWS.v${VERSION}.js \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --cache-control "public, max-age=31536000" \
  --content-type "application/javascript"

# To update latest file manually (when ready):
aws s3 cp cdn/CloudSignalWS.js \
  s3://cloudsignal-cdn/CloudSignalWS.js \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --cache-control "public, max-age=3600" \
  --content-type "application/javascript"
```

## File Structure in R2

**Note**: The automated build only uploads versioned files. The latest `CloudSignalWS.js` file is excluded to preserve your existing production file.

```
cloudsignal-cdn/
├── CloudSignalWS.js                    # Latest version (manually managed, not auto-uploaded)
├── CloudSignalWS.v1.0.0.js            # Versioned files (auto-uploaded)
├── CloudSignalWS.v1.0.1.js            # Versioned files (auto-uploaded)
└── versions/
    ├── v1.0.0/
    │   ├── CloudSignalWS.js
    │   └── manifest.json
    └── v1.0.1/
        ├── CloudSignalWS.js
        └── manifest.json
```

## Cache Headers

Files are uploaded with appropriate cache headers:

- **Versioned files** (`CloudSignalWS.v1.0.0.js`): `max-age=31536000` (1 year)
- **Version manifests**: `max-age=31536000` (1 year)

## CDN URLs

After deployment, versioned files are available at:

- **Versioned**: `https://cdn.cloudsignal.io/CloudSignalWS.v1.0.0.js`
- **Version manifest**: `https://cdn.cloudsignal.io/versions/v1.0.0/manifest.json`

**Note**: The latest `CloudSignalWS.js` file is not automatically updated. You can manually update it when ready by uploading the desired versioned file.

## Troubleshooting

### Deployment Fails

1. **Check GitHub Secrets**:
   - Verify all three R2 secrets are set correctly
   - Ensure no extra spaces or newlines

2. **Check R2 Bucket**:
   ```bash
   wrangler r2 bucket list
   # Should show: cloudsignal-cdn
   ```

3. **Test R2 Access**:
   ```bash
   aws s3 ls s3://cloudsignal-cdn/ \
     --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
   ```

### Files Not Updating

- Check GitHub Actions logs for errors
- Verify R2 bucket permissions
- Ensure custom domain is properly configured

### Version Not Found

- Check that version was bumped in `package.json`
- Verify build completed successfully
- Check R2 bucket for versioned files

## Security Best Practices

1. **Never commit secrets** to git
2. **Use GitHub Secrets** for all credentials
3. **Rotate R2 keys** periodically
4. **Limit R2 token permissions** to minimum required
5. **Monitor R2 access logs** for suspicious activity

