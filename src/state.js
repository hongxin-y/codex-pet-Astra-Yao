/**
 * Session-event reducer for the Astra Yao pet.
 *
 * The host subscribes to the global `session/event` bus and feeds every event
 * into this tracker. The tracker answers one question: what is the single most
 * interesting thing a pet should show right now? It is deliberately
 * dependency-free and time-injected so it can be unit tested.
 *
 * Derived states:
 *   idle      nothing running
 *   thinking  a turn is streaming reasoning or text
 *   working   at least one tool call is open
 *   waiting   a tool approval, a user question or a plan review is pending
 *   error     the last turn ended unsuccessfully and was not acknowledged
 *
 * Short pulses (success, failed tool result) ride on top of the base state and
 * expire on their own; the client plays them once and returns to the base state.
 */

export const STATE = Object.freeze({
  IDLE: 'idle',
  THINKING: 'thinking',
  WORKING: 'working',
  WAITING: 'waiting',
  ERROR: 'error',
})

const ASK_USER_TOOL = 'ask_user_question'
const PLAN_REVIEW_TOOL = 'exit_plan_mode'

const STATE_PRIORITY = Object.freeze({
  [STATE.ERROR]: 5,
  [STATE.WAITING]: 4,
  [STATE.WORKING]: 3,
  [STATE.THINKING]: 2,
  [STATE.IDLE]: 1,
})

export function sessionIdOf(session) {
  return String(session?.header?.id ?? session?.id ?? 'unknown-session')
}

export function isSubagentSession(session) {
  return session?.header?.origin === 'subagent' || Number(session?.header?.delegationDepth ?? 0) > 0
}

/** Last path segment of the session cwd, used as the pet's project label. */
export function projectNameOf(session) {
  const raw = String(session?.header?.cwd ?? '').trim()
  if (!raw) return undefined
  const parts = raw.split(/[\\/]+/u).filter(Boolean)
  const name = parts.length > 0 ? parts[parts.length - 1] : raw
  return name.replace(/\s+/gu, ' ').slice(0, 40) || undefined
}

export function normalizeTitle(value) {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim()
  return text ? text.slice(0, 80) : undefined
}

function toolCallIdOf(event) {
  return String(
    event?.data?.message?.source?.callId
      ?? event?.data?.message?.toolCallId
      ?? event?.data?.message?.callId
      ?? event?.data?.callId
      ?? '',
  )
}

function turnEndKind(event) {
  return String(event?.data?.reason?.kind ?? 'completed')
}

/** Short human-readable text for a failed tool result or a failed turn. */
export function errorTextOf(value) {
  const raw = typeof value === 'string' ? value : value?.message ?? value?.error ?? value?.text ?? ''
  const text = String(raw ?? '').replace(/\s+/gu, ' ').trim()
  return text ? text.slice(0, 140) : undefined
}

/**
 * @param {object} [options]
 * @param {boolean} [options.includeSubagents] let subagent sessions drive the pet
 * @param {number} [options.successPulseMs] lifetime of the completion pulse
 * @param {number} [options.errorPulseMs] lifetime of a tool-error pulse
 * @param {() => number} [options.now] clock, injectable for tests
 */
