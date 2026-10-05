import type { Portfolio, TemplateEntry } from '@makable/shared'
import { LoaderCircle } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { buildProjectFiles, PreviewPane, usePreviewEngine } from '@/features/preview'
import { type TemplateFiles, useTemplate } from '@/features/templates'
import { EDIT_SHIM, useVisualEdit, VisualEditBanner, VisualEditControls } from '@/features/visual-edit'
import { Button } from '@/shared/ui/button'

type BuilderPreviewProps = {
  portfolio: Portfolio
  onChange: (portfolio: Portfolio) => void
}

/** Live preview of the portfolio with click-to-edit text, once its template's files are loaded. */
export function BuilderPreview({ portfolio, onChange }: BuilderPreviewProps) {
  const { catalog, entry, files } = useTemplate(portfolio.template)

  if (entry && files.data) {
    return <LoadedPreview template={entry} files={files.data} portfolio={portfolio} onChange={onChange} />
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

function LoadedPreview({ template, files: templateFiles, portfolio, onChange }: LoadedPreviewProps) {
  const files = useMemo(() => buildProjectFiles(templateFiles, template, portfolio), [templateFiles, template, portfolio])
  const preview = usePreviewEngine(files, { injectedScript: EDIT_SHIM })
  const edit = useVisualEdit({ iframeRef: preview.iframeRef, portfolio, onChange })

  return (
    <PreviewPane preview={preview} actions={<VisualEditControls edit={edit} />} banner={<VisualEditBanner edit={edit} />} />
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
