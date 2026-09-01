import type { PermissionRequest, QuestionRequest, Session } from "@opencode-ai/sdk/v2/client"
import { sessionPermissionRequest, sessionQuestionRequest } from "@/pages/session/composer/session-request-tree"

export function homeSessionNeedsAttention(input: {
  sessionID: string
  sessions: Session[]
  permissions: Record<string, PermissionRequest[] | undefined>
  questions: Record<string, QuestionRequest[] | undefined>
  autoResponds: (item: PermissionRequest) => boolean
  unseenCount: number
}) {
  if (input.unseenCount > 0) return true
  if (sessionQuestionRequest(input.sessions, input.questions, input.sessionID)) return true
  return !!sessionPermissionRequest(
    input.sessions,
    input.permissions,
    input.sessionID,
    (item) => !input.autoResponds(item),
  )
}
