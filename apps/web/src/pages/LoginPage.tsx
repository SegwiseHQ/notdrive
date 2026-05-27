import { useSearchParams } from 'react-router-dom';
import { apiOrigin } from '../lib/api.js';

export function LoginPage() {
  const [params] = useSearchParams();
  const error = params.get('error');
  const domain = params.get('domain');
  const href = `${apiOrigin()}/api/auth/google/start`;

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col gap-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/icon.png" alt="NotDrive" className="size-10 rounded-md" />
          <div>
            <h1 className="text-xl font-semibold">NotDrive</h1>
            <p className="text-xs text-muted-foreground">
              A structured navigation layer for Google Drive.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Sign in with Google to continue — NotDrive requests Drive access to list, preview, and link
          your files.
        </p>

        {error === 'domain_not_allowed' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="font-medium">Access restricted</div>
            <p className="mt-1 text-xs">
              Your email domain{domain ? ` (${domain})` : ''} is not allowed to sign in. Contact
              the admin, or use an account on an allowed domain.
            </p>
          </div>
        )}

        <a
          href={href}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
