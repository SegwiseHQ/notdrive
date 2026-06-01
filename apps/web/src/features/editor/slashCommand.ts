import { Extension, type Editor, type Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { SlashMenu, SLASH_ITEMS, type SlashItem } from './SlashMenu.js';

type SuggestionProps = {
  editor: Editor;
  range: Range;
  query: string;
  command: (item: SlashItem) => void;
  items: SlashItem[];
  clientRect?: (() => DOMRect | null) | null;
};

// Holds the current SlashCommand options so the static suggestion config
// (built once at addOptions time) can read fresh option values like itemId.
const extOpts: { itemId?: string } = {};

export const SlashCommand = Extension.create<{ itemId?: string }>({
  name: 'slashCommand',

  addOptions() {
    return {
      // Item id is needed for commands that upload server-side (e.g. /image).
      // Undefined means upload-requiring commands no-op silently.
      itemId: undefined,
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range, itemId: extOpts.itemId });
        },
      } satisfies Partial<SuggestionOptions<SlashItem>>,
    };
  },

  onCreate() {
    extOpts.itemId = this.options.itemId;
  },
  onUpdate() {
    extOpts.itemId = this.options.itemId;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }) => {
          const q = query.toLowerCase();
          return SLASH_ITEMS.filter(
            (i) => i.title.toLowerCase().includes(q) || i.keywords?.some((k) => k.includes(q)),
          ).slice(0, 10);
        },
        render: () => {
          let component: ReactRenderer<{ onKeyDown: (e: KeyboardEvent) => boolean }, SuggestionProps> | null = null;
          let popup: TippyInstance[] | null = null;
          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              if (!props.clientRect) return;
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              if (!props.clientRect) return;
              popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              popup?.[0]?.destroy();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});
