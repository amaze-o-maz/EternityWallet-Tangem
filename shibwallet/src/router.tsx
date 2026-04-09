import { createBrowserRouter } from 'react-router-dom';
import Onboarding from './pages/Onboarding';
import Create from './pages/Create';
import Import from './pages/Import';
import Lock from './pages/Lock';
import WalletLayout from './components/WalletLayout';
import Wallet from './pages/Wallet';
import Send from './pages/Send';
import Receive from './pages/Receive';
import Swap from './pages/Swap';
import DApps from './pages/DApps';
import DAppBrowser from './pages/DAppBrowser';
import History from './pages/History';
import Magazine from './pages/Magazine';
import Buy from './pages/Buy';
import Burns from './pages/Burns';

export const router = createBrowserRouter([
  { path: '/', element: <Onboarding /> },
  { path: '/create', element: <Create /> },
  { path: '/import', element: <Import /> },
  { path: '/lock', element: <Lock /> },

  /* Standalone pages (no persistent chrome) */
  { path: '/wallet/send', element: <Send /> },
  { path: '/wallet/receive', element: <Receive /> },
  { path: '/wallet/browser', element: <DAppBrowser /> },

  /* Persistent layout — Header + BottomNav stay mounted */
  {
    path: '/wallet',
    element: <WalletLayout />,
    children: [
      { index: true, element: <Wallet /> },
      { path: 'swap', element: <Swap /> },
      { path: 'burns', element: <Burns /> },
      { path: 'dapps', element: <DApps /> },
      { path: 'buy', element: <Buy /> },
      { path: 'news', element: <Magazine /> },
      { path: 'history', element: <History /> },
    ],
  },
]);
