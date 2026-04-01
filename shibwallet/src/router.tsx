import { createBrowserRouter } from 'react-router-dom';
import Onboarding from './pages/Onboarding';
import Create from './pages/Create';
import Import from './pages/Import';
import Lock from './pages/Lock';
import Wallet from './pages/Wallet';
import Send from './pages/Send';
import Receive from './pages/Receive';
import Swap from './pages/Swap';
import DApps from './pages/DApps';
import DAppBrowser from './pages/DAppBrowser';
import History from './pages/History';

export const router = createBrowserRouter([
  { path: '/', element: <Onboarding /> },
  { path: '/create', element: <Create /> },
  { path: '/import', element: <Import /> },
  { path: '/lock', element: <Lock /> },
  { path: '/wallet', element: <Wallet /> },
  { path: '/wallet/send', element: <Send /> },
  { path: '/wallet/receive', element: <Receive /> },
  { path: '/wallet/swap', element: <Swap /> },
  { path: '/wallet/history', element: <History /> },
  { path: '/wallet/dapps', element: <DApps /> },
  { path: '/wallet/browser', element: <DAppBrowser /> },
]);
