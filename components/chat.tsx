'use client';

import type { Message } from '@/types/chat';
import { useChat, type CreateMessage } from 'ai/react';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import type { Attachment } from '@/types/chat';

import { Block } from './block';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { VisibilityType } from './visibility-selector';
import { useBlockSelector } from '@/hooks/use-block';

type AgentType = 'agents' | 'retrieval' | 'retrieval_agents';

const agentOptions = [
  { id: 'agents', label: 'Polly the Parrot', description: 'A chatty parrot that loves to squawk!' },
  { id: 'retrieval', label: 'Dana the Dog', description: 'An energetic puppy with lots of puns!' },
  { id: 'retrieval_agents', label: 'Robbie the Robot', description: 'A stereotypical robot that beeps and boops!' }
];

interface ChatProps {
  id: string;
  initialMessages: Message[];
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}

export function Chat({
  id,
  initialMessages,
  selectedModelId,
  selectedVisibilityType,
  isReadonly,
}: ChatProps) {
  const { mutate } = useSWRConfig();
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('agents');

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
  } = useChat({
    id,
    body: { 
      id, 
      modelId: selectedModelId,
      agentType: selectedAgent
    },
    api: `/api/chat/${selectedAgent}`,
    initialMessages: initialMessages as any[],
    experimental_throttle: 100,
    onFinish: () => {
      mutate('/api/history');
    },
  });

  const { data: votes } = useSWR<Vote[]>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isBlockVisible = useBlockSelector((state) => state.isVisible);

  const handleAgentSubmit = async (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: Record<string, any>
  ) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    
    return handleSubmit(event, {
      ...chatRequestOptions,
      options: {
        ...chatRequestOptions?.options,
        body: {
          ...chatRequestOptions?.options?.body,
          agentType: selectedAgent
        }
      }
    });
  };

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={selectedModelId}
          selectedVisibilityType={selectedVisibilityType}
          isReadonly={isReadonly}
        />

        {!isReadonly && (
          <div className="flex justify-center p-2 border-b">
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value as AgentType)}
              className="p-2 rounded border bg-background"
            >
              {agentOptions.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <Messages
          chatId={id}
          isLoading={isLoading}
          votes={votes}
          messages={messages as Message[]}
          setMessages={setMessages as any}
          reload={reload}
          isReadonly={isReadonly}
          isBlockVisible={isBlockVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleAgentSubmit}
              isLoading={isLoading}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages as Message[]}
              setMessages={setMessages as any}
              append={append}
            />
          )}
        </form>
      </div>

      <Block
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleAgentSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages as Message[]}
        setMessages={setMessages as any}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
      />
    </>
  );
}