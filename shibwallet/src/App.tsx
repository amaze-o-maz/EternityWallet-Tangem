import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { router } from './router';

export default function App() {
  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1A1A1A',
            color: '#FFFFFF',
            border: '1px solid #2E2E2E',
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
