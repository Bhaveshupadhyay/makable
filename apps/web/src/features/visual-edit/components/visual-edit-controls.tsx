import { PencilLine, Redo2, Undo2 } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import type { VisualEdit } from '../hooks/use-visual-edit'

/** Toolbar buttons: edit-mode toggle, undo and redo. */
export function VisualEditControls({ edit }: { edit: VisualEdit }) {
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (⌘Z)" disabled={!edit.canUndo} onClick={edit.undo}>
        <Undo2 />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!edit.canRedo} onClick={edit.redo}>
        <Redo2 />
      </Button>
      <Button
        variant={edit.enabled ? 'default' : 'outline'}
        size="sm"
        aria-pressed={edit.enabled}
        aria-label="Edit text"
        title="Edit text"
        onClick={edit.toggle}
        className={cn(!edit.enabled && 'text-muted-foreground')}
      >
        <PencilLine />
        {/* Icon-only on phones, so the toolbar fits beside the other actions. */}
        <span className="hidden sm:inline">Edit text</span>
      </Button>
    </>
  )
}
