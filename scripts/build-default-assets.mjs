import { createHash } from 'node:crypto';
import { rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE_TYPES = ['items', 'appliances', 'locations'];
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const TAG_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'or',
  'the',
  'of',
  'to',
  'for',
  'with',
  'in',
  'on',
]);
const MAX_WIDTH = 800;
const WEBP_QUALITY = 80;
const DEFAULT_BASE_URL = 'https://assets.gearcheck.au';
const METADATA_PATH = path.join('metadata', 'glide-image-metadata.json');

const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, 'source');
const publicRoot = path.join(repoRoot, 'public');
const manifestOutputPath = path.join(publicRoot, 'rfs-uploads', 'defaults', 'image-manifest.json');
const metadataPath = path.join(repoRoot, METADATA_PATH);
const baseUrl = (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

function isSourceType(value) {
  return SOURCE_TYPES.includes(value);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return dedupeTags(
    tags.flatMap((tag) => (typeof tag === 'string' ? tokenizeTagText(tag) : []))
  );
}

function tokenizeTagText(value) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (part) => part && !TAG_STOP_WORDS.has(part)
  );
}

function dedupeTags(tags) {
  const seen = new Set();
  const normalized = [];

  for (const tag of tags) {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

async function loadMetadata() {
  try {
    const raw = await readFile(metadataPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Metadata JSON must be an object keyed by filename stem.');
    }

    const metadata = new Map();

    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      const trimmedKey = key.trim();
      if (!trimmedKey) {
        continue;
      }

      metadata.set(trimmedKey, value);
      metadata.set(trimmedKey.toLowerCase(), value);
      const stemKey = path.basename(trimmedKey, path.extname(trimmedKey)).trim();
      if (stemKey) {
        metadata.set(stemKey, value);
        metadata.set(stemKey.toLowerCase(), value);
      }
    }

    return metadata;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.warn(`[build-default-assets] Metadata file not found at ${METADATA_PATH}; using filename fallback metadata only.`);
      return new Map();
    }

    throw error;
  }
}

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

function parseSourceFilename(filename) {
  const sourceStem = path.basename(filename, path.extname(filename));
  const separatorIndex = sourceStem.indexOf('__');

  if (separatorIndex === -1) {
    return {
      labelStem: sourceStem,
      legacyImageId: null,
      sourceStem,
    };
  }

  const labelStem = sourceStem.slice(0, separatorIndex).trim();
  const legacyImageId = sourceStem.slice(separatorIndex + 2).trim();

  return {
    labelStem: labelStem || sourceStem,
    legacyImageId: legacyImageId || null,
    sourceStem,
  };
}

function buildLabelFromStem(labelStem) {
  const normalized = labelStem.replace(/[^A-Za-z0-9]+/g, ' ').trim();

  if (!normalized) {
    return 'Untitled Image';
  }

  return normalized
    .split(/\s+/)
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join(' ');
}

function buildTagsFromLabel(label) {
  return dedupeTags(tokenizeTagText(label));
}

