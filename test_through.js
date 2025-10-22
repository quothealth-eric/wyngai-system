// Test "through employer" pattern
const text = "I currently have health insurance through my employer";

const explicitPatterns = [
  // Direct patterns: "have employer insurance"
  { pattern: /\b(have|with|on|under)\s+(employer|job|work|company)\s*(insurance|plan|coverage|health)\b/i, value: 'employer' },
  { pattern: /\b(have|with|on|under)\s+(marketplace|aca|obamacare|exchange)\s*(plan|insurance|coverage)\b/i, value: 'marketplace' },
  { pattern: /\b(have|with|on|under)\s+(medicaid|medicare)\b/i, value: (match) => match.includes('medicaid') ? 'medicaid' : 'medicare' },
  { pattern: /\b(have|with|on|under)\s+(cobra)\s*(coverage|plan)?\b/i, value: 'cobra' },

  // "Through" patterns: "have insurance through employer"
  { pattern: /\b(have|with|on|under)\s+.*\b(insurance|plan|coverage|health)\b.*\bthrough\s+(my\s+)?(employer|job|work|company)\b/i, value: 'employer' },
  { pattern: /\b(have|with|on|under)\s+.*\b(insurance|plan|coverage|health)\b.*\bthrough\s+(the\s+)?(marketplace|aca|obamacare|exchange)\b/i, value: 'marketplace' },
  { pattern: /\b(have|with|on|under)\s+.*\b(insurance|plan|coverage|health)\b.*\bthrough\s+(medicaid|medicare)\b/i, value: (match) => match.includes('medicaid') ? 'medicaid' : 'medicare' },

  { pattern: /\b(no|without|don't have|uninsured)\s*(insurance|coverage)\b/i, value: 'none' }
];

console.log('Testing text:', text);
console.log('');

explicitPatterns.forEach(({ pattern, value }, index) => {
  const match = text.match(pattern);
  console.log(`Pattern ${index + 1}:`, pattern);
  console.log('  Match:', match);
  if (match) {
    const result = typeof value === 'function' ? value(match[0]) : value;
    console.log('  Value:', result);
  }
  console.log('');
});

// Test if the issue is the "through" word
console.log('Testing alternative patterns:');
console.log('have.*employer:', /\bhave\b.*\bemployer\b/i.test(text));
console.log('have.*insurance.*employer:', /\bhave\b.*\binsurance\b.*\bemployer\b/i.test(text));