import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { queryClient } from './lib/queryClient.js';
import { router } from './router.js';
import './index.css';
import 'tippy.js/dist/tippy.css';
// Syntax-highlighting theme for code blocks. github-dark works well across
// both light + dark UI modes since the editor's code block has its own
// muted background; the highlight colors stay visible on either.
import 'highlight.js/styles/github-dark.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" richColors closeButton />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);