function getMetadataForEntry(type, filename, parsedFilename, metadata) {
  const lookupKeys = [
    parsedFilename.sourceStem,
    filename,
    parsedFilename.legacyImageId,
    parsedFilename.labelStem,
  ].filter(Boolean);

  const lookup = lookupKeys
    .flatMap((key) => [key, key.toLowerCase()])
    .map((key) => metadata.get(key))
    .find(Boolean);

  if (!lookup) {
    return null;
  }

  const safeType =
    typeof lookup.type === 'string' && isSourceType(lookup.type) && lookup.type === type
      ? lookup.type
      : type;

  if (typeof lookup.type === 'string' && isSourceType(lookup.type) && lookup.type !== type) {
    console.warn(
      `[build-default-assets] Ignoring metadata type mismatch for ${filename}: expected ${type}, got ${lookup.type}.`
    );
  }

  return {
    category: typeof lookup.category === 'string' && lookup.category.trim()
      ? lookup.category.trim()
      : undefined,
    label: typeof lookup.label === 'string' && lookup.label.trim()
      ? lookup.label.trim()
      : undefined,
    sourceTable: typeof lookup.sourceTable === 'string' && lookup.sourceTable.trim()
      ? lookup.sourceTable.trim()
      : undefined,
    tags: normalizeTags(lookup.tags),
    type: safeType,
  };
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

async function buildType(type, metadata) {
  const sourceEntries = await loadSourceEntries(type);
  const outputDirectory = path.join(publicRoot, 'rfs-uploads', type, 'defaults');
  await ensureDirectory(outputDirectory);

  const manifestEntries = [];

  for (const entry of sourceEntries) {
    const parsedFilename = parseSourceFilename(entry.filename);
    const sourceMetadata = getMetadataForEntry(type, entry.filename, parsedFilename, metadata);
    const originalBuffer = await readFile(entry.inputPath);
    const transformedBuffer = await sharp(originalBuffer)
      .rotate()
      .resize({ fit: 'inside', withoutEnlargement: true, width: MAX_WIDTH })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const hash = createHash('sha256').update(transformedBuffer).digest('hex').slice(0, 10);
    const label = sourceMetadata?.label ?? buildLabelFromStem(parsedFilename.labelStem);
    const slug = toSlug(parsedFilename.labelStem) || 'image';
    const outputFilename = `${slug}-${hash}.webp`;
    const outputPath = path.join(outputDirectory, outputFilename);
    const publicUrl = `${baseUrl}/rfs-uploads/${type}/defaults/${outputFilename}`;
    const labelTags = buildTagsFromLabel(label);
    const tags = dedupeTags([...(sourceMetadata?.tags ?? []), ...labelTags]);

    await writeFile(outputPath, transformedBuffer);

    const manifestEntry = {
      key: parsedFilename.legacyImageId ?? parsedFilename.sourceStem,
      label,
      type: sourceMetadata?.type ?? type,
      url: publicUrl,
      sourceFilename: entry.filename,
    };

    if (tags.length > 0) {
      manifestEntry.tags = tags;
    }

    if (sourceMetadata?.category) {
      manifestEntry.category = sourceMetadata.category;
    }

    if (parsedFilename.legacyImageId) {
      manifestEntry.legacyImageId = parsedFilename.legacyImageId;
    }

    if (sourceMetadata?.sourceTable) {
      manifestEntry.sourceTable = sourceMetadata.sourceTable;
    }

    manifestEntries.push(manifestEntry);
  }

  manifestEntries.sort((a, b) => a.label.localeCompare(b.label));
  return manifestEntries;
}

// Retired defaults: files that were published once and replaced. Records saved earlier still
// store their exact URL, so the file stays online at that URL but is no longer listed in the
// manifest (nobody can pick it again). Each one is the already-published WebP, copied
// byte-for-byte and never re-encoded; its name must still match its own content hash.
const RETIRED_FILENAME = /^[a-z0-9]+(?:-[a-z0-9]+)*-([0-9a-f]{10})\.webp$/;

async function publishRetired(type) {
  const directoryPath = path.join(sourceRoot, 'retired', type);
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  const outputDirectory = path.join(publicRoot, 'rfs-uploads', type, 'defaults');
  await ensureDirectory(outputDirectory);
  let published = 0;

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) {
      continue;
    }

    const match = RETIRED_FILENAME.exec(entry.name);
    if (!match) {
      throw new Error(`Retired file ${type}/${entry.name} must keep its published name (slug-0123456789.webp).`);
    }

    const bytes = await readFile(path.join(directoryPath, entry.name));
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    if (hash !== match[1]) {
      throw new Error(`Retired file ${type}/${entry.name} has content hash ${hash}; it is not the published file.`);
    }

    await writeFile(path.join(outputDirectory, entry.name), bytes);
    published += 1;
  }

  return published;
}

async function main() {
  if (process.env.BASE_URL === undefined) {
    console.warn(`[build-default-assets] BASE_URL not set, using placeholder ${DEFAULT_BASE_URL}`);
  }

  const metadata = await loadMetadata();
  await rm(publicRoot, { recursive: true, force: true });

  const manifest = Object.fromEntries(
    await Promise.all(
      SOURCE_TYPES.map(async (type) => [type, await buildType(type, metadata)])
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

  // After the active build (which recreates public/). A retired name equal to an active one has
  // the same content hash, so it is the same bytes.
  const retired = {};
  for (const type of SOURCE_TYPES) {
    retired[type] = await publishRetired(type);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    counts: summary,
    retired,
    manifestPath: manifestOutputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error('[build-default-assets] Build failed');
  console.error(error);
  process.exitCode = 1;
});
