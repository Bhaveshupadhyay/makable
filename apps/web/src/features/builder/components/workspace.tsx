import { LoaderCircle } from 'lucide-react'
import { type ReactNode, useMemo, useRef } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { type AiNote, AnswerOptions, type AiRun, EDITS_PAUSED, phaseText, ThinkingLine, useAiRun } from '@/features/ai-edit'
import { SaveStatus, type SiteSync, useSiteStore, useSiteSync, workingFiles } from '@/features/site'
import { AnalyticsButton } from '@/features/site-analytics'
import { useMediaQuery } from '@/shared/hooks/use-media-query'
import { Button } from '@/shared/ui/button'
import { HeaderActions } from '@/shared/ui/header-slot'
import { usePublish } from '../hooks/use-publish'
import { assistant, buildChat, emptyChat, pausedRunChat, user } from '../lib/chat'
import { awaitingToken, dropStalePublish, PUBLISH_REQUEST, type PublishContext, publishText, startPublish, TARGETS } from '../lib/publish-flow'
import { useBuilderStore, useSiteChat } from '../store'
import { ChatMessage } from './chat-message'
import { ChatPanel } from './chat-panel'
import { PublishButton } from './publish-button'
import { PublishTokenForm } from './publish-token-form'
import { type PreviewBridge, SitePreview } from './site-preview'
import { SiteMenu } from './site-menu'

/** A site that has its repo: the chat beside the live preview (or its code), with saving and publishing. */
export function Workspace({ login }: { login: string }) {
  const wide = useMediaQuery('(min-width: 768px)')
  const projectId = useSiteStore((s) => s.projectId)
  const site = useSiteStore((s) => s.site)
  const base = useSiteStore((s) => s.base)
  const dirty = useSiteStore((s) => s.dirty)
  const trying = useSiteStore((s) => s.trying)
  const sync = useSiteSync(true)
  const files = useMemo(() => (base ? workingFiles(base, dirty) : null), [base, dirty])
  const shown = useMemo(() => (files && trying ? workingFiles(files, trying) : files), [files, trying])
  const modified = useMemo(() => new Set(Object.keys(dirty)), [dirty])
  const aiMode = useBuilderStore((s) => s.aiMode)
  const setAiMode = useBuilderStore((s) => s.setAiMode)
  const chat = useSiteChat(projectId)
  const publishCtx: PublishContext = { login, repoName: site?.repoName ?? null, published: chat.published ?? null }
  const publish = usePublish(projectId, publishCtx, sync)
  // The preview mounts once the files are loaded; the AI run reaches it through this.
  const bridge = useRef<PreviewBridge | null>(null)
  const ai = useAiRun({
    flush: sync.flush,
    subscribePreview: (listener) => bridge.current?.subscribe(listener) ?? (() => {}),
    previewReady: !!files,
    capture: () => bridge.current?.capture() ?? Promise.resolve(undefined),
    reload: sync.reload,
    note: (note: AiNote) => {
      const { say } = useBuilderStore.getState()
      if (note.instruction) say(projectId, user(note.instruction, { caption: note.target }))
      say(projectId, assistant(note.text, note.error ? { tone: 'error', settingsLink: note.settings } : {}))
    },
  })
  const publishing = publish.flow?.stage === 'running'

  return (
    <div className="h-[calc(100svh-3.5rem)]">
      <HeaderActions>
        <SaveStatus sync={sync} repoUrl={site?.repoUrl ?? null} />
        <AnalyticsButton projectId={projectId} />
        <PublishButton stage={publish.flow?.stage} published={!!chat.published} disabled={ai.busy || !files} onPublish={publish.start} />
      </HeaderActions>
      <Group orientation={wide ? 'horizontal' : 'vertical'}>
        <Panel defaultSize={wide ? '34' : '45'} minSize={wide ? '320px' : '25'}>
          <WorkspaceChat projectId={projectId} ai={ai} ctx={publishCtx} publish={publish} sync={sync} busy={ai.busy || publishing} />
        </Panel>
        <Separator className="bg-border transition-colors hover:bg-ring data-[separator=active]:bg-ring aria-[orientation=horizontal]:h-px aria-[orientation=vertical]:w-px" />
        <Panel minSize={wide ? '360px' : '25'}>
          {files && shown ? (
            <SitePreview
              ai={ai}
              shown={shown}
              files={files}
              modified={modified}
              projectName={site?.repoName ?? site?.name ?? 'site'}
              aiMode={aiMode}
              setAiMode={setAiMode}
              onBridge={(next) => {
                bridge.current = next
              }}
            />
          ) : (
            <PreviewMessage sync={sync} />
          )}
        </Panel>
      </Group>
    </div>
  )
}

type WorkspaceChatProps = {
  projectId: string
  ai: AiRun
  ctx: PublishContext
  publish: ReturnType<typeof usePublish>
  sync: SiteSync
  busy: boolean
}

