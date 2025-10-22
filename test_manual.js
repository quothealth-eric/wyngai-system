// Manual test to debug extraction
console.log('=== Test 1: Turn 1 ===');
const text1 = 'I live in Florida and have employer coverage';
testCoverageExtraction(text1);

console.log('\n=== Test 2: Turn 3 ===');
const text3 = 'Can I switch to marketplace coverage?';
testCoverageExtraction(text3);

console.log('\n=== Test 3: Mixed Text ===');
const text4 = 'I have employer insurance and live in Florida. I want to switch to marketplace.';
testCoverageExtraction(text4);

console.log('\n=== Test 4: Just employer insurance ===');
const text5 = 'I have employer insurance in Florida';
testCoverageExtraction(text5);

function testCoverageExtraction(text) {
  console.log('Testing text:', text);

  // Test explicit patterns
  const explicitPatterns = [
    { pattern: /\b(have|with|on|under)\s+(employer|job|work|company)\s*(insurance|plan|coverage|health)\b/i, value: 'employer' },
    { pattern: /\b(have|with|on|under)\s+(marketplace|aca|obamacare|exchange)\s*(plan|insurance|coverage)\b/i, value: 'marketplace' },
    { pattern: /\b(have|with|on|under)\s+(medicaid|medicare)\b/i, value: (match) => match.includes('medicaid') ? 'medicaid' : 'medicare' },
    { pattern: /\b(have|with|on|under)\s+(cobra)\s*(coverage|plan)?\b/i, value: 'cobra' },
    { pattern: /\b(no|without|don't have|uninsured)\s*(insurance|coverage)\b/i, value: 'none' }
  ];

  console.log('Checking explicit patterns:');
  for (const { pattern, value } of explicitPatterns) {
    const match = text.match(pattern);
    if (match) {
      const result = typeof value === 'function' ? value(match[0]) : value;
      console.log(`  FOUND: ${result} (explicit)`);
      console.log('');
      return;
    }
  }
  console.log('  No explicit patterns found');

  // Check if intent language blocks implicit patterns
  const intentPattern = /\b(switch|change|move|want|need|can\s+i)\s+to\s+(marketplace|employer|medicaid|medicare|cobra)/i;
  const hasIntent = intentPattern.test(text);
  console.log('Intent pattern check:', hasIntent ? 'BLOCKS implicit' : 'allows implicit');

  if (!hasIntent) {
    console.log('Checking implicit patterns:');
    const implicitPatterns = [
      { pattern: /\b(employer|job|work|company)\s*(insurance|plan|coverage|health)\b/i, value: 'employer' },
      { pattern: /\b(marketplace|aca|obamacare|exchange)\s*(plan|insurance|coverage)\b/i, value: 'marketplace' },
      { pattern: /\b(medicaid|medicare)\b/i, value: (match) => match.toLowerCase() },
      { pattern: /\b(cobra)\s*(coverage|plan)?\b/i, value: 'cobra' }
    ];

    for (const { pattern, value } of implicitPatterns) {
      const match = text.match(pattern);
      if (match) {
        const result = typeof value === 'function' ? value(match[0]) : value;
        console.log(`  FOUND: ${result} (implicit)`);
        console.log('');
        return;
      }
    }
    console.log('  No implicit patterns found');
  }

  console.log('  -> No coverage extracted');
  console.log('');
}