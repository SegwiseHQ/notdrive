import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  FolderPlus,
  Globe,
  ListChecks,
  Plus,
  Presentation,
  Shapes,
  Sheet,
  SquarePen,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { http } from '../../lib/http.js';

interface Option {
  label: string;
  defaultName: string;
  mime: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const OPTIONS: Option[] = [
  {
    label: 'Google Doc',
    defaultName: 'Untitled document',
    mime: 'application/vnd.google-apps.document',
    Icon: FileText,
  },
  {
    label: 'Google Sheet',
    defaultName: 'Untitled spreadsheet',
    mime: 'application/vnd.google-apps.spreadsheet',
    Icon: Sheet,
  },
  {
    label: 'Google Slides',
    defaultName: 'Untitled presentation',
    mime: 'application/vnd.google-apps.presentation',
    Icon: Presentation,
  },
  {
    label: 'Google Drawing',
    defaultName: 'Untitled drawing',
    mime: 'application/vnd.google-apps.drawing',
    Icon: Shapes,
  },
  {
    label: 'Google Form',
    defaultName: 'Untitled form',
    mime: 'application/vnd.google-apps.form',
    Icon: ListChecks,
  },
  {
    label: 'Google Script',
    defaultName: 'Untitled script',
    mime: 'application/vnd.google-apps.script',
    Icon: SquarePen,
  },
  {
    label: 'Google Site',
    defaultName: 'Untitled site',
    mime: 'application/vnd.google-apps.site',
    Icon: Globe,
  },
  {
    label: 'Folder',
    defaultName: 'Untitled folder',
    mime: 'application/vnd.google-apps.folder',
    Icon: FolderPlus,
  },
];

export function CreateDriveMenu({
  parentFolderId,
  trigger,
  createPage = false,
  onCreated,
}: {
  parentFolderId?: string;
  trigger?: React.ReactNode;
  createPage?: boolean;
  onCreated?: (result: { driveFileId: string; itemId: string | null }) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { wsId = '' } = useParams();

  const create = useMutation({
    mutationFn: ({ option, name }: { option: Option; name: string }) =>
      http.createDriveFile({
        name,
        mime_type: option.mime,
        parent_folder_id: parentFolderId,
        create_page: createPage && option.mime !== 'application/vnd.google-apps.folder',
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['drive-tree'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      toast.success(`Created ${res.file.name}`);
      onCreated?.({ driveFileId: res.file.drive_file_id, itemId: res.item?.id ?? null });
      // Always open the Google editor in a new tab so the user can start
      // editing immediately — the iframe preview is read-only by Google's design.
      if (res.file.web_view_link && !res.file.is_folder) {
        window.open(res.file.web_view_link, '_blank', 'noopener');
      }
      if (res.item) navigate(`/w/${wsId}/i/${res.item.id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const onPick = (option: Option) => {
    const name = window.prompt(`Name for new ${option.label}`, option.defaultName);
    if (!name || !name.trim()) return;
    create.mutate({ option, name: name.trim() });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="size-3" /> New
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 w-52 rounded-md border border-border bg-card p-1 shadow-lg"
        >
          {OPTIONS.map((opt) => (
            <DropdownMenu.Item
              key={opt.mime}
              onSelect={() => onPick(opt)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
            >
              <opt.Icon className="size-3.5 text-muted-foreground" />
              <span>{opt.label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
