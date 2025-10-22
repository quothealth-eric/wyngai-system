// Test household extraction
const text = "My wife and I have a newborn baby";

const patterns = [
  /\b(married|spouse|husband|wife)\b.*\b(child|children|kid|baby|son|daughter)\b/i,
  /\b(child|children|kid|baby|son|daughter)\b.*\b(married|spouse|husband|wife)\b/i,
  /\bfamily\s+of\s+(\d+)\b/i,
  /\b(spouse|husband|wife)\s+(just\s+)?(lost|losing|lose)\s+coverage\b/i,
  /\b(married|spouse|husband|wife)\b/i,
  /\b(child|children|kid|baby|son|daughter)\b/i,
  /\bnewborn|new\s+baby|having\s+a\s+baby\b/i
];

console.log('Testing text:', text);
console.log('');

patterns.forEach((pattern, index) => {
  const match = text.match(pattern);
  console.log(`Pattern ${index + 1}:`, pattern);
  console.log('  Match:', match);
  if (match) {
    const matchText = match[0].toLowerCase();
    console.log('  MatchText:', matchText);

    // Check for spouse + child combinations
    if ((matchText.includes('married') || matchText.includes('spouse') || matchText.includes('wife') || matchText.includes('husband')) &&
        (matchText.includes('child') || matchText.includes('baby') || matchText.includes('newborn'))) {
      console.log('  -> spouse+child');
    } else if (matchText.includes('spouse') || matchText.includes('husband') || matchText.includes('wife') || matchText.includes('married')) {
      console.log('  -> spouse');
    } else if (matchText.includes('child') || matchText.includes('baby') || matchText.includes('newborn')) {
      console.log('  -> child');
    }
  }
  console.log('');
});