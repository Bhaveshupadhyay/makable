/**
 * Every event the app sends, with its properties. Names are snake_case and ≤ 40 characters, which every
 * provider accepts (Google Analytics is the strictest). Add an event here before tracking it.
 *
 * Never put secrets in these: API keys and platform tokens stay out (only their last 4 characters at most).
 */
export type AnalyticsEvents = {
  /** Any button, link, tab or menu item clicked in the app (automatic, see `autocapture.ts`). */
  ui_click: {
    label: string
    element: string
    role: string | null
    /** `data-analytics` id, if the element has one. */
    analytics_id: string | null
    href: string | null
    /** Where on the screen: the nearest `data-analytics-section` or landmark (header, nav, main, footer...). */
    section: string | null
    disabled: boolean
    x: number
    y: number
    viewport_width: number
    viewport_height: number
  }

  // Sign-in from the landing page
  github_sign_in_prompted: { reason: string }

  // The product demo: over the page for the resume's links (`placement: 'dialog'`, `?utm_source=res` or `resume`), and
  // on the landing page under how it works (`'landing'`).
  /** The dialog opened (`source`: the link's `utm_source`), or the landing page's video scrolled into view. */
  demo_video_shown: { placement: 'dialog' | 'landing'; source: string | null }
  /** It started playing, the first time for this player: by itself in the dialog, on a click on the landing page. */
  demo_video_played: { placement: 'dialog' | 'landing'; muted: boolean }
  /** Each quarter of it seen (`percent` 25, 50, 75, 100), once per player, counting only what played. */
  demo_video_progress: { placement: 'dialog' | 'landing'; percent: number }
  /**
   * The dialog was closed: by the visitor (`dismissed`), or by itself when the video ended (`ended`), to show the site.
   * `watched_seconds`: how much of it played, without the parts skipped over.
   */
  demo_video_closed: { reason: 'dismissed' | 'ended'; watched_seconds: number; ended: boolean }
  /**
   * R2's copy couldn't load or play, so the backup on Google Drive shows instead: `code` is the `MediaError` code (2
   * network, 3 decode, 4 not supported).
   */
  demo_video_failed: { placement: 'dialog' | 'landing'; code: number | null; message: string }

  // Sites built from a prompt
  site_create_started: { prompt: string; model: string }
  site_created: { duration_ms: number; model: string }
  site_create_failed: { code: string | null; message: string }
  site_save_problem: { state: 'error' | 'blocked' | 'conflict'; message: string | null }
  site_conflict_resolved: { choice: 'keep-local' | 'load-remote' }

  // AI edits
  ai_mode_changed: { enabled: boolean }
  ai_edit_requested: {
    instruction: string
    model: string
    model_key: string | null
    target_label: string | null
    target_tag: string | null
    target_text: string | null
    /** Where the selected element is in the code (`path:line`). */
    target_source: string | null
    target_selector: string | null
    screenshot: boolean
  }
  /** How a request ended: `applied`, `escalated`, `needs_input`... */
  ai_edit_finished: { instruction: string; status: string; summary: string; changed_paths: string[]; model: string; duration_ms: number }
  ai_edit_failed: { instruction: string; code: string | null; status: number | null; message: string; model: string; duration_ms: number }
  ai_edit_invalid: { length: number }
  ai_edit_stopped: { instruction: string; phase: string; duration_ms: number }
  ai_edit_undone: { commit_sha: string }
  ai_question_answered: { question: string; answer: string; option: boolean }
  ai_question_chatted: { question: string; message: string }

  // Preview and manual editing
  preview_element_selected: { tag: string; text: string; source: string | null; section: string | null; selector: string }
  visual_text_edited: { path: string; value: string }
  visual_edit_rejected: { path: string; error: string }
  edit_undone: { source: 'button' | 'keyboard' }
  edit_redone: { source: 'button' | 'keyboard' }
  preview_error: { message: string; path: string | null }
  code_file_opened: { path: string; modified: boolean }

  // AI models (bring your own key)
  ai_key_added: { provider: string; models_available: number }
  ai_key_add_failed: { provider: string; code: string | null }
  ai_key_checked: { key_id: string; ok: boolean; code: string | null }
  ai_key_models_saved: { key_id: string; models: string[] }
  ai_key_removed: { key_id: string }
  ai_model_picked: { model: string; provider: string | null; is_default: boolean }

  // Account
  sign_in_started: { return_to: string }
  /** Back from GitHub signed in, after `identify`. The SPA can't tell a first sign-in (sign-up) from a later one. */
  sign_in_completed: { method: 'github' }
  signed_out: Record<string, never>

  // Publish
  publish_started: { republish: boolean; target: string | null }
  publish_token_entered: { target: string | null }
  publish_succeeded: { target: string; repo: string; site_url: string | null; changed: boolean; missing_secrets: string[] }
  publish_failed: { code: string | null; message: string }
  deploy_started: { target: string | null }
  deploy_finished: { target: string | null; conclusion: string | null; timed_out: boolean }

}

export type AnalyticsEventName = keyof AnalyticsEvents

/** One event with its properties, for code that collects events before sending them (see `analytics.trackEach`). */
export type AnalyticsEvent = { [E in AnalyticsEventName]: { event: E; props: AnalyticsEvents[E] } }[AnalyticsEventName]
