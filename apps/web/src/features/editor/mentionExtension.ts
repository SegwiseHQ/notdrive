import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { MentionMenu, type MentionItem } from './MentionMenu.js';

/**
 * Build a TipTap Mention extension that uses the supplied member list as the
 * suggestion source. Returned extension stores mentions as nodes with
 * `data-id` (user_id) and `data-label` attrs so they survive HTML round-trips.
 *
 * Called from PageEditor at editor-mount time. We capture members via a
 * function ref so the menu always sees fresh data even if the workspace
 * roster changes while the editor is open.
 */
export function buildMentionExtension(getMembers: () => MentionItem[]) {
  return Mention.configure({
    HTMLAttributes: {
      class:
        'mention rounded-md bg-blue-500/10 px-1 py-0.5 text-blue-600 dark:text-blue-400',
    },
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id}`;
    },
    suggestion: {
      char: '@',
      allowSpaces: false,
      items: ({ query }) => {
        const q = query.trim().toLowerCase();
        const members = getMembers();
        if (!q) return members.slice(0, 8);
        return members
          .filter(
            (m) =>
              m.label.toLowerCase().includes(q) ||
              m.email.toLowerCase().includes(q),
          )
          .slice(0, 8);
      },
      render: () => {
        let component: ReactRenderer<
          { onKeyDown: (e: KeyboardEvent) => boolean },
          // tiptap's SuggestionProps type is generic over the item type;
          // any keeps this wiring code small without compromising the
          // public API of MentionMenu.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          any
        > | null = null;
        let popup: TippyInstance[] | null = null;
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStart: (props: any) => {
            component = new ReactRenderer(MentionMenu, {
              props,
              editor: props.editor,
            });
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onUpdate: (props: any) => {
            component?.updateProps(props);
            if (!props.clientRect) return;
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onKeyDown: (props: any) => {
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
    },
  });
}
