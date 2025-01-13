import { Node } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { Decoration, DecorationSet } from 'prosemirror-view';

import { documentSchema } from './config';
import type { Suggestion } from '@/lib/db/schema';

export function buildDocumentFromContent(content: string) {
  // Convert plain text content into a ProseMirror document
  const doc = documentSchema.node('doc', null, [
    documentSchema.node('paragraph', null, [
      documentSchema.text(content)
    ])
  ]);
  return doc;
}

export function buildContentFromDocument(doc: Node) {
  // Extract plain text content from a ProseMirror document
  return doc.textContent;
}

export function createDecorations(
  suggestions: Array<Suggestion & { selectionStart?: number; selectionEnd?: number }>,
  editorView: EditorView
) {
  const decorations: Decoration[] = [];

  suggestions.forEach((suggestion) => {
    if (suggestion.selectionStart === undefined || suggestion.selectionEnd === undefined) {
      return;
    }

    // Create a decoration for each suggestion
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: 'suggestion',
          'data-suggestion-id': suggestion.id
        }
      )
    );
  });

  return DecorationSet.create(editorView.state.doc, decorations);
}