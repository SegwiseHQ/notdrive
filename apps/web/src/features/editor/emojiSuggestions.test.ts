import { describe, expect, it } from 'vitest';
import { findEmojiSuggestion } from './emojiSuggestions.js';

describe('findEmojiSuggestion', () => {
  it.each([
    [':)', '🙂'],
    [':-)', '🙂'],
    [':D', '😄'],
    [':(', '🙁'],
    [":'(", '😢'],
    [':P', '😛'],
    [':O', '😮'],
    [':|', '😐'],
    [':/', '😕'],
    [':*', '😘'],
  ])('maps %s to %s', (emoticon, emoji) => {
    expect(findEmojiSuggestion(emoticon)?.emoji).toBe(emoji);
  });

  it('does not suggest a conversion for incomplete or unknown text', () => {
    expect(findEmojiSuggestion(':')).toBeUndefined();
    expect(findEmojiSuggestion(':hello')).toBeUndefined();
  });
});
