import { create } from 'zustand';

export interface SelectedNFT {
  contractAddress: string;
  tokenId: string;
  contractName: string;
  tokenStandard: string; // 'ERC-721' | 'ERC-1155'
  imageUrl: string | null;
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
}

export const useNftSelectionStore = create<NFTSelectionState & NFTSelectionActions>(
  (set, get) => ({
    selected: [],
    collectionAddress: null,
    collectionStandard: null,

    toggle: (nft) => {
      const { selected, collectionAddress } = get();
      const key = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
      const existing = selected.find(
        (s) => `${s.contractAddress.toLowerCase()}-${s.tokenId}` === key,
      );

      if (existing) {
        // Deselect
        const next = selected.filter(
          (s) => `${s.contractAddress.toLowerCase()}-${s.tokenId}` !== key,
        );
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
          selected: [nft],
          collectionAddress: nft.contractAddress.toLowerCase(),
          collectionStandard: nft.tokenStandard,
        });
        return;
      }

      // ERC-1155: multi-select within same collection
      set({
        selected: [...selected, nft],
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
  }),
);
