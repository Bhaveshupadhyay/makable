import type { Portfolio, TemplateEntry } from '@makable/shared'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { AiEditHint, AiEditPopover, AiRequestInspector, useAiEdit } from '@/features/ai-edit'
import { buildProjectFiles, PreviewPane, usePreviewEngine } from '@/features/preview'
import { type TemplateFiles, useTemplate } from '@/features/templates'
import { EDIT_SHIM, useVisualEdit, VisualEditBanner, VisualEditControls } from '@/features/visual-edit'
import { Button } from '@/shared/ui/button'
import type { Builder } from '../hooks/use-builder'
import { AI_EDIT } from '../lib/conversation'

type BuilderPreviewProps = {
  portfolio: Portfolio
  onChange: (portfolio: Portfolio) => void
  /** AI mode and the chat log for AI requests. */
  builder: Pick<Builder, 'aiMode' | 'toggleAiMode' | 'exitAiMode' | 'logAiRequest'>
}

/** Live preview of the portfolio with click-to-edit text and AI edits, once its template's files are loaded. */
export function BuilderPreview({ portfolio, onChange, builder }: BuilderPreviewProps) {
  const { catalog, entry, files } = useTemplate(portfolio.template)

  if (entry && files.data) {
    return <LoadedPreview template={entry} files={files.data} portfolio={portfolio} onChange={onChange} builder={builder} />
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

function LoadedPreview({ template, files: templateFiles, portfolio, onChange, builder }: LoadedPreviewProps) {
  const files = useMemo(() => buildProjectFiles(templateFiles, template, portfolio), [templateFiles, template, portfolio])
  const preview = usePreviewEngine(files, { injectedScript: EDIT_SHIM })
  const edit = useVisualEdit({
    iframeRef: preview.iframeRef,
    portfolio,
    onChange,
    selecting: builder.aiMode,
    onTextMode: builder.exitAiMode,
  })
  const ai = useAiEdit({ template, files, onSent: builder.logAiRequest })

  return (
    <PreviewPane
      preview={preview}
      actions={
        <>
          <VisualEditControls edit={edit} />
          <Button
            variant={builder.aiMode ? 'default' : 'outline'}
            size="sm"
            aria-label={AI_EDIT}
            aria-pressed={builder.aiMode}
            title={AI_EDIT}
            onClick={builder.toggleAiMode}
          >
            <Sparkles />
            <span className="hidden lg:inline">{AI_EDIT}</span>
          </Button>
        </>
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
      footer={
        builder.aiMode &&
        ai.last && (
          <div className="shrink-0 border-t bg-background p-3">
            <AiRequestInspector {...ai.last} onClose={ai.closeLast} />
          </div>
        )
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
