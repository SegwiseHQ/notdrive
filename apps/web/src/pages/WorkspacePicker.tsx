import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { http } from '../lib/http.js';

export function WorkspacePicker() {
  const me = useQuery({ queryKey: ['me'], queryFn: http.me });
  if (me.isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const first = me.data?.workspaces[0];
  if (!first) return <Navigate to="/login" replace />;
  return <Navigate to={`/w/${first.id}`} replace />;
}
