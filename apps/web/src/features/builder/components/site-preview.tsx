import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AiEditHint, AiEditPopover, type AiRun } from '@/features/ai-edit'
import { CodeView } from '@/features/code-view'
import { PreviewPane, type PreviewState, type PreviewView, usePreviewEngine } from '@/features/preview'
import { type Files, RESERVED_PATH, useSiteStore, useTaggedFiles } from '@/features/site'
import { EDIT_SHIM, useVisualEdit, VisualEditBanner, VisualEditControls } from '@/features/visual-edit'
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'

export const AI_EDIT = 'Edit with AI'
/** Typing in the code reloads the preview once it pauses this long. */
const PREVIEW_DELAY_MS = 250

/** What the AI run needs from the preview: its state (to see how a change went) and a picture of the selection. */
export type PreviewBridge = {
  subscribe: (listener: (state: PreviewState) => void) => () => void
  capture: () => Promise<string | undefined>
}

type SitePreviewProps = {
  ai: AiRun
  /** The site as the preview shows it (the user's edits and an AI change being tried included). */
  shown: Files
  /** The site as the user edits it (without the AI change being tried). */
  files: Files
  /** Files with edits not saved yet. */
  modified: ReadonlySet<string>
  projectName: string
  aiMode: boolean
  setAiMode: (on: boolean) => void
  /** Hands the AI run what it needs from the preview. */
  onBridge: (bridge: PreviewBridge) => void
}

/** The file as the user sees it now (their unsaved edits included). */
function readWorking(path: string): string | undefined {
  const { base, dirty } = useSiteStore.getState()
  if (path in dirty) return dirty[path] ?? undefined
  return base?.[path]
}

const write = (path: string, content: string) => useSiteStore.getState().edit(path, content)
const readOnlyReason = (path: string) => (RESERVED_PATH.test(path) ? 'makable keeps this file up to date. It can’t be edited here.' : null)

/** Live preview of the site with click-to-edit text, AI edits on a selected element, and the code. */
export function SitePreview({ ai, shown, files, modified, projectName, aiMode, setAiMode, onBridge }: SitePreviewProps) {
  const generation = useSiteStore((s) => s.generation)
  // Debounced before tagging, so typing in the code parses (and caches) only the settled text.
  const settled = useDebouncedValue(shown, PREVIEW_DELAY_MS)
  const previewFiles = useTaggedFiles(settled)
  const preview = usePreviewEngine(previewFiles, { injectedScript: EDIT_SHIM })
  const previewError = preview.state.status === 'error' ? preview.state.error : null
  useEffect(() => {
    if (previewError) analytics.track('preview_error', { message: previewError.message, path: previewError.path ?? null })
  }, [previewError])
  const edit = useVisualEdit({
    iframeRef: preview.iframeRef,
    read: readWorking,
    write,
    historyKey: generation,
    selecting: aiMode,
    onTextMode: () => setAiMode(false),
    // No other edits while the AI works: its answer is for the site as it was sent.
    locked: ai.busy,
  })
  useEffect(() => {
    onBridge({ subscribe: preview.subscribe, capture: edit.capture })
  })
  const [view, setView] = useState<PreviewView>('preview')

  return (
    <PreviewPane
      preview={preview}
      view={view}
      onViewChange={(next) => {
        // Selecting elements needs the page.
        if (next === 'code') setAiMode(false)
        setView(next)
      }}
      code={
        <CodeView
          files={files}
          modified={modified}
          projectName={projectName}
          onChange={write}
          readOnlyReason={readOnlyReason}
          locked={ai.busy ? 'The AI is changing your site. You can edit again once it’s done.' : null}
        />
      }
      actions={
        view === 'code' ? null : (
          <>
            <VisualEditControls edit={edit} />
            <Button
              variant={aiMode ? 'default' : 'outline'}
              size="sm"
              aria-label={AI_EDIT}
              aria-pressed={aiMode}
              title={AI_EDIT}
              disabled={ai.busy && !aiMode}
              onClick={() => setAiMode(!aiMode)}
            >
              <Sparkles />
              <span className="hidden lg:inline">{AI_EDIT}</span>
            </Button>
          </>
        )
      }
      banner={
        <>
          <VisualEditBanner edit={edit} />
          {aiMode && !edit.selection && <AiEditHint />}
        </>
      }
      overlay={(scale) =>
        aiMode && <AiEditPopover ai={ai} target={edit.selection} anchor={edit.selectionRect} scale={scale} onClear={edit.clearSelection} />
      }
    />
  )
}
