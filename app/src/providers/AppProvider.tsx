import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import React from 'react';
import { DialogRenderer } from '@/components/custom-ui/overlays/dialog/DialogRenderer';
import { ThemeProvider } from './ThemeProvider';

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        {children}
        <DialogRenderer />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
