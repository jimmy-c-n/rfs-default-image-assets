import { createHash } from 'node:crypto';
import { rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE_TYPES = ['items', 'appliances', 'locations'];
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const TAG_STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'from', 'default', 'defaults']);
const MAX_WIDTH = 800;
const WEBP_QUALITY = 80;
const DEFAULT_BASE_URL = 'https://app-brigade-public-assets.shiftmomentum.au/';

const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, 'source');
const publicRoot = path.join(repoRoot, 'public');
const manifestOutputPath = path.join(publicRoot, 'rfs-uploads', 'defaults', 'image-manifest.json');
const baseUrl = (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

function isHiddenOrUnsafe(name) {
  if (!name || name.startsWith('.')) {
    return true;
  }

  const extension = path.extname(name).toLowerCase();
  return !ALLOWED_EXTENSIONS.has(extension);
}

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildLabel(filename) {
  const stem = path.basename(filename, path.extname(filename));
  const normalized = stem.replace(/[^A-Za-z0-9]+/g, ' ').trim();

  if (!normalized) {
    return 'Untitled Image';
  }

  return normalized
    .split(/\s+/)
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join(' ');
}

function buildTags(filename) {
  const stem = path.basename(filename, path.extname(filename)).toLowerCase();
  const parts = stem.split(/[^a-z0-9]+/).filter(Boolean);
  const tags = [];

  for (const part of parts) {
    if (!TAG_STOP_WORDS.has(part) && !tags.includes(part)) {
      tags.push(part);
    }
  }

  return tags;
}

async function ensureDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true });
}

async function loadSourceEntries(type) {
  const directoryPath = path.join(sourceRoot, type);
  await ensureDirectory(directoryPath);
  const entries = await readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && !isHiddenOrUnsafe(entry.name))
    .map((entry) => ({
      filename: entry.name,
      inputPath: path.join(directoryPath, entry.name),
    }));
}

async function buildType(type) {
  const sourceEntries = await loadSourceEntries(type);
  const outputDirectory = path.join(publicRoot, 'rfs-uploads', type, 'defaults');
  await ensureDirectory(outputDirectory);

  const manifestEntries = [];

  for (const entry of sourceEntries) {
    const originalBuffer = await readFile(entry.inputPath);
    const transformedBuffer = await sharp(originalBuffer)
      .rotate()
      .resize({ fit: 'inside', withoutEnlargement: true, width: MAX_WIDTH })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const hash = createHash('sha256').update(transformedBuffer).digest('hex').slice(0, 10);
    const label = buildLabel(entry.filename);
    const slug = toSlug(path.basename(entry.filename, path.extname(entry.filename))) || 'image';
    const outputFilename = `${slug}-${hash}.webp`;
    const outputPath = path.join(outputDirectory, outputFilename);
    const publicUrl = `${baseUrl}/rfs-uploads/${type}/defaults/${outputFilename}`;

    await writeFile(outputPath, transformedBuffer);

    manifestEntries.push({
      key: slug,
      label,
      type,
      url: publicUrl,
      tags: buildTags(entry.filename),
    });
  }

  manifestEntries.sort((a, b) => a.label.localeCompare(b.label));
  return manifestEntries;
}

async function main() {
  if (process.env.BASE_URL === undefined) {
    console.warn(`[build-default-assets] BASE_URL not set, using placeholder ${DEFAULT_BASE_URL}`);
  }

  await rm(publicRoot, { recursive: true, force: true });

  const manifest = Object.fromEntries(
    await Promise.all(
      SOURCE_TYPES.map(async (type) => [type, await buildType(type)])
    )
  );

  await ensureDirectory(path.dirname(manifestOutputPath));
  await writeFile(
    manifestOutputPath,
    JSON.stringify(manifest, null, 2) + '\n'
  );

  const summary = Object.fromEntries(
    SOURCE_TYPES.map((type) => [type, manifest[type].length])
  );

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    counts: summary,
    manifestPath: manifestOutputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error('[build-default-assets] Build failed');
  console.error(error);
  process.exitCode = 1;
});

