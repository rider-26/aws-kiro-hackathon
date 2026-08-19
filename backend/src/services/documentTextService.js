const fs = require('fs/promises');
const storageService = require('./storageService');

/**
 * Extracts readable text from an uploaded study material so quiz generation can
 * actually be based on its contents.
 *
 * Before this existed, quiz generation sent the model only a FILENAME plus a
 * hardcoded topic list, which meant an uploaded economics PDF produced questions
 * about password hashing — the app claimed "AI-generated from your material"
 * while never opening the file. This module is what makes that claim true.
 *
 * Extraction is best-effort by design. A scanned PDF is images with no text
 * layer, a slide deck may be mostly diagrams, and some files are simply
 * unreadable. In every one of those cases we return null rather than throwing,
 * and the caller degrades honestly instead of inventing content.
 */

// Enough context for the model to write grounded questions, bounded so a long
// textbook cannot blow the request size or the token budget. Roughly 30k
// characters is comfortably within DeepSeek's context window.
const MAX_EXTRACT_CHARS = 30000;

// Below this, there is not enough substance to base questions on — typically a
// scanned document whose text layer is empty or near-empty.
const MIN_USEFUL_CHARS = 200;

/** Collapses the whitespace soup that PDF extraction usually produces. */
function tidy(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();
}

async function extractPdf(buffer) {
  // pdf-parse v2 is a rewrite: a PDFParse class with getText(), rather than v1's
  // single callable export. Instances hold a worker, so destroy() must run even
  // on failure or the process will not exit cleanly.
  // eslint-disable-next-line global-require
  const { PDFParse } = require('pdf-parse');

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return {
      text: tidy(result.text),
      pageCount: result.total || result.pages?.length || null,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractDocx(buffer) {
  // eslint-disable-next-line global-require
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return { text: tidy(result.value), pageCount: null };
}

/**
 * PPTX text without a dedicated dependency.
 *
 * A .pptx is a zip of XML; slide text lives in <a:t> elements inside
 * ppt/slides/slideN.xml. Pulling those out is a few lines, versus adding another
 * parser for a format that is the least common of the three we accept.
 */
async function extractPptx(buffer) {
  // eslint-disable-next-line global-require
  const { promisify } = require('util');
  // eslint-disable-next-line global-require
  const zlib = require('zlib');
  const inflateRaw = promisify(zlib.inflateRaw);

  const slides = [];
  // Walk the zip's local file headers rather than pulling in a zip library.
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.slice(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;

    if (/^ppt\/slides\/slide\d+\.xml$/.test(name) && compressedSize > 0) {
      const raw = buffer.slice(dataStart, dataStart + compressedSize);
      try {
        const xml = method === 8 ? (await inflateRaw(raw)).toString('utf8') : raw.toString('utf8');
        const runs = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
        slides.push(runs.map((r) => r.replace(/<[^>]+>/g, '')).join(' '));
      } catch {
        // Skip a slide we cannot inflate; partial text is still useful.
      }
    }

    if (compressedSize === 0) break; // Streamed entry: sizes live in the central directory.
    offset = dataStart + compressedSize;
  }

  return { text: tidy(slides.join('\n\n')), pageCount: slides.length || null };
}

function extractorFor(filename) {
  const ext = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === 'pdf') return extractPdf;
  if (ext === 'docx') return extractDocx;
  if (ext === 'pptx') return extractPptx;
  return null;
}

/**
 * Reads a stored material and returns { text, pageCount, truncated } — or null
 * when nothing usable could be read.
 *
 * Currently supports the local storage driver only. Under S3 the object would
 * need downloading first; that is a deliberate gap rather than a silent failure,
 * and the caller reports it as "couldn't read the file" rather than pretending.
 */
async function extractFromMaterial(material) {
  if (!material?.file_reference) return null;

  const extract = extractorFor(material.filename);
  if (!extract) return null;

  let buffer;
  try {
    if (storageService.driver() !== 'local') return null;
    if (!(await storageService.localObjectExists(material.file_reference))) return null;
    buffer = await fs.readFile(storageService.localObjectPath(material.file_reference));
  } catch (err) {
    console.warn('[document] could not read stored file:', err.message);
    return null;
  }

  try {
    const { text, pageCount } = await extract(buffer);
    if (!text || text.length < MIN_USEFUL_CHARS) return null;

    return {
      text: text.slice(0, MAX_EXTRACT_CHARS),
      pageCount,
      truncated: text.length > MAX_EXTRACT_CHARS,
    };
  } catch (err) {
    console.warn(`[document] could not extract text from ${material.filename}:`, err.message);
    return null;
  }
}

module.exports = {
  extractFromMaterial,
  tidy,
  MAX_EXTRACT_CHARS,
  MIN_USEFUL_CHARS,
  // Exported for tests.
  extractPptx,
};
