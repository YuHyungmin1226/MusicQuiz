import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

// Evaluate the QUESTIONS literal directly instead of hand-rolling a parser.
// The previous regex-based parser failed on the `form` category (special
// characters such as ♭ / "..." broke the JSON conversion) and emitted
// false-positive DUPLICATE / missing-explain errors.
function extractConst(name) {
  const pattern = /const QUESTIONS=([\s\S]*?\n};)/;
  const match = html.match(pattern);
  if (!match) throw new Error(`${name} 선언을 찾을 수 없습니다.`);
  return Function(`return (${match[1].slice(0, -1)});`)();
}

const QUESTIONS = extractConst('QUESTIONS');

console.log('Question counts per category:');
for (const [cat, qs] of Object.entries(QUESTIONS)) {
  console.log(`  ${cat}: ${qs.length}`);
}

const total = Object.values(QUESTIONS).reduce((s, a) => s + a.length, 0);
console.log(`\nTotal questions: ${total}`);

// Validate all questions
let errors = [];
let warnings = [];
const seen = {};

for (const [cat, qs] of Object.entries(QUESTIONS)) {
  qs.forEach((q, i) => {
    // Check ans is valid
    if (typeof q.opts === 'object' && Array.isArray(q.opts)) {
      if (q.ans < 0 || q.ans >= q.opts.length) {
        errors.push(`${cat}[${i}]: ans index ${q.ans} out of bounds (opts length ${q.opts.length}) — "${q.q?.slice(0, 50)}"`);
      }
      if (q.opts.length !== 4) {
        warnings.push(`${cat}[${i}]: opts length ${q.opts.length} (expected 4) — "${q.q?.slice(0, 50)}"`);
      }
    }
    
    // Check for duplicates
    if (q.q) {
      if (seen[q.q]) {
        errors.push(`${cat}[${i}]: DUPLICATE question — "${q.q.slice(0, 50)}" (also at ${seen[q.q]})`);
      } else {
        seen[q.q] = `${cat}[${i}]`;
      }
    }
    
    // Check explain exists
    if (!q.explain) {
      warnings.push(`${cat}[${i}]: missing explain — "${q.q?.slice(0, 50)}"`);
    }
    
    // Check notation consistency
    if (q.notation) {
      if (!['note', 'rest'].includes(q.notation.type)) {
        errors.push(`${cat}[${i}]: unknown notation type "${q.notation.type}"`);
      }
    }
  });
}

console.log('\nValidation results:');
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ ALL CLEAN — no issues found');
} else {
  if (errors.length) {
    console.log(`\n❌ ERRORS (${errors.length}):`);
    errors.forEach(e => console.log(`  • ${e}`));
  }
  if (warnings.length) {
    console.log(`\n⚠️ WARNINGS (${warnings.length}):`);
    warnings.forEach(w => console.log(`  • ${w}`));
  }
}

// Specific checks for tempo consistency
console.log('\n=== Tempo question cross-check ===');
const tempoQs = (QUESTIONS.mark || []).filter(q => 
  q.q.includes('Vivace') || q.q.includes('Presto') || q.q.includes('Allegro') || 
  q.q.includes('Andante') || q.q.includes('Adagio') || q.q.includes('Largo') ||
  q.q.includes('Lento') || q.q.includes('Moderato')
);
for (const q of tempoQs) {
  console.log(`  q="${q.q.slice(0, 45)}" ans=${q.ans} opts=${JSON.stringify(q.opts)}`);
}

// Exit with error code if issues
process.exit(errors.length > 0 ? 1 : 0);
