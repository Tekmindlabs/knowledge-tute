import { cookies } from 'next/headers';
import { models } from '@/lib/ai/models';
import { Chat } from '@/components/chat';
import { DataStreamHandler } from '@/components/data-stream-handler';

const DEFAULT_MODEL_NAME = 'gemini-pro';

function generateUUID() {
  return crypto.randomUUID();
}

export default async function Page() {
  const id = generateUUID();
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('model-id')?.value;
  const selectedModelId = models.find((model) => model.id === modelIdFromCookie)?.id || DEFAULT_MODEL_NAME;

  return (
    <>
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        selectedModelId={selectedModelId}
        selectedVisibilityType="private"
        isReadonly={false}
      />
      <DataStreamHandler id={id} />
    </>
  );
}