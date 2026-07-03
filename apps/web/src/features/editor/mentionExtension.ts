import type { Editor, Range } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { type MentionItem, MentionMenu } from './MentionMenu.js';

type MentionSuggestionProps = {
  editor: Editor;
  range: Range;
  query: string;
  command: (item: { id: string; label: string }) => void;
  items: MentionItem[];
  clientRect?: (() => DOMRect | null) | null;
};

type MentionKeyDownProps = {
  event: KeyboardEvent;
};

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
      class: 'mention rounded-md bg-blue-500/10 px-1 py-0.5 text-blue-600 dark:text-blue-400',
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
          .filter((m) => m.label.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
          .slice(0, 8);
      },
      render: () => {
        let component: ReactRenderer<
          { onKeyDown: (e: KeyboardEvent) => boolean },
          MentionSuggestionProps
        > | null = null;
        let popup: TippyInstance[] | null = null;
        return {
          onStart: (props: MentionSuggestionProps) => {
            const renderer = new ReactRenderer<
              { onKeyDown: (e: KeyboardEvent) => boolean },
              MentionSuggestionProps
            >(MentionMenu, {
              props,
              editor: props.editor,
            });
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
          onUpdate: (props: MentionSuggestionProps) => {
            component?.updateProps(props);
            if (!props.clientRect) return;
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          },
          onKeyDown: (props: MentionKeyDownProps) => {
            if (props.event.key === 'Escape') {
              popup?.[0]?.hide();
              return true;
            }
            return component?.ref?.onKeyDown(props.event) ?? false;
          },
          onExit: () => {
            // Unmount React before tippy detaches its content element. The
            // reverse order can leave React cleaning up DOM that tippy has
            // already moved/removed during editor teardown.
            component?.destroy();
            popup?.[0]?.destroy();
            component = null;
            popup = null;
          },
        };
      },
    },
  });
}
