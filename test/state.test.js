import test from 'node:test'
import assert from 'node:assert/strict'
import { STATE, createTracker, isSubagentSession, normalizeTitle, projectNameOf, sessionIdOf } from '../src/state.js'

function clockFrom(start = 1_000) {
  let now = start
  return {
    now: () => now,
    advance(ms) {
      now += ms
    },
  }
}

function session(id = 's1', header = {}) {
  return { header: { id, cwd: 'D:\\Repos\\pet-astra-yao', ...header } }
}

function event(type, data = {}) {
  return { type, data }
}

test('session metadata helpers', () => {
  assert.equal(sessionIdOf(session('abc')), 'abc')
  assert.equal(sessionIdOf({ id: 'plain' }), 'plain')
  assert.equal(sessionIdOf(null), 'unknown-session')
  assert.equal(projectNameOf({ header: { cwd: 'D:\\Repos\\pet-astra-yao' } }), 'pet-astra-yao')
  assert.equal(projectNameOf({ header: { cwd: '/home/me/code' } }), 'code')
  assert.equal(projectNameOf({ header: {} }), undefined)
  assert.equal(normalizeTitle('  hello   world  '), 'hello world')
  assert.equal(normalizeTitle(''), undefined)
  assert.equal(isSubagentSession({ header: { origin: 'subagent' } }), true)
  assert.equal(isSubagentSession({ header: { delegationDepth: 2 } }), true)
  assert.equal(isSubagentSession({ header: { origin: 'user' } }), false)
})

test('a full turn walks thinking -> working -> thinking -> idle + success pulse', () => {
  const clock = clockFrom()
  const tracker = createTracker({ now: clock.now })
  const s = session()

  assert.equal(tracker.handle(s, event('turn/start')), true)
  assert.equal(tracker.snapshot().state, STATE.THINKING)

  tracker.handle(s, event('assistant/chunk', { chunk: { type: 'reasoning-delta' } }))
  assert.equal(tracker.snapshot().state, STATE.THINKING)

  tracker.handle(s, event('tool/call', { callId: 'c1', name: 'shell' }))
  const working = tracker.snapshot()
  assert.equal(working.state, STATE.WORKING)
  assert.equal(working.activity, 'shell')

  tracker.handle(s, event('tool/result', { message: { source: { callId: 'c1' } } }))
  assert.equal(tracker.snapshot().state, STATE.THINKING)

  assert.equal(tracker.handle(s, event('turn/end', { reason: { kind: 'completed' } })), true)
  const done = tracker.snapshot()
  assert.equal(done.state, STATE.IDLE)
  assert.equal(done.pulse.animation, 'jumping')
  assert.equal(done.pulse.state, STATE.IDLE)

  clock.advance(5_001)
  assert.equal(tracker.snapshot().pulse, null, 'the success pulse expires')
})

test('ask_user_question and plan review park the pet in waiting', () => {
  const tracker = createTracker()
  const s = session()

  tracker.handle(s, event('turn/start'))
  tracker.handle(s, event('tool/call', { callId: 'ask-1', name: 'ask_user_question' }))
  let snap = tracker.snapshot()
  assert.equal(snap.state, STATE.WAITING)
  assert.equal(snap.waitingKind, 'ask')

  tracker.handle(s, event('tool/result', { callId: 'ask-1' }))
  assert.equal(tracker.snapshot().state, STATE.THINKING)

  tracker.handle(s, event('tool/call', { callId: 'plan-1', name: 'exit_plan_mode' }))
  snap = tracker.snapshot()
  assert.equal(snap.state, STATE.WAITING)
  assert.equal(snap.waitingKind, 'plan-review')
})

test('approval requests are waiting until decided', () => {
  const tracker = createTracker()
  const s = session()

  tracker.handle(s, event('turn/start'))
  tracker.handle(s, event('approval/asked', { id: 'ap-1', toolName: 'shell' }))
  let snap = tracker.snapshot()
  assert.equal(snap.state, STATE.WAITING)
  assert.equal(snap.waitingKind, 'approval')
  assert.equal(snap.activity, 'shell')

  tracker.handle(s, event('approval/decided', { id: 'ap-1' }))
  assert.equal(tracker.snapshot().state, STATE.THINKING)
})

test('a failed turn becomes an error until acknowledged', () => {
  const clock = clockFrom()
  const tracker = createTracker({ now: clock.now })
  const s = session()

  tracker.handle(s, event('turn/start'))
  tracker.handle(s, event('tool/call', { callId: 'c1', name: 'shell' }))
  tracker.handle(s, event('turn/end', { reason: { kind: 'max-tokens' } }))

  let snap = tracker.snapshot()
  assert.equal(snap.state, STATE.ERROR)
  assert.equal(snap.errorKind, 'max-tokens')

  assert.equal(tracker.acknowledge(), true)
  snap = tracker.snapshot()
  assert.equal(snap.state, STATE.IDLE)
  assert.equal(snap.errorKind, '')
})

test('aborted and blocked turns settle differently', () => {
  const aborted = createTracker()
  aborted.handle(session('a'), event('turn/start'))
  aborted.handle(session('a'), event('turn/end', { reason: { kind: 'aborted' } }))
  assert.equal(aborted.snapshot().state, STATE.IDLE)

  const blocked = createTracker()
  blocked.handle(session('b'), event('turn/start'))
  blocked.handle(session('b'), event('turn/end', { reason: { kind: 'blocked' } }))
  assert.equal(blocked.snapshot().state, STATE.WAITING)
})

test('a failing tool result fires the failed animation without changing the base state', () => {
  const tracker = createTracker()
  const s = session()

  tracker.handle(s, event('turn/start'))
  tracker.handle(s, event('tool/call', { callId: 'c1', name: 'shell' }))
  tracker.handle(s, event('tool/result', { callId: 'c1', error: 'boom' }))

  const snap = tracker.snapshot()
  assert.equal(snap.state, STATE.THINKING)
  assert.equal(snap.pulse.animation, 'failed')
})

test('subagent sessions are ignored unless enabled', () => {
  const tracker = createTracker()
  const sub = session('sub', { origin: 'subagent' })

  assert.equal(tracker.handle(sub, event('turn/start')), false)
  assert.equal(tracker.snapshot().active, false)

  tracker.setIncludeSubagents(true)
  assert.equal(tracker.handle(sub, event('turn/start')), true)
  assert.equal(tracker.snapshot().state, STATE.THINKING)
  assert.equal(tracker.includeSubagents, true)
})

test('the most urgent session wins the spotlight', () => {
  const clock = clockFrom()
  const tracker = createTracker({ now: clock.now })
  const working = session('work')
  const waiting = session('wait')

  tracker.handle(working, event('turn/start'))
  tracker.handle(working, event('tool/call', { callId: 'c1', name: 'shell' }))
  clock.advance(10)

  tracker.handle(waiting, event('turn/start'))
  tracker.handle(waiting, event('approval/asked', { id: 'ap-1', toolName: 'shell' }))

  const snap = tracker.snapshot()
  assert.equal(snap.state, STATE.WAITING)
  assert.equal(snap.sessionId, 'wait')
  assert.equal(snap.project, 'pet-astra-yao')

  tracker.dispose(waiting)
  assert.equal(tracker.snapshot().sessionId, 'work')
})

test('titles come from session/title events', () => {
  const tracker = createTracker()
  const s = session()
  tracker.handle(s, event('session/title', { title: '  Refactor   the pet  ' }))
  assert.equal(tracker.snapshot().title, 'Refactor the pet')
  assert.equal(tracker.snapshot().sessionId, 's1')
})
