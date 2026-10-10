import type { TemplateEntry } from '@makable/shared'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { AiEditHint, AiEditPopover, useAiEdit, useAiEditPending } from '@/features/ai-edit'
import { CodeView } from '@/features/code-view'
import { buildProjectFiles, PreviewPane, type PreviewView, usePreviewEngine } from '@/features/preview'
import { type TemplateFiles, useTemplate } from '@/features/templates'
import { EDIT_SHIM, type SiteDraft, useVisualEdit, VisualEditBanner, VisualEditControls } from '@/features/visual-edit'
import { Button } from '@/shared/ui/button'
import type { Builder } from '../hooks/use-builder'
import { AI_EDIT } from '../lib/conversation'

type BuilderPreviewProps = {
  /** The content and the AI-edited files. `onChange` must store the exact objects it's given. */
  draft: SiteDraft
  onChange: (draft: SiteDraft) => void
  /** AI mode, the chat log and the history of AI requests. */
  builder: Pick<Builder, 'aiMode' | 'toggleAiMode' | 'exitAiMode' | 'logAiRequest' | 'aiHistory' | 'recordAiTurn' | 'amendAiTurn'>
}

/** Live preview of the site with click-to-edit text and AI edits, once its template's files are loaded. */
export function BuilderPreview({ draft, onChange, builder }: BuilderPreviewProps) {
  const { catalog, entry, files } = useTemplate(draft.portfolio.template)

  if (entry && files.data) {
    return <LoadedPreview template={entry} files={files.data} draft={draft} onChange={onChange} builder={builder} />
  }
  if (catalog.isError || files.isError) {
    return (
      <PreviewMessage text="Couldn't load the template." detail={(catalog.error ?? files.error)?.message}>
        <Button variant="outline" size="sm" onClick={() => (catalog.isError ? catalog.refetch() : files.refetch())}>
          Try again
        </Button>
      </PreviewMessage>
    )
  }
  if (catalog.data && !entry) {
    return <PreviewMessage text="This template is no longer available. Pick another one from the chat." />
  }
  return (
    <PreviewMessage text="Loading template…">
      <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
    </PreviewMessage>
  )
}

type LoadedPreviewProps = BuilderPreviewProps & { template: TemplateEntry; files: TemplateFiles }

function LoadedPreview({ template, files: templateFiles, draft, onChange, builder }: LoadedPreviewProps) {
  const { portfolio, files: fileEdits } = draft
  // AI-edited files sit on top of the template; the content file always comes from the portfolio.
  const files = useMemo(
    () => ({ ...buildProjectFiles(templateFiles, template, portfolio), ...fileEdits }),
    [templateFiles, template, portfolio, fileEdits],
  )
  const preview = usePreviewEngine(files, { injectedScript: EDIT_SHIM })
  // No other edits while the AI works: its answer is for the site as it was sent.
  const aiPending = useAiEditPending()
  const edit = useVisualEdit({
    iframeRef: preview.iframeRef,
    draft,
    onChange,
    selecting: builder.aiMode,
    onTextMode: builder.exitAiMode,
    locked: aiPending,
  })
  const ai = useAiEdit({
    template,
    files,
    draft,
    onApply: edit.applyDraft,
    onUndo: edit.undo,
    previewError: preview.state.status === 'error' ? preview.state.error : null,
    onSent: builder.logAiRequest,
    history: builder.aiHistory,
    onRecord: builder.recordAiTurn,
    onAmend: builder.amendAiTurn,
  })
  const [view, setView] = useState<PreviewView>('preview')
  const aiEdited = useMemo(() => new Set(Object.keys(fileEdits)), [fileEdits])
  // Named after the repo the site will be published from.
  const login = /github\.com\/([\w-]+)/i.exec(portfolio.links.github)?.[1]
  const projectName = login ? `${login.toLowerCase()}.github.io` : 'portfolio'

  return (
    <PreviewPane
      preview={preview}
      view={view}
      onViewChange={(next) => {
        // Selecting elements needs the page; the code view is for reading.
        if (next === 'code') builder.exitAiMode()
        setView(next)
      }}
      code={<CodeView files={files} modified={aiEdited} projectName={projectName} />}
      actions={
        view === 'code' ? (
          <VisualEditControls edit={edit} undoOnly />
        ) : (
          <>
            <VisualEditControls edit={edit} />
            <Button
              variant={builder.aiMode ? 'default' : 'outline'}
              size="sm"
              aria-label={AI_EDIT}
              aria-pressed={builder.aiMode}
              title={AI_EDIT}
              disabled={aiPending}
              onClick={builder.toggleAiMode}
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
          {builder.aiMode && !edit.selection && <AiEditHint />}
        </>
      }
      overlay={
        builder.aiMode && <AiEditPopover ai={ai} target={edit.selection} anchor={edit.selectionRect} onClear={edit.clearSelection} />
      }
    />
  )
}

function PreviewMessage({ text, detail, children }: { text: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted p-6 text-center text-sm text-muted-foreground">
      {children}
      <p>{text}</p>
      {detail && <p className="max-w-md text-xs break-words opacity-70">{detail}</p>}
    </div>
  )
}
