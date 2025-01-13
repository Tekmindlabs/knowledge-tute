'use client';

import { updateChatVisibility } from '@/app/(dashboard)/(chat)/actions';
import { VisibilityType } from '@/components/visibility-selector';
import { useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';

// Interface aligned with Prisma Chat model
interface Chat {
  id: string;
  userId: string;
  message: string;
  response: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: any | null;
}

export function useChatVisibility({
  chatId,
  initialVisibility,
}: {
  chatId: string;
  initialVisibility: VisibilityType;
}) {
  const { mutate, cache } = useSWRConfig();
  const history: Array<Chat> = cache.get('/api/history')?.data;

  const { data: localVisibility, mutate: setLocalVisibility } = useSWR(
    `${chatId}-visibility`,
    null,
    {
      fallbackData: initialVisibility,
    }
  );

  const visibilityType = useMemo(() => {
    if (!history) return localVisibility;
    const chat = history.find((chat) => chat.id === chatId);
    // If chat not found, default to private
    if (!chat) return 'private' as VisibilityType;
    // Get visibility from metadata if it exists
    return chat.metadata?.visibility || 'private' as VisibilityType;
  }, [history, chatId, localVisibility]);

  const setVisibilityType = async (updatedVisibilityType: VisibilityType) => {
    // Update local state immediately
    setLocalVisibility(updatedVisibilityType);

    // Update cache
    mutate<Array<Chat>>(
      '/api/history',
      (history) => {
        return history
          ? history.map((chat) => {
              if (chat.id === chatId) {
                return {
                  ...chat,
                  metadata: {
                    ...chat.metadata,
                    visibility: updatedVisibilityType,
                  },
                };
              }
              return chat;
            })
          : [];
      },
      { revalidate: false }
    );

    // Update database
    try {
      await updateChatVisibility({
        chatId: chatId,
        visibility: updatedVisibilityType,
      });
    } catch (error) {
      // Revert local state if update fails
      setLocalVisibility(localVisibility);
      console.error('Failed to update chat visibility:', error);
    }
  };

  return { visibilityType, setVisibilityType };
}