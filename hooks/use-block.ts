// hooks/use-block.ts
import { create } from 'zustand';
import { SetState } from 'zustand';

interface BlockState {
  isVisible: boolean;
  setIsVisible: (isVisible: boolean) => void;
}

export const useBlockSelector = create<BlockState>((set: SetState<BlockState>) => ({
  isVisible: false,
  setIsVisible: (isVisible: boolean) => set({ isVisible }),
}));