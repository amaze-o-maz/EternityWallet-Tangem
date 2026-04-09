import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { router } from './router';
import { useThemeStore, applyTheme } from './store/themeStore';

export default function App() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--shib-surface)',
            color: '#FFFFFF',
            border: '1px solid var(--shib-border)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: {
            iconTheme: {
              primary: '#22C55E',
              secondary: '#1A1A1A',
            },
          },
          error: {
            iconTheme: {
              primary: '#EF4444',
              secondary: '#1A1A1A',
            },
          },
        }}
      />
      <RouterProvider router={router} />
    </>
  );
}
