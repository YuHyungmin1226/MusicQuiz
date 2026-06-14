import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Extract the QUESTIONS object by finding the array boundaries
function extractQuestions(html) {
  const qStart = html.indexOf('const QUESTIONS=');
  const qEnd = html.indexOf('const state=', qStart);
  const src = html.substring(qStart + 'const QUESTIONS='.length, qEnd).trim();
  return parseQuestions(src);
}

function parseQuestions(src) {
  // The source looks like: {note:[{...},{...}], scale:[...], rhythm:[...], ...}
  // We need to find each category array
  const cats = ['note', 'scale', 'rhythm', 'mark', 'chord', 'inst', 'form'];
  const result = {};

  let pos = 0;
  // Skip opening {
  if (src[pos] === '{') pos++;
  
  for (const cat of cats) {
    // Find category key
    const keyStart = src.indexOf(cat + ':', pos);
    if (keyStart < 0) {
      console.error(`Category ${cat} not found after position ${pos}`);
      continue;
    }
    
    // Find opening bracket
    const arrStart = src.indexOf('[', keyStart);
    if (arrStart < 0) break;
    
    // Find closing bracket (track depth)
    let depth = 0;
    let arrEnd = arrStart;
    for (let i = arrStart; i < src.length; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') {
        depth--;
        if (depth === 0) {
          arrEnd = i;
          break;
        }
      }
    }
    
    const arrStr = src.substring(arrStart, arrEnd + 1);
    
    // Convert JS object notation to JSON for parsing
    // 1. Single quotes to double quotes
    // 2. Unquoted keys to quoted keys
    let json = arrStr
      .replace(/'/g, '"')
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
    
    try {
      result[cat] = JSON.parse(json);
    } catch (e) {
      console.error(`Failed to parse ${cat}: ${e.message}`);
      // Try manual counting of objects
      const objMatches = arrStr.match(/\{[^}]+?\}/g);
      result[cat] = objMatches ? objMatches.map(m => {
        const qMatch = m.match(/q:'([^']+)'/);
        const ansMatch = m.match(/ans:(\d+)/);
        const optsMatch = m.match(/opts:\[([^\]]+)\]/);
        return {
          q: qMatch ? qMatch[1] : '?',
          ans: ansMatch ? parseInt(ansMatch[1]) : -1,
          opts: optsMatch ? optsMatch[1].split(',').length : 0
        };
      }) : [];
    }
    
    pos = arrEnd + 1;
  }
  
  return result;
}

const QUESTIONS = extractQuestions(html);

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
