import { useParams } from 'react-router';
import { ViewsList } from '../features/views/ViewsList.js';

export function ViewsIndexPage() {
  const { wsId = '' } = useParams();
  return (
    <div className="mx-auto w-full max-w-[880px] px-12 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Views</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Saved smart queries. Use the <code className="rounded bg-muted px-1">tag:</code>{' '}
        <code className="rounded bg-muted px-1">modified:</code>{' '}
        <code className="rounded bg-muted px-1">is:</code> language.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-card p-2">
        <ViewsList wsId={wsId} />
      </div>
    </div>
  );
}
