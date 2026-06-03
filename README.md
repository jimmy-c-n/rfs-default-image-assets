# RFS Default Image Assets

Public default images and manifest files for the RFS Brigade app.

This repo is for default assets only. It is not used for user uploads.

## Add images

Place source images into:

- `source/items/`
- `source/appliances/`
- `source/locations/`

Accepted source formats:

- `jpg`
- `jpeg`
- `png`
- `webp`

## Build output

The build process converts source images to optimized WebP files, adds content-hashed filenames for cache busting, and publishes:

- `public/rfs-uploads/items/defaults/`
- `public/rfs-uploads/appliances/defaults/`
- `public/rfs-uploads/locations/defaults/`
- `public/rfs-uploads/defaults/image-manifest.json`

## GitHub Pages

Enable GitHub Pages with `GitHub Actions` as the source.

The app should read the manifest from:

- `https://<github-user>.github.io/<repo-name>/rfs-uploads/defaults/image-manifest.json`

Or, if using a custom domain:

- `https://<your-domain>/rfs-uploads/defaults/image-manifest.json`
