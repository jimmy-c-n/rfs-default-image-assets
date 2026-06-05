# RFS Default Image Assets

Public default images and manifest files for the RFS Brigade app.

This repo is for default assets only. It is not used for user uploads.

The preferred public base URL is:

- `https://app-brigade-public-assets.shiftmomentum.au`

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

Filename rules:

- Old Glide-derived images can be renamed to:
  - `human-readable-name__legacyImageId.jpg`
- New images can use a simple clear filename:
  - `helmet-torch.jpg`

Examples:

- items:
  - `65mm-per-hose__UJIEduiPcnjdnjkdsv.jpg`
  - `helmet-torch.jpg`
- appliances:
  - `eungai-cat-1__S9nDCbh4FlCXafPEo8HH.jpg`
  - `brigade-station.jpg`
- locations:
  - `crew-area-box-1__TJ43JcoMubMc6DZdL9yC.png`
  - `locker-icon-5.png`

Why preserve the legacy ID:

- it keeps a stable link back to the original Glide image identity
- it makes metadata matching safer when old images are renamed
- it lets the manifest expose `legacyImageId` without forcing ugly labels

## Glide metadata

Optional metadata lives in:

- `metadata/glide-image-metadata.json`

This file is preferred when building the public manifest. It is keyed by the
original source image filename stem, for example:

```json
{
  "54FG359zBf0DprgsN2sg": {
    "label": "Branch - AWG (38mm)",
    "type": "items",
    "category": "Stocktake",
    "tags": ["Stocktake"]
  }
}
```

Metadata should come from the Glide-derived image catalogue or later curated
updates. The random source filenames are preserved internally for matching and
identity, while human-readable labels and tags come from metadata where
available.

If metadata is missing for an image, the build falls back to filename-derived
labels and tags.

When a filename includes `__`, the build:

- uses the part before `__` as the label/tag fallback source
- uses the part after `__` as `legacyImageId`
- still keeps the original `sourceFilename` in the manifest

Tags are generated automatically from the final human-readable label used in
the manifest. If `metadata.tags` exists, those tags are merged with the
label-derived tags instead of replacing them. GitHub Actions uses the same
build script, so local builds and CI builds follow the same tag logic.

## Build output

The build process converts source images to optimized WebP files, adds content-hashed filenames for cache busting, and publishes:

- `public/rfs-uploads/items/defaults/`
- `public/rfs-uploads/appliances/defaults/`
- `public/rfs-uploads/locations/defaults/`
- `public/rfs-uploads/defaults/image-manifest.json`

Manifest entries include:

- `key`
- `label`
- `url`
- `type`
- `category` when available
- `legacyImageId` when available
- `sourceFilename`
- `tags` when available

## GitHub Pages

Enable GitHub Pages with `GitHub Actions` as the source.

Set the Actions repo variable:

- `PAGES_BASE_URL = https://app-brigade-public-assets.shiftmomentum.au`

The app should read the manifest from:

- `https://app-brigade-public-assets.shiftmomentum.au/rfs-uploads/defaults/image-manifest.json`

Local builds also default to:

- `BASE_URL=https://app-brigade-public-assets.shiftmomentum.au`

## Tag examples

Example label:

- `Absorbent Spill 50L Bag`

Generated tags:

- `absorbent`
- `spill`
- `50l`
- `bag`

Use clear filenames for new images so the fallback label and generated tags are
still useful even without metadata:

- `helmet-torch.jpg`
- `crew-area-box-1.jpg`
- `65mm-per-hose__UJIEduiPcnjdnjkdsv.jpg`
