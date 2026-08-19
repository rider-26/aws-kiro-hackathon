/* eslint-disable no-console */
require('dotenv').config();

/**
 * Proves a generated quiz is actually based on the UPLOADED FILE, not on a
 * hardcoded topic list.
 *
 * This exists because of a specific bug: quiz generation used to send only the
 * filename plus the bundled cryptography topic list, so uploading an economics
 * PDF produced questions about password hashing while the UI still claimed the
 * quiz came from your material. A passing smoke test on the AI call itself did
 * not catch it, because the call genuinely succeeded — it was just answering the
 * wrong question. So this test builds a PDF about a subject the seeded bank knows
 * nothing about, and fails if crypto terms come back.
 *
 * Usage: npm run smoke:grounded   (with `npm run dev` running)
 */

const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Builds a real PDF with a genuine, extractable text layer.
 *
 * Uses pdf-lib (a devDependency) rather than hand-assembling the file format.
 * A hand-rolled PDF has to get xref byte offsets and stream lengths exactly
 * right, and when it doesn't, the parser reports "Invalid PDF structure" — which
 * looks identical to the product being broken. The fixture must be
 * unquestionably valid for a failure here to mean anything.
 */
async function buildPdf(lines) {
  // eslint-disable-next-line global-require
  const { PDFDocument, StandardFonts } = require('pdf-lib');

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);

  lines.forEach((line, i) => {
    page.drawText(line, { x: 40, y: 780 - i * 20, size: 11, font });
  });

  return Buffer.from(await doc.save());
}

// Deliberately a subject with ZERO overlap with the seeded IT2513 crypto bank.
const ECONOMICS_LINES = [
  'Lecture 4 Price, Income and Cross Elasticities',
  'Price elasticity of demand measures how responsive quantity demanded is to a',
  'change in price. It is calculated as the percentage change in quantity demanded',
  'divided by the percentage change in price.',
  'Demand is described as elastic when the absolute value of price elasticity is',
  'greater than one, and inelastic when it is less than one.',
  'Income elasticity of demand measures responsiveness of demand to a change in',
  'consumer income. Normal goods have a positive income elasticity, while inferior',
  'goods have a negative income elasticity.',
  'Luxury goods typically have an income elasticity greater than one.',
  'Cross elasticity of demand measures how the quantity demanded of one good',
  'responds to a price change in another good.',
  'Substitute goods have a positive cross elasticity of demand, because a rise in',
  'the price of one increases demand for the other.',
  'Complementary goods have a negative cross elasticity of demand.',
  'Total revenue rises when price falls if demand is price elastic.',
  'Determinants of price elasticity include availability of close substitutes, the',
  'proportion of income spent on the good, and the time horizon considered.',
];

const CRYPTO_TERMS = /hash|hmac|rsa|digital signature|certificate|salt|encrypt|sha-?256|public key|cipher/i;
const ECON_TERMS = /elastic|demand|income|revenue|substitute|complement|price|good/i;

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

async function main() {
  console.log(`\nGrounded quiz generation test against ${BASE}\n`);

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'jinyu@student.demo', password: 'demo1234' },
  });
  const token = login.body?.data?.token;
  check('signed in as the demo tutee', !!token, `status ${login.status}`);
  if (!token) return;

  // --- Upload a real economics PDF ------------------------------------------
  const pdf = await buildPdf(ECONOMICS_LINES);
  const filename = 'Lecture 4 Price, Income and Cross Elasticities.pdf';

  const signed = await api('/api/study-materials/upload-url', {
    method: 'POST', token,
    body: { filename, content_type: 'application/pdf' },
  });
  const { upload_url, file_reference } = signed.body?.data || {};
  check('received an upload URL', !!upload_url, `status ${signed.status}`);
  if (!upload_url) return;

  const put = await fetch(upload_url, {
    method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf,
  });
  check('uploaded the PDF', put.ok, `status ${put.status}`);

  const registered = await api('/api/study-materials', {
    method: 'POST', token, body: { filename, file_reference },
  });
  const material = registered.body?.data?.material;
  check('registered the material', !!material, `status ${registered.status}`);
  if (!material) return;

  // --- Generate and inspect --------------------------------------------------
  console.log('\nGenerating (the model has to read the document, so allow ~10-30s)...\n');
  const gen = await api('/api/quizzes/generate', {
    method: 'POST', token,
    body: { study_material_id: material.id, question_count: 6 },
  });

  const quiz = gen.body?.data?.quiz;
  const questions = gen.body?.data?.questions || [];
  check('quiz generated', gen.status === 201 && !!quiz, `status ${gen.status}`);
  if (!quiz) {
    console.log(JSON.stringify(gen.body, null, 2).slice(0, 600));
    return;
  }

  check('came from the live model, not the seeded bank', quiz.source === 'deepseek',
    `source=${quiz.source}${quiz.fallback_reason ? ` (${quiz.fallback_reason})` : ''}`);
  check('flagged as grounded in the uploaded document', quiz.grounded === true,
    `grounded=${quiz.grounded}`);

  const allText = questions
    .map((q) => `${q.topic} ${q.question_text} ${q.option_a} ${q.option_b} ${q.option_c} ${q.option_d}`)
    .join('\n');

  // The regression itself: crypto content from an economics document.
  const cryptoHit = allText.match(CRYPTO_TERMS);
  check('contains NO cryptography content', !cryptoHit,
    cryptoHit ? `found "${cryptoHit[0]}" — questions are not from the document` : '');

  check('contains economics content from the document', ECON_TERMS.test(allText));

  const topics = [...new Set(questions.map((q) => q.topic))];
  check('topics derived from the document, not the seeded list', topics.length > 0
    && !topics.some((t) => CRYPTO_TERMS.test(t)), `topics: ${topics.join(', ')}`);

  check('every question is well formed', questions.every((q) => q.question_text
    && q.option_a && q.option_b && q.option_c && q.option_d));

  console.log(`\n  topics: ${topics.join(', ')}`);
  if (questions[0]) {
    console.log('\n  Sample question:');
    console.log(`    [${questions[0].topic}] ${questions[0].question_text}`);
    console.log(`      A. ${questions[0].option_a}`);
    console.log(`      B. ${questions[0].option_b}`);
    console.log(`      C. ${questions[0].option_c}`);
    console.log(`      D. ${questions[0].option_d}`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nCould not run against ${BASE}: ${err.message}`);
  console.error('Is the backend running? `npm run dev` in /backend.\n');
  process.exit(1);
});
