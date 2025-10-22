const { describe, it, expect } = require('@jest/globals');

describe('Simple Debug Test', () => {
  it('should show console output', () => {
    console.log('This is a test console output');
    expect(1 + 1).toBe(2);
  });
});