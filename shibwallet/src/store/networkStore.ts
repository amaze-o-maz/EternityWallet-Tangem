import { create } from 'zustand';
import { getAllNetworks } from '../lib/chains';

interface NetworkState {
  chainId: number;
  networkKey: string;
}

interface NetworkActions {
  setNetwork: (key: string) => void;
}

export const useNetworkStore = create<NetworkState & NetworkActions>((set) => ({
  chainId: 109,
  networkKey: 'shibarium',

  setNetwork: (key: string) => {
    const networks = getAllNetworks();
    const network = networks[key];
    if (!network) return;
    set({
      chainId: network.chainId,
      networkKey: key,
    });
  },
}));
