// Test if lowercase affects pattern matching
const text = 'I live in Florida and have employer coverage';
const lowerText = text.toLowerCase();

console.log('Original text:', text);
console.log('Lower text:', lowerText);

const pattern = /\b(employer|job|work|company)\s*(insurance|plan|coverage|health)\b/i;

console.log('Pattern (case insensitive):', pattern);
console.log('Original match:', text.match(pattern));
console.log('Lower match:', lowerText.match(pattern));