/** The site's chat: its AI thread and the browser's own messages; text goes to the AI, a question or publishing. */
function WorkspaceChat({ projectId, ai, ctx, publish, sync, busy }: WorkspaceChatProps) {
  const chat = useSiteChat(projectId)
  const update = useBuilderStore((s) => s.update)
  const markUndone = useBuilderStore((s) => s.markUndone)
  const messages = useMemo(() => buildChat(ai.thread, chat, chat.undone), [ai.thread, chat])
  const flow = chat.publish
  const question = ai.question

  function send(text: string) {
    // While the token box is open, the composer feeds it: a pasted token must not become a chat message.
    if (awaitingToken(flow) && text.trim().toLowerCase() !== 'cancel') return publish.enterToken(text)
    const local = useBuilderStore.getState().chats[projectId] ?? emptyChat()
    const answered = publishText(local, text.trim(), ctx)
    if (answered) return update(projectId, () => answered)
    // Other chat after a failed publish moves on from it.
    update(projectId, dropStalePublish)
    if (PUBLISH_REQUEST.test(text.trim())) return update(projectId, (state) => startPublish(state, ctx, text.trim()))
    if (busy) return
    if (question?.question) return void ai.answer(text)
    void ai.send(text, null)
  }

  async function undo(commitSha: string) {
    if (await ai.undo(commitSha)) markUndone(projectId, commitSha)
  }

  let tail: ReactNode = null
  if (ai.pending) {
    tail = (
      <>
        {ai.pending.answering ? (
          // Answering a question: the conversation so far and what was just sent stay on screen.
          pausedRunChat(ai.pending.answering.run, ai.pending.answering.sent).map((message) => <ChatMessage key={message.id} message={message} />)
        ) : (
          <ChatMessage message={{ id: 'pending', role: 'user', text: ai.pending.instruction, caption: ai.pending.target, at: '' }} />
        )}
        <ThinkingLine role="status" label={phaseText(ai.pending)} since={ai.pending.since} hint={EDITS_PAUSED} className="pl-8" />
      </>
    )
  } else if (question?.question) {
    tail = (
      <>
        {pausedRunChat(question).map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </>
    )
  }

  return (
    <ChatPanel
      header={
        <SiteMenu
          disabled={busy}
          beforeSwitch={async () => {
            if (Object.keys(useSiteStore.getState().dirty).length > 0) await sync.flush()
          }}
          onSwitchFailed={(e) => {
            const reason = e instanceof Error ? e.message : "Couldn't save them."
            useBuilderStore.getState().say(projectId, assistant(`Your edits aren't saved yet, so this site stays open. ${reason}`, { tone: 'error' }))
          }}
        />
      }
      messages={messages}
      tail={
        <>
          {tail}
          {flow?.stage === 'running' && <Status>Publishing…</Status>}
          {flow?.stage === 'deploying' && <Status>Deploying to {TARGETS[flow.target ?? 'github-pages'].name}…</Status>}
        </>
      }
      latestExtra={flow?.stage === 'token' && <PublishTokenForm platform={TARGETS[flow.target ?? 'vercel'].name} onSubmit={publish.enterToken} />}
      repliesEnabled={!busy}
      onSend={send}
      footer={
        // A publish waiting for a token keeps the composer, which takes the token.
        !ai.pending && question?.question && !awaitingToken(flow) ? (
          <AnswerOptions
            options={question.question.options}
            onPick={(answer) => void ai.answer(answer)}
            typeLabel={question.question.allowFreeText ? 'Type something else' : undefined}
            onChat={(message) => void ai.answer(message, { chat: true })}
            onSkip={() => void ai.skip()}
            disabled={busy}
          />
        ) : undefined
      }
      onStop={ai.busy ? ai.stop : undefined}
      composerDisabled={flow?.stage === 'running'}
      placeholder="Ask for a change to your site…"
      onUndo={(sha) => void undo(sha)}
      undoDisabled={busy}
    />
  )
}

function Status({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 pl-8 text-xs text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin" />
      {children}
    </p>
  )
}

/** In place of the preview while the site's files load, or when they couldn't. */
function PreviewMessage({ sync }: { sync: SiteSync }) {
  const { status } = sync
  const failed = status.state === 'load-failed' || status.state === 'blocked'
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted p-6 text-center text-sm text-muted-foreground">
      {failed ? (
        <>
          <p>{status.message}</p>
          {status.state === 'load-failed' && (
            <Button variant="outline" size="sm" onClick={sync.reload}>
              Try again
            </Button>
          )}
        </>
      ) : status.state === 'conflict' ? (
        <p>This site changed somewhere else. Choose which version to keep from the save button at the top.</p>
      ) : (
        <>
          <LoaderCircle className="size-4 animate-spin" />
          <p>Loading your site from GitHub…</p>
        </>
      )}
    </div>
  )
}
