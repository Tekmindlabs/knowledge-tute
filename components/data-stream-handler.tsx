'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';
import { BlockKind } from './block';
import { Suggestion } from '@/lib/db/schema';
import { initialBlockData, useBlock } from '@/hooks/use-block';
import { useUserMessageId } from '@/hooks/use-user-message-id';
import { cx } from 'class-variance-authority';

type AgentType = 'agents' | 'retrieval' | 'retrieval_agents';

type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'user-message-id'
    | 'kind'
    | 'agent-type'
    | 'agent-response';
  content: string | Suggestion;
  agentType?: AgentType;
};

interface AgentResponse {
  type: string;
  content: string;
  metadata?: {
    confidence?: number;
    source?: string;
    agentType?: AgentType;
  };
}

export function DataStreamHandler({ 
  id, 
  selectedAgent 
}: { 
  id: string;
  selectedAgent?: AgentType;
}) {
  const { data: dataStream } = useChat({ 
    id,
    body: { agentType: selectedAgent }
  });
  const { setUserMessageIdFromServer } = useUserMessageId();
  const { setBlock } = useBlock();
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      if (delta.type === 'user-message-id') {
        setUserMessageIdFromServer(delta.content as string);
        return;
      }

      setBlock((draftBlock) => {
        if (!draftBlock) {
          return { 
            ...initialBlockData, 
            status: 'streaming',
            agentType: selectedAgent 
          };
        }

        switch (delta.type) {
          case 'agent-type':
            return {
              ...draftBlock,
              agentType: delta.agentType,
              status: 'streaming',
            };

          case 'agent-response':
            const agentResponse = delta.content as unknown as AgentResponse;
            return {
              ...draftBlock,
              content: draftBlock.content + agentResponse.content,
              metadata: {
                ...draftBlock.metadata,
                ...agentResponse.metadata,
              },
              status: 'streaming',
            };

          case 'id':
            return {
              ...draftBlock,
              documentId: delta.content as string,
              status: 'streaming',
            };

          case 'title':
            return {
              ...draftBlock,
              title: delta.content as string,
              status: 'streaming',
            };

          case 'kind':
            return {
              ...draftBlock,
              kind: delta.content as BlockKind,
              status: 'streaming',
            };

          case 'text-delta':
            const newContent = draftBlock.content + (delta.content as string);
            return {
              ...draftBlock,
              content: newContent,
              isVisible: shouldMakeVisible(newContent, draftBlock.status, 'text'),
              status: 'streaming',
            };

          case 'code-delta':
            const newCodeContent = delta.content as string;
            return {
              ...draftBlock,
              content: newCodeContent,
              isVisible: shouldMakeVisible(newCodeContent, draftBlock.status, 'code'),
              status: 'streaming',
            };

          case 'clear':
            return {
              ...draftBlock,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            return {
              ...draftBlock,
              status: 'idle',
            };

          default:
            return draftBlock;
        }
      });
    });
  }, [dataStream, setBlock, setUserMessageIdFromServer, selectedAgent]);

  return null;
}

// Helper function to determine visibility
function shouldMakeVisible(
  content: string, 
  status: string, 
  type: 'text' | 'code'
): boolean {
  if (status !== 'streaming') return false;
  
  const thresholds = {
    text: { min: 400, max: 450 },
    code: { min: 300, max: 310 }
  };

  const { min, max } = thresholds[type];
  return content.length > min && content.length < max;
}

// Extended block data type
interface BlockData {
  status: 'idle' | 'streaming';
  content: string;
  documentId?: string;
  title?: string;
  kind?: BlockKind;
  isVisible: boolean;
  metadata?: {
    confidence?: number;
    source?: string;
    agentType?: AgentType;
  };
  agentType?: AgentType;
}