import { type Editor, Extension, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { ComponentProps } from 'react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { EmojiMenu } from './EmojiMenu.js';
import { type EmojiSuggestionItem, findEmojiSuggestion } from './emojiSuggestions.js';

type EmojiSuggestionProps = {
  editor: Editor;
  range: Range;
  query: string;
  command: (item: EmojiSuggestionItem) => void;
  items: EmojiSuggestionItem[];
  clientRect?: (() => DOMRect | null) | null;
};

type EmojiMenuProps = ComponentProps<typeof EmojiMenu>;

const emojiSuggestionPluginKey = new PluginKey('emojiSuggestion');

export const EmojiSuggestion = Extension.create({
  name: 'emojiSuggestion',

  addProseMirrorPlugins() {
    return [
      Suggestion<EmojiSuggestionItem, EmojiSuggestionItem>({
        editor: this.editor,
        pluginKey: emojiSuggestionPluginKey,
        char: ':',
        // Emoticons often directly follow a word or punctuation, so do not
        // require a space before the trigger.
        allowedPrefixes: null,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name === 'codeBlock') return false;
          if ($from.marks().some((mark) => mark.type.name === 'code')) return false;
          return Boolean(findEmojiSuggestion(state.doc.textBetween(range.from, range.to)));
        },
        items: ({ query }) => {
          const item = findEmojiSuggestion(`:${query}`);
          return item ? [item] : [];
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).insertContent(props.emoji).run();
        },
        render: () => {
          let component: ReactRenderer<
            { onKeyDown: (event: KeyboardEvent) => boolean },
            EmojiMenuProps
          > | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: EmojiSuggestionProps) => {
              const renderer = new ReactRenderer<
                { onKeyDown: (event: KeyboardEvent) => boolean },
                EmojiMenuProps
              >(EmojiMenu, { props, editor: props.editor });
              component = renderer;
              if (!props.clientRect) return;
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: renderer.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },
            onUpdate: (props: EmojiSuggestionProps) => {
              component?.updateProps(props);
              if (!props.clientRect) return;
              popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              });
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              component?.destroy();
              popup?.[0]?.destroy();
              component = null;
              popup = null;
            },
          };
        },
      }),
    ];
  },
});
