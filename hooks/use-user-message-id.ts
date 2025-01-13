import { create } from 'zustand';

interface UserMessageIdState {
  userMessageId: string | null;
  setUserMessageIdFromServer: (id: string) => void;
}

export const useUserMessageId = create<UserMessageIdState>((set) => ({
  userMessageId: null,
  setUserMessageIdFromServer: (id) => set({ userMessageId: id }),
}));