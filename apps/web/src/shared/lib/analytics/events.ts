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

  // Chat (builder conversation)
  chat_message_sent: { text: string; length: number; step: string; next_step: string; reply: string | null; signed_in: boolean }
  chat_step_reached: { step: string; from: string }
  template_selected: { template_id: string; step: string; first_pick: boolean }
  github_profile_loaded: { login: string }
  github_profile_failed: { login: string }
  github_sign_in_prompted: { reason: string }
  github_connected_in_chat: { reason: string }
  session_imported: { source: string }

  // AI edits
  ai_mode_changed: { enabled: boolean }
  ai_edit_requested: {
    request_id: string
    instruction: string
    template_id: string
    model: string
    model_key: string | null
    target_label: string | null
    target_tag: string | null
    target_text: string | null
    target_content_path: string | null
    target_section: string | null
    target_selector: string | null
    file_paths: string[]
    history_turns: number
  }
  ai_edit_response: {
    request_id: string
    instruction: string
    tier: number
    summary: string
    edits_count: number
    edited_paths: string[]
    /** The search/replace edits the model returned, as JSON (truncated). */
    edits: string
    applied: boolean
    not_applied_reason: string | null
    escalation_reason: string | null
    reply: string
    model: string
    duration_ms: number
  }
  ai_edit_failed: { request_id: string; instruction: string; code: string | null; status: number | null; message: string; model: string; duration_ms: number }
  ai_edit_invalid: { length: number }
  ai_edit_stopped: { request_id: string; instruction: string; duration_ms: number }
  ai_edit_rolled_back: { instruction: string; error: string }

  // Preview and visual editing
  preview_element_selected: { tag: string; text: string; content_path: string | null; section: string | null; selector: string }
  visual_text_edited: { path: string; value: string }
  visual_edit_rejected: { path: string; error: string }
  edit_undone: { source: 'button' | 'keyboard' }
  edit_redone: { source: 'button' | 'keyboard' }
  preview_error: { message: string; template_id: string | null }
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
  signed_out: Record<string, never>

  // Publish
  publish_started: { republish: boolean; target: string | null }
  publish_token_entered: { target: string | null }
  publish_succeeded: { target: string; repo: string; site_url: string | null; changed: boolean; missing_secrets: string[] }
  publish_failed: { code: string | null; message: string }
  deploy_started: { target: string | null }
  deploy_finished: { target: string | null; conclusion: string | null; timed_out: boolean }

  // GitHub workspace sync
  github_sync_started: Record<string, never>
  github_sync_problem: { state: 'error' | 'blocked' | 'conflict'; message: string | null }
  github_sync_resolved: { choice: 'keep-local' | 'load-remote' }
}

export type AnalyticsEventName = keyof AnalyticsEvents

/** One event with its properties, for code that collects events before sending them (see `analytics.trackEach`). */
export type AnalyticsEvent = { [E in AnalyticsEventName]: { event: E; props: AnalyticsEvents[E] } }[AnalyticsEventName]
