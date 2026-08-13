# GearCheck Default Image Assets

Public default images and manifest files for the GearCheck app.

This repo is for default assets only. It is not used for user uploads.

The preferred public base URL is:

- `https://assets.gearcheck.au`

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

- `PAGES_BASE_URL = https://assets.gearcheck.au`

The app should read the manifest from:

- `https://assets.gearcheck.au/rfs-uploads/defaults/image-manifest.json`

Local builds also default to:

- `BASE_URL=https://assets.gearcheck.au`

### Why the URL path still says `rfs-uploads`

The published path is deliberately unchanged:

- `https://assets.gearcheck.au/rfs-uploads/...`

The hostname moved to GearCheck, but the path did not. Existing image URLs are
already stored in the GearCheck database and are referenced by the app and the
Glide importer, so renaming the path would break those saved URLs. Treat
`rfs-uploads` as a fixed compatibility path, not as branding.

## Publish

Publishing means running the **Build Default Assets** GitHub Actions workflow.
That workflow is the only thing that updates the live site: it rebuilds the
images, commits the regenerated `public/` folder back to the repo, and deploys
it to GitHub Pages. Building on your own machine only previews the result — it
never publishes.

### 1. Preview locally first

```bash
npm install
npm run build
```

The build prints the base URL it used and the number of items, appliances and
locations it generated. Check those numbers look right before publishing.

To force a completely fresh rebuild:

```bash
npm run clean
npm run build
```

### 2. Commit and push

```bash
git add .
git commit -m "add new default images"
git push
```

If your push touched any of these, the workflow starts **automatically**:

- `source/**`
- `scripts/**`
- `package.json`
- `package-lock.json`
- `.github/workflows/build-default-assets.yml`

Adding or replacing images in `source/` therefore publishes on its own.

### 3. When you must start the workflow by hand

A push that changes **only** these does **not** trigger the workflow:

- `metadata/glide-image-metadata.json`
- `README.md`
- the `PAGES_BASE_URL` repository variable (changing a variable is not a push
  at all, so nothing runs)

In those cases start it manually. From the command line, with the
[GitHub CLI](https://cli.github.com/) installed and authenticated:

```bash
gh workflow run "Build Default Assets"
```

Then watch it finish:

```bash
gh run watch
```

Or list recent runs and their status:

```bash
gh run list --workflow "Build Default Assets"
```

From the website instead: open the repository on GitHub → **Actions** tab →
**Build Default Assets** in the left sidebar → **Run workflow** button →
**Run workflow**.

### 4. Confirm it published

The workflow pushes its own commit (`chore: rebuild default asset output`), so
pull it back before doing more local work:

```bash
git pull
```

Then check the live manifest:

```bash
curl -s https://assets.gearcheck.au/rfs-uploads/defaults/image-manifest.json | head -c 400
```

Every `url` in it should begin with `https://assets.gearcheck.au/rfs-uploads/`.
Spot-check one image loads:

```bash
curl -o /dev/null -w "%{http_code}\n" https://assets.gearcheck.au/rfs-uploads/defaults/image-manifest.json
```

`200` means the site is serving the new manifest. GitHub Pages can take a
minute or two after the workflow finishes, so retry once before worrying.

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
