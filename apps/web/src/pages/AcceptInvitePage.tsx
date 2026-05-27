import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { http } from '../lib/http.js';
import { useWorkspace } from '../lib/store.js';

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const setWs = useWorkspace((s) => s.setActiveWs);
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('err');
      setMsg('missing token');
      return;
    }
    http
      .acceptInvite(token)
      .then((r) => {
        setWs(r.workspace_id);
        navigate(`/w/${r.workspace_id}`, { replace: true });
      })
      .catch((e) => {
        setStatus('err');
        setMsg(e.message);
      });
  }, [token, setWs, navigate]);

  return (
    <div className="flex h-full items-center justify-center">
      {status === 'err' ? (
        <div className="text-destructive">Could not accept invite: {msg}</div>
      ) : (
        <div className="text-muted-foreground">Accepting invite…</div>
      )}
    </div>
  );
}