export function createTracker(options = {}) {
  const config = {
    includeSubagents: false,
    successPulseMs: 5000,
    errorPulseMs: 3000,
    now: () => Date.now(),
    ...options,
  }

  const sessions = new Map()
  let pulse = null
  let pulseSeq = 0

  /** Map of open tool calls, keyed by call id. */
  function recordFor(session) {
    const id = sessionIdOf(session)
    let record = sessions.get(id)
    if (!record) {
      record = {
        id,
        state: STATE.IDLE,
        activity: '',
        errorKind: '',
        errorText: '',
        turnActive: false,
        openTools: new Map(),
        waits: new Map(),
        title: undefined,
        project: projectNameOf(session),
        updatedAt: config.now(),
      }
      sessions.set(id, record)
    }
    if (!record.project) record.project = projectNameOf(session)
    return record
  }

  function update(record, state, extra = {}) {
    const before = `${record.state}\u0000${record.activity}\u0000${record.errorKind}`
    record.state = state
    record.activity = extra.activity ?? ''
    record.errorKind = extra.errorKind ?? ''
    record.errorText = extra.errorText ?? ''
    record.updatedAt = config.now()
    const after = `${record.state}\u0000${record.activity}\u0000${record.errorKind}`
    return before !== after
  }

  function waitingKindOf(record) {
    const first = record.waits.values().next()
    return first.done ? '' : String(first.value)
  }

  function firePulse(state, animation, ttlMs) {
    pulse = { id: ++pulseSeq, state, animation, at: config.now(), ttlMs }
    return true
  }

  /** Recompute the state underneath pending waits and open tool calls. */
  function settle(record) {
    if (record.waits.size > 0) return false
    if (!record.turnActive) return false
    const open = [...record.openTools.values()]
    const next = open.length > 0 ? STATE.WORKING : STATE.THINKING
    return update(record, next, { activity: open.length > 0 ? open[0].name : '' })
  }

  /**
   * Feed one bus event.
   * @returns {boolean} true when the rendered state or pulse changed
   */
  function handle(session, event) {
    if (!session || !event || typeof event.type !== 'string') return false
    if (!config.includeSubagents && isSubagentSession(session)) return false

    const record = recordFor(session)

    switch (event.type) {
      case 'session/title': {
        const title = normalizeTitle(event?.data?.title)
        if (!title || title === record.title) return false
        record.title = title
        return true
      }

      case 'turn/start': {
        record.turnActive = true
        record.openTools.clear()
        record.waits.clear()
        pulse = null
        return update(record, STATE.THINKING)
      }

      case 'step/start':
      case 'assistant/message': {
        if (!record.turnActive || record.openTools.size > 0 || record.waits.size > 0) return false
        return update(record, STATE.THINKING)
      }

      case 'assistant/chunk': {
        if (!record.turnActive || record.openTools.size > 0 || record.waits.size > 0) return false
        const chunkType = String(event?.data?.chunk?.type ?? 'text-delta')
        return update(record, chunkType === 'tool-call-delta' ? STATE.WORKING : STATE.THINKING)
      }

      case 'tool/call': {
        const callId = String(event?.data?.callId ?? `seq-${String(event?.seq ?? 'unknown')}`)
        const name = String(event?.data?.name ?? 'tool')
        record.openTools.set(callId, { name })
        if (name === ASK_USER_TOOL || name === PLAN_REVIEW_TOOL) {
          record.waits.set(callId, name === ASK_USER_TOOL ? 'ask' : 'plan-review')
          return update(record, STATE.WAITING, { activity: name })
        }
        return update(record, STATE.WORKING, { activity: name })
      }

      case 'tool/result': {
        const callId = toolCallIdOf(event)
        if (callId) {
          record.openTools.delete(callId)
          record.waits.delete(callId)
        }
        let changed = settle(record)
        if (event?.data?.error) {
          record.errorText = errorTextOf(event.data.error) ?? record.errorText
          changed = firePulse(STATE.ERROR, 'failed', config.errorPulseMs) || changed
        }
        return changed
      }

      case 'approval/asked': {
        const approvalId = String(event?.data?.id ?? `seq-${String(event?.seq ?? 'unknown')}`)
        record.waits.set(approvalId, 'approval')
        return update(record, STATE.WAITING, { activity: String(event?.data?.toolName ?? 'tool') })
      }

      case 'approval/decided': {
        record.waits.delete(String(event?.data?.id ?? ''))
        return settle(record)
      }

      case 'turn/end': {
        record.turnActive = false
        record.openTools.clear()
        record.waits.clear()
        const kind = turnEndKind(event)
        if (kind === 'completed') {
          update(record, STATE.IDLE)
          return firePulse(STATE.IDLE, 'jumping', config.successPulseMs)
        }
        if (kind === 'aborted' || kind === 'disposed') return update(record, STATE.IDLE)
        if (kind === 'blocked') return update(record, STATE.WAITING)
        return update(record, STATE.ERROR, {
          errorKind: kind,
          errorText: errorTextOf(event?.data?.reason) ?? errorTextOf(event?.data?.error) ?? '',
        })
      }

      default:
        return false
    }
  }

  function dispose(session) {
    return sessions.delete(sessionIdOf(session))
  }

  function acknowledge(sessionId) {
    let changed = false
    for (const record of sessions.values()) {
      if (sessionId != null && record.id !== String(sessionId)) continue
      if (record.state !== STATE.ERROR) continue
      update(record, STATE.IDLE)
      changed = true
    }
    return changed
  }

  function clearPulse() {
    if (!pulse) return false
    pulse = null
    return true
  }

  function pick() {
    let best = null
    for (const record of sessions.values()) {
      if (!best) {
        best = record
        continue
      }
      const byPriority = (STATE_PRIORITY[record.state] ?? 0) - (STATE_PRIORITY[best.state] ?? 0)
      if (byPriority > 0 || (byPriority === 0 && record.updatedAt > best.updatedAt)) best = record
    }
    return best
  }

  function snapshot() {
    const now = config.now()
    let currentPulse = null
    if (pulse) {
      const remainingMs = pulse.at + pulse.ttlMs - now
      if (remainingMs <= 0) pulse = null
      else currentPulse = { id: pulse.id, state: pulse.state, animation: pulse.animation, remainingMs }
    }
    const active = pick()
    return {
      active: Boolean(active),
      sessionId: active?.id ?? null,
      state: active?.state ?? STATE.IDLE,
      activity: active?.activity ?? '',
      waitingKind: active ? waitingKindOf(active) : '',
      errorKind: active?.errorKind ?? '',
      errorText: active?.state === STATE.ERROR ? active.errorText ?? '' : '',
      title: active?.title ?? null,
      project: active?.project ?? null,
      updatedAt: active?.updatedAt ?? 0,
      pulse: currentPulse,
    }
  }

  return {
    handle,
    dispose,
    acknowledge,
    clearPulse,
    snapshot,
    sessions,
    get includeSubagents() {
      return config.includeSubagents
    },
    setIncludeSubagents(value) {
      config.includeSubagents = Boolean(value)
    },
  }
}
