export interface EmojiSuggestionItem {
  emoticon: string;
  emoji: string;
  label: string;
}

const EMOJI_SUGGESTIONS: EmojiSuggestionItem[] = [
  { emoticon: ':)', emoji: '🙂', label: 'Slightly smiling face' },
  { emoticon: ':-)', emoji: '🙂', label: 'Slightly smiling face' },
  { emoticon: ':D', emoji: '😄', label: 'Grinning face' },
  { emoticon: ':-D', emoji: '😄', label: 'Grinning face' },
  { emoticon: ':(', emoji: '🙁', label: 'Slightly frowning face' },
  { emoticon: ':-(', emoji: '🙁', label: 'Slightly frowning face' },
  { emoticon: ":'(", emoji: '😢', label: 'Crying face' },
  { emoticon: ':P', emoji: '😛', label: 'Face with tongue' },
  { emoticon: ':-P', emoji: '😛', label: 'Face with tongue' },
  { emoticon: ':p', emoji: '😛', label: 'Face with tongue' },
  { emoticon: ':-p', emoji: '😛', label: 'Face with tongue' },
  { emoticon: ':O', emoji: '😮', label: 'Surprised face' },
  { emoticon: ':-O', emoji: '😮', label: 'Surprised face' },
  { emoticon: ':o', emoji: '😮', label: 'Surprised face' },
  { emoticon: ':-o', emoji: '😮', label: 'Surprised face' },
  { emoticon: ':|', emoji: '😐', label: 'Neutral face' },
  { emoticon: ':-|', emoji: '😐', label: 'Neutral face' },
  { emoticon: ':/', emoji: '😕', label: 'Confused face' },
  { emoticon: ':-/', emoji: '😕', label: 'Confused face' },
  { emoticon: ':*', emoji: '😘', label: 'Face blowing a kiss' },
  { emoticon: ':-*', emoji: '😘', label: 'Face blowing a kiss' },
];

const EMOJI_BY_EMOTICON = new Map(EMOJI_SUGGESTIONS.map((item) => [item.emoticon, item]));

export function findEmojiSuggestion(emoticon: string): EmojiSuggestionItem | undefined {
  return EMOJI_BY_EMOTICON.get(emoticon);
}
