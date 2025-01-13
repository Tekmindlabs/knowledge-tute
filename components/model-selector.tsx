// model-selector.tsx
import { startTransition, useMemo, useOptimistic, useState } from 'react';
import { CheckCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { models, type Model } from '@/lib/ai/models';
import { cn } from '@/lib/utils';

interface ModelSelectorProps {
  selectedModelId: string;
  className?: string;
}

export function ModelSelector({ selectedModelId, className }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [optimisticModelId, setOptimisticModelId] = useOptimistic(
    selectedModelId
  );

  const selectedModel = useMemo(
    () => models.find((model: Model) => model.id === optimisticModelId),
    [optimisticModelId]
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('w-full', className)}>
          {selectedModel?.label}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        {models.map((model: Model) => (
          <DropdownMenuItem
            key={model.id}
            className={cn(
              'flex items-center justify-between',
              model.id === optimisticModelId && 'bg-accent'
            )}
            onSelect={() => {
              setOptimisticModelId(model.id);
              startTransition(() => {
                // Implement your save logic here
              });
            }}
          >
            <div className="flex flex-col">
              <span>{model.label}</span>
              {model.description && (
                <span className="text-xs text-muted-foreground">
                  {model.description}
                </span>
              )}
            </div>
            {model.id === optimisticModelId && (
              <CheckCircle className="h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}