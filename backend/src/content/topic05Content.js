/**
 * Predefined content for the demo study material
 * "Topic05_DigitalSignatures.pdf" (spec sections 15 & 16).
 *
 * ── Real vs simulated ────────────────────────────────────────────────────
 * QUIZ_QUESTIONS below is used in two distinct ways, and the distinction is
 * surfaced to the user in the UI:
 *
 *   1. As a FALLBACK when the live DeepSeek call fails (network/quota/parse
 *      error). The quiz is then marked `source: 'fallback'` so the demo can
 *      always proceed. See services/deepseekService.js.
 *   2. As the seeded demo quiz attached to the sample PDF.
 *
 * STUDY_NOTES / FLASHCARDS / AUDIO_NOTES / VIDEO_SCRIPT are explicitly
 * SIMULATED for the hackathon (spec section 33). They are clearly labelled
 * as such in the UI and are structured so a real generation call can replace
 * them without touching the rest of the app.
 */

const SAMPLE_MATERIAL = {
  filename: 'Topic05_DigitalSignatures.pdf',
  module_code: 'IT2513',
  page_count: 28,
  description: 'Covers hash functions, HMAC, RSA, digital signatures and X.509 certificates for IT2513 Information Security.',
  topics: ['Hashing', 'HMAC', 'RSA', 'Digital Signatures', 'Certificates'],
};

/**
 * Ten questions spanning the five required topics, two per topic. The even
 * split means per-topic scores land on clean 0/50/100% values, which keeps
 * the weak-topic diagnosis easy to read during a live demo.
 */
const QUIZ_QUESTIONS = [
  {
    topic: 'Digital Signatures',
    question_text: 'What is the primary purpose of a digital signature?',
    answer_type: 'multiple_choice',
    option_a: 'Confidentiality',
    option_b: 'Authentication and integrity',
    option_c: 'Compression',
    option_d: 'Password storage',
    correct_answer: 'B',
    explanation: 'A digital signature helps verify the signer and detect whether the signed data has been changed.',
    source_page: 18,
  },
  {
    topic: 'Digital Signatures',
    question_text: 'In RSA-based signing, which key does the signer use to create the signature?',
    answer_type: 'multiple_choice',
    option_a: 'The recipient\'s public key',
    option_b: 'The recipient\'s private key',
    option_c: 'The signer\'s private key',
    option_d: 'A shared symmetric key',
    correct_answer: 'C',
    explanation: 'The signer signs with their own private key, so anyone holding the matching public key can verify it.',
    source_page: 19,
  },
  {
    topic: 'Hashing',
    question_text: 'Which property of a cryptographic hash function means it is infeasible to find two different inputs with the same digest?',
    answer_type: 'multiple_choice',
    option_a: 'Collision resistance',
    option_b: 'Reversibility',
    option_c: 'Idempotence',
    option_d: 'Compression ratio',
    correct_answer: 'A',
    explanation: 'Collision resistance means no two distinct inputs should realistically produce the same hash output.',
    source_page: 6,
  },
  {
    topic: 'Hashing',
    question_text: 'What happens to a SHA-256 digest if a single bit of the input message changes?',
    answer_type: 'multiple_choice',
    option_a: 'Only one bit of the digest changes',
    option_b: 'The digest changes drastically and unpredictably',
    option_c: 'The digest stays the same',
    option_d: 'The digest length increases',
    correct_answer: 'B',
    explanation: 'This is the avalanche effect: a tiny input change produces a completely different digest.',
    source_page: 8,
  },
  {
    topic: 'HMAC',
    question_text: 'What does HMAC provide that a plain hash of the message does not?',
    answer_type: 'multiple_choice',
    option_a: 'Encryption of the message body',
    option_b: 'Integrity plus authentication using a shared secret key',
    option_c: 'Faster hashing performance',
    option_d: 'Non-repudiation for a named individual',
    correct_answer: 'B',
    explanation: 'HMAC mixes a shared secret into the hash, so only key holders can produce or verify a valid tag.',
    source_page: 12,
  },
  {
    topic: 'HMAC',
    question_text: 'Why can HMAC not provide non-repudiation on its own?',
    answer_type: 'multiple_choice',
    option_a: 'Because it uses a hash function',
    option_b: 'Because the key is shared, so either party could have produced the tag',
    option_c: 'Because it produces a short output',
    option_d: 'Because it is not standardised',
    correct_answer: 'B',
    explanation: 'Both parties know the same secret, so neither can prove the other created a given tag. Digital signatures solve this with private keys.',
    source_page: 13,
  },
  {
    topic: 'RSA',
    question_text: 'RSA security fundamentally relies on the difficulty of which mathematical problem?',
    answer_type: 'multiple_choice',
    option_a: 'Sorting large arrays',
    option_b: 'Factoring the product of two large primes',
    option_c: 'Computing a hash preimage',
    option_d: 'Solving linear equations',
    correct_answer: 'B',
    explanation: 'RSA depends on it being impractical to factor a large modulus n back into its two prime factors.',
    source_page: 22,
  },
  {
    topic: 'RSA',
    question_text: 'In RSA, if Alice wants to send Bob a confidential message, which key does she encrypt with?',
    answer_type: 'multiple_choice',
    option_a: 'Bob\'s public key',
    option_b: 'Bob\'s private key',
    option_c: 'Alice\'s private key',
    option_d: 'A session hash',
    correct_answer: 'A',
    explanation: 'Encrypting with Bob\'s public key means only Bob\'s private key can decrypt it.',
    source_page: 23,
  },
  {
    topic: 'Certificates',
    question_text: 'What is the main role of a Certificate Authority (CA)?',
    answer_type: 'multiple_choice',
    option_a: 'To encrypt all traffic on a network',
    option_b: 'To vouch for the binding between an identity and a public key',
    option_c: 'To store users\' private keys',
    option_d: 'To generate session tokens',
    correct_answer: 'B',
    explanation: 'A CA signs certificates, asserting that a given public key really belongs to the named subject.',
    source_page: 25,
  },
  {
    topic: 'Certificates',
    question_text: 'Which field in an X.509 certificate lets a relying party check whether the certificate is still valid today?',
    answer_type: 'multiple_choice',
    option_a: 'Serial Number',
    option_b: 'Subject Public Key Info',
    option_c: 'Validity (Not Before / Not After)',
    option_d: 'Signature Algorithm',
    correct_answer: 'C',
    explanation: 'The Validity field defines the not-before and not-after dates outside which the certificate must be rejected.',
    source_page: 26,
  },
];

// --- Simulated generated resources (clearly labelled in the UI) ---

const STUDY_NOTES = {
  simulated: true,
  title: 'Topic 05 — Digital Signatures: Key Points',
  sections: [
    {
      heading: 'Hash functions',
      points: [
        'A hash maps arbitrary-length input to a fixed-length digest.',
        'Required properties: preimage resistance, second-preimage resistance, collision resistance.',
        'Avalanche effect: one input bit flip changes roughly half the output bits.',
      ],
      source_pages: [6, 8],
    },
    {
      heading: 'HMAC',
      points: [
        'HMAC = hash over a message combined with a shared secret key.',
        'Gives integrity + authentication, but not non-repudiation (key is shared).',
        'Used widely in API request signing and TLS record integrity.',
      ],
      source_pages: [12, 13],
    },
    {
      heading: 'Digital signatures',
      points: [
        'Sign with the private key; verify with the matching public key.',
        'Provides authentication, integrity and non-repudiation.',
        'In practice you sign the hash of a message, not the whole message.',
      ],
      source_pages: [18, 19],
    },
    {
      heading: 'RSA',
      points: [
        'Security rests on the hardness of factoring a large modulus.',
        'Confidentiality: encrypt with the recipient\'s public key.',
        'Signing: encrypt the digest with your own private key.',
      ],
      source_pages: [22, 23],
    },
    {
      heading: 'X.509 certificates',
      points: [
        'A certificate binds an identity to a public key, signed by a CA.',
        'Key fields: Subject, Issuer, Validity, Public Key Info, Signature.',
        'Trust is chained from an end-entity certificate up to a trusted root.',
      ],
      source_pages: [25, 26],
    },
  ],
};

const FLASHCARDS = {
  simulated: true,
  cards: [
    { front: 'Collision resistance', back: 'Infeasible to find two distinct inputs producing the same hash digest.', topic: 'Hashing', source_page: 6 },
    { front: 'Avalanche effect', back: 'A one-bit input change alters the digest drastically.', topic: 'Hashing', source_page: 8 },
    { front: 'HMAC', back: 'Keyed hash giving integrity + authentication using a shared secret.', topic: 'HMAC', source_page: 12 },
    { front: 'Why HMAC ≠ non-repudiation', back: 'The secret is shared, so either party could have produced the tag.', topic: 'HMAC', source_page: 13 },
    { front: 'Signing key', back: 'You sign with your PRIVATE key; others verify with your public key.', topic: 'Digital Signatures', source_page: 19 },
    { front: 'Digital signature guarantees', back: 'Authentication, integrity and non-repudiation.', topic: 'Digital Signatures', source_page: 18 },
    { front: 'RSA hard problem', back: 'Factoring the product of two large primes.', topic: 'RSA', source_page: 22 },
    { front: 'RSA confidentiality', back: 'Encrypt with the recipient\'s public key.', topic: 'RSA', source_page: 23 },
    { front: 'Certificate Authority', back: 'Signs certificates to vouch that a public key belongs to a named subject.', topic: 'Certificates', source_page: 25 },
    { front: 'X.509 Validity field', back: 'Not Before / Not After dates bounding when the certificate is acceptable.', topic: 'Certificates', source_page: 26 },
  ],
};

const AUDIO_NOTES = {
  simulated: true,
  duration_seconds: 210,
  voice: 'Neutral (simulated)',
  transcript: [
    'Welcome to your Topic 5 audio revision on digital signatures.',
    'Start with hashing. A hash takes any input and produces a fixed-length digest. The three properties you need are preimage resistance, second-preimage resistance, and collision resistance.',
    'Next, HMAC. HMAC folds a shared secret into the hash, which gives you integrity and authentication. But because the key is shared, HMAC cannot prove which party produced the tag, so it does not give non-repudiation.',
    'Digital signatures fix that. You sign with your private key, and anyone with your public key can verify. That gives authentication, integrity, and non-repudiation.',
    'For RSA, remember the direction of the keys. To keep something confidential, encrypt with the recipient\'s public key. To sign, use your own private key on the message digest.',
    'Finally, certificates. An X.509 certificate binds an identity to a public key, signed by a certificate authority. Always check the validity dates and the trust chain up to a trusted root.',
    'That is Topic 5. Review pages 18 and 19 for signatures, and pages 25 and 26 for certificates.',
  ],
};

const VIDEO_SCRIPT = {
  simulated: true,
  estimated_runtime: '4 min 30 s',
  scenes: [
    { scene: 1, visual: 'Title card: "Digital Signatures in 5 Minutes"', narration: 'By the end of this video you will know how signing differs from encryption, and why certificates matter.' },
    { scene: 2, visual: 'Animation: arbitrary document shrinking into a fixed-length digest', narration: 'Everything starts with a hash. Any length in, fixed length out, and no two realistic inputs share a digest.' },
    { scene: 3, visual: 'Split screen: HMAC with a shared key vs signature with a key pair', narration: 'HMAC uses one shared secret. Signatures use a key pair. That single difference is why only signatures give non-repudiation.' },
    { scene: 4, visual: 'Flow diagram: hash → encrypt digest with private key → signature appended', narration: 'To sign, you hash the message then encrypt that digest with your private key. The result travels alongside the document.' },
    { scene: 5, visual: 'Verification flow with public key, tick and cross outcomes', narration: 'Verification recomputes the hash and checks it against the decrypted signature. Any tampering breaks the match.' },
    { scene: 6, visual: 'X.509 certificate fields highlighted, chain up to a root CA', narration: 'A certificate is just a signed statement that a public key belongs to someone. Check the validity window and follow the chain to a trusted root.' },
    { scene: 7, visual: 'Recap slide with page references', narration: 'Review pages 18 and 19 for signing, and 25 and 26 for certificates. Then retake the quiz to check your progress.' },
  ],
};

module.exports = {
  SAMPLE_MATERIAL,
  QUIZ_QUESTIONS,
  STUDY_NOTES,
  FLASHCARDS,
  AUDIO_NOTES,
  VIDEO_SCRIPT,
};
