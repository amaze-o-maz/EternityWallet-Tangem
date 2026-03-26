import { create } from 'zustand';
import { NETWORKS } from '../lib/chains';

interface NetworkState {
  chainId: number;
  networkKey: string;
}

interface NetworkActions {
  setNetwork: (key: 'ethereum' | 'shibarium') => void;
}

export const useNetworkStore = create<NetworkState & NetworkActions>((set) => ({
  chainId: 109,
  networkKey: 'shibarium',

  setNetwork: (key: 'ethereum' | 'shibarium') => {
    const network = NETWORKS[key];
    if (!network) return;
    set({
      chainId: network.chainId,
      networkKey: key,
    });
  },
}));
