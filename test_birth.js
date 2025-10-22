// Test qualifying event extraction
const text = "My wife and I have a newborn baby";

const patterns = [
  { pattern: /\b(lost|losing|lose)\s+(coverage|insurance|job)\b/i, value: 'losing coverage' },
  { pattern: /\b(new\s+baby|newborn|birth|pregnant|having\s+a\s+baby)\b/i, value: 'birth' },
  { pattern: /\b(married|getting\s+married|wedding)\b/i, value: 'marriage' },
  { pattern: /\b(moved|moving|relocat|new\s+address)\b/i, value: 'move' },
  { pattern: /\b(divorced|separation)\b/i, value: 'divorce' }
];

console.log('Testing text:', text);
console.log('');

patterns.forEach(({ pattern, value }, index) => {
  const match = pattern.test(text);
  console.log(`Pattern ${index + 1}:`, pattern);
  console.log('  Match:', match ? 'YES' : 'no');
  if (match) {
    console.log('  Value:', value);
  }
  console.log('');
});

// Test individual parts
console.log('Testing individual patterns:');
console.log('new\\s+baby:', /\bnew\s+baby\b/i.test(text));
console.log('newborn:', /\bnewborn\b/i.test(text));
console.log('birth:', /\bbirth\b/i.test(text));
console.log('newborn baby:', /\bnewborn\s+baby\b/i.test(text));