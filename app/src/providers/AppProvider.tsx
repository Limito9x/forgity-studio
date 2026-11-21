import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import React, { useEffect } from 'react';
import { DialogRenderer } from '@/components/custom-ui/overlays/dialog/DialogRenderer';
import { ThemeProvider } from './ThemeProvider';
import { getLocalMachineInfo, isTauriRuntime } from '@/lib/platform/filePickerStrategy';
import { customInstance } from '@/lib/api-client';

export function AppProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await getLocalMachineInfo();
        if (cancelled || !info.hardwareFingerprint) return;
        await customInstance({
          url: '/api/runners/check-in',
          method: 'POST',
          data: {
            hardwareFingerprint: info.hardwareFingerprint,
            machineKey: info.machineKey || info.hardwareFingerprint,
            name: info.hostname || 'Desktop Workstation',
            osPlatform: navigator.platform || 'Windows',
            appVersion: '0.1.0',
          },
        });
      } catch {
        // Silent fail when offline or server unreachable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        {children}
        <DialogRenderer />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
