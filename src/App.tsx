import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { FullPageSpinner } from '@/components/common/Feedback';
import { ConfirmProvider } from '@/components/modals/ConfirmProvider';
import { PwaRegistration } from './app/pwa/PwaRegistration';
import { queryClient } from './app/providers/queryClient';
import { router } from './app/router/router';
import { sessionManager } from './app/store/sessionManager';

export function App() {
  useEffect(() => {
    void sessionManager.boot();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <Suspense fallback={<FullPageSpinner />}>
          <RouterProvider router={router} />
        </Suspense>
      </ConfirmProvider>
      <Toaster position="top-right" richColors closeButton duration={4000} />
      <PwaRegistration />
    </QueryClientProvider>
  );
}
