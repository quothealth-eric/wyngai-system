const { EntityExtractor } = require('./src/lib/context/extract');

async function testExtraction() {
  try {
    const input = { text: 'I live in Florida and have employer coverage' };
    console.log('Testing input:', input.text);

    const slots = EntityExtractor.extractSlots(input);

    console.log('Extracted slots:');
    slots.forEach(slot => {
      console.log(`  ${slot.key}: ${slot.value} (confidence: ${slot.confidence})`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testExtraction();