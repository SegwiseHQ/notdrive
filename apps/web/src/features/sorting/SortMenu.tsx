import type { ContentSort } from '@notdrive/shared';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowDownAZ, Check, Clock3 } from 'lucide-react';
import { cn } from '../../lib/utils.js';

type SortOption = {
  value: ContentSort;
  label: string;
  description: string;
  Icon: typeof Clock3;
};

const modifiedOption: SortOption = {
  value: 'modified',
  label: 'Modified',
  description: 'Newest first',
  Icon: Clock3,
};

const alphabeticalOption: SortOption = {
  value: 'alphabetical',
  label: 'Alphabetical',
  description: 'A–Z',
  Icon: ArrowDownAZ,
};

const options = [modifiedOption, alphabeticalOption];

export function SortMenu({
  value,
  onChange,
  showLabel = false,
}: {
  value: ContentSort;
  onChange: (value: ContentSort) => void;
  showLabel?: boolean;
}) {
  const selected = value === 'alphabetical' ? alphabeticalOption : modifiedOption;
  const SelectedIcon = selected.Icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'flex items-center rounded text-muted-foreground transition hover:bg-background hover:text-foreground',
            showLabel ? 'gap-1 border border-border px-2 py-1 text-xs' : 'p-0.5',
          )}
          aria-label={`Sort by ${selected.label}, ${selected.description}`}
          title={`Sort by ${selected.label} · ${selected.description}`}
        >
          <SelectedIcon className="size-3.5" />
          {showLabel && <span>{selected.label}</span>}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 w-52 rounded-md border border-border bg-card p-1 shadow-lg"
        >
          <DropdownMenu.Label className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sort by
          </DropdownMenu.Label>
          {options.map(({ value: optionValue, label, description, Icon }) => (
            <DropdownMenu.Item
              key={optionValue}
              onSelect={() => onChange(optionValue)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
            >
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block">{label}</span>
                <span className="block text-[11px] text-muted-foreground">{description}</span>
              </span>
              {value === optionValue && <Check className="size-3.5" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
