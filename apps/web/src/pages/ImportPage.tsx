import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileArchive, Lock, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useDocumentTitle } from '../lib/documentTitle.js';
import { http } from '../lib/http.js';

interface ImportResult {
  created: number;
  skipped: number;
  total_files: number;
  errors: Array<{ path: string; reason: string }>;
}

export function ImportPage() {
  const qc = useQueryClient();
  useDocumentTitle('Import');
  const navigate = useNavigate();
  const { wsId = '' } = useParams();
  const [file, setFile] = useState<File | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = useMutation({
    mutationFn: (f: File) => http.importZip(f, { private: isPrivate }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['items'] });
      toast.success(`Imported ${r.created} page${r.created === 1 ? '' : 's'}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col px-12 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a ZIP of Markdown files. Folder structure becomes the page hierarchy. Each{' '}
          <code className="rounded bg-muted px-1">.md</code> file becomes a NotDrive page; its first
          H1 (if any) is used as the title, otherwise the filename.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-10 text-center transition hover:border-foreground/40 hover:bg-muted/50">
        <FileArchive className="size-10 text-muted-foreground" />
        <div className="text-sm">
          {file ? (
            <>
              <span className="font-medium">{file.name}</span>{' '}
              <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
            </>
          ) : (
            <>
              <span className="font-medium">Click to choose a ZIP</span>{' '}
              <span className="text-muted-foreground">or drag-drop here</span>
            </>
          )}
        </div>
        <input
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setResult(null);
          }}
        />
      </label>

      <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs hover:bg-muted/40">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 font-medium">
            <Lock className="size-3" /> Make this import private to me
          </span>
          <span className="text-muted-foreground">
            Only you will see these pages. Other workspace members won't see them in the sidebar,
            search results, or anywhere else. You can flip individual pages back to
            workspace-visible later.
          </span>
        </div>
      </label>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => file && upload.mutate(file)}
          disabled={!file || upload.isPending}
          className="flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          <Upload className="size-3" /> {upload.isPending ? 'Importing…' : 'Import'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => navigate(`/w/${wsId}`)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            View imported pages
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Limits: 50 MB uncompressed total, 1000 files, 400 KB per markdown file. Non-.md files and
        dotfiles are skipped.
      </p>

      {result && (
        <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
          <div className="text-sm font-medium">Result</div>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">{result.created}</span> page
              {result.created === 1 ? '' : 's'} created
            </li>
            <li>
              <span className="font-medium text-foreground">{result.skipped}</span> non-markdown
              file{result.skipped === 1 ? '' : 's'} skipped
            </li>
            <li>
              <span className="font-medium text-foreground">{result.total_files}</span> total
              entries in archive
            </li>
            {result.errors.length > 0 && (
              <li>
                <span className="font-medium text-destructive">{result.errors.length}</span> error
                {result.errors.length === 1 ? '' : 's'}:
                <ul className="mt-1 ml-3 flex flex-col gap-0.5">
                  {result.errors.slice(0, 10).map((e) => (
                    <li key={`${e.path}-${e.reason}`} className="truncate">
                      <code className="text-foreground/80">{e.path}</code> — {e.reason}
                    </li>
                  ))}
                  {result.errors.length > 10 && (
                    <li className="text-muted-foreground/70">
                      …and {result.errors.length - 10} more
                    </li>
                  )}
                </ul>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
