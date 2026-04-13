import { create } from 'zustand';

export interface SelectedNFT {
  contractAddress: string;
  tokenId: string;
  contractName: string;
  tokenStandard: string; // 'ERC-721' | 'ERC-1155'
  imageUrl: string | null;
  quantity: number;  // how many copies to send (always 1 for ERC-721)
  balance: number;   // total copies owned (always 1 for ERC-721)
}

interface NFTSelectionState {
  selected: SelectedNFT[];
  /** Which collection the selection belongs to (contract address, lowercased) */
  collectionAddress: string | null;
  collectionStandard: string | null;
}

interface NFTSelectionActions {
  toggle: (nft: SelectedNFT) => void;
  clearSelection: () => void;
  isSelected: (contractAddress: string, tokenId: string) => boolean;
  getQuantity: (contractAddress: string, tokenId: string) => number;
}

export const useNftSelectionStore = create<NFTSelectionState & NFTSelectionActions>(
  (set, get) => ({
    selected: [],
    collectionAddress: null,
    collectionStandard: null,

    toggle: (nft) => {
      const { selected, collectionAddress } = get();
      const key = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
      const idx = selected.findIndex(
        (s) => `${s.contractAddress.toLowerCase()}-${s.tokenId}` === key,
      );

      if (idx !== -1) {
        const existing = selected[idx];
        const isErc1155 = existing.tokenStandard === 'ERC-1155';

        // ERC-1155 with balance > 1: tap increments quantity, wraps to deselect
        if (isErc1155 && existing.balance > 1 && existing.quantity < existing.balance) {
          const next = [...selected];
          next[idx] = { ...existing, quantity: existing.quantity + 1 };
          set({ selected: next });
          return;
        }

        // At max quantity (or ERC-721): deselect
        const next = selected.filter((_, i) => i !== idx);
        set({
          selected: next,
          collectionAddress: next.length > 0 ? collectionAddress : null,
          collectionStandard: next.length > 0 ? get().collectionStandard : null,
        });
        return;
      }

      const isErc721 = nft.tokenStandard !== 'ERC-1155';

      if (isErc721) {
        // ERC-721 / DN-404: single select only (no native batch)
        set({
          selected: [{ ...nft, quantity: 1, balance: 1 }],
          collectionAddress: nft.contractAddress.toLowerCase(),
          collectionStandard: nft.tokenStandard,
        });
        return;
      }

      // ERC-1155: multi-select within same collection, start quantity at 1
      set({
        selected: [...selected, { ...nft, quantity: nft.quantity || 1 }],
        collectionAddress: nft.contractAddress.toLowerCase(),
        collectionStandard: nft.tokenStandard,
      });
    },

    clearSelection: () =>
      set({ selected: [], collectionAddress: null, collectionStandard: null }),

    isSelected: (contractAddress, tokenId) => {
      const key = `${contractAddress.toLowerCase()}-${tokenId}`;
      return get().selected.some(
        (s) => `${s.contractAddress.toLowerCase()}-${s.tokenId}` === key,
      );
    },

    getQuantity: (contractAddress, tokenId) => {
      const key = `${contractAddress.toLowerCase()}-${tokenId}`;
      const found = get().selected.find(
        (s) => `${s.contractAddress.toLowerCase()}-${s.tokenId}` === key,
      );
      return found?.quantity ?? 0;
    },
  }),
);
