import { prisma } from '@/lib/prisma';
import { VisibilityType } from '@/components/visibility-selector';

export async function getMessageById({ id }: { id: string }) {
  return prisma.message.findMany({
    where: {
      id,
    },
  });
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  return prisma.message.deleteMany({
    where: {
      chatId,
      createdAt: {
        gt: timestamp,
      },
    },
  });
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  return prisma.chat.update({
    where: {
      id: chatId,
    },
    data: {
      metadata: {
        visibility,
      },
    },
  });
}