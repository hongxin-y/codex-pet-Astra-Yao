import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describeAtlas } from '../src/atlas.js'

const BUNDLE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const BUNDLE_ID = 'dsh-pet-astra-yao'
const ROOT_ID = 'dsh-pet-astra-yao-root'

// ---------------------------------------------------------------------------
// A fake DOM just large enough to run the widget: elements are plain objects,
// the shadow root resolves a fixed set of selectors, and timers/rAF are manual
// so the test never waits on wall-clock time.
// ---------------------------------------------------------------------------

function fakeElement(tagName) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    style: {
      setProperty(name, value) {
        element.style[name] = value
      },
      getPropertyValue(name) {
        return element.style[name] ?? ''
      },
    },
    dataset: {},
    hidden: false,
    children: [],
    classList: {
      values: new Set(),
      add(...names) {
        for (const name of names) element.classList.values.add(name)
      },
      remove(...names) {
        for (const name of names) element.classList.values.delete(name)
      },
      contains(name) {
        return element.classList.values.has(name)
      },
    },
    listeners: new Map(),
    parentNode: null,
    _box: { left: 0, top: 0, width: 144, height: 156 },
    addEventListener(type, handler) {
      const list = element.listeners.get(type) ?? []
      list.push(handler)
      element.listeners.set(type, list)
    },
    removeEventListener(type, handler) {
      const list = element.listeners.get(type) ?? []
      element.listeners.set(
        type,
        list.filter((item) => item !== handler),
      )
    },
    dispatch(type, event = {}) {
      for (const handler of element.listeners.get(type) ?? []) handler(event)
    },
    getBoundingClientRect() {
      return { ...element._box }
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    attachShadow() {
      element._shadow = fakeShadow()
      return element._shadow
    },
    appendChild(child) {
      child.parentNode = element
      element.children.push(child)
      return child
    },
    removeChild(child) {
      element.children = element.children.filter((item) => item !== child)
      child.parentNode = null
      return child
    },
  }
  Object.defineProperty(element, 'innerHTML', {
    set(value) {
      element._html = value
    },
    get() {
      return element._html
    },
  })
  return element
}

const SHADOW_SELECTORS = ['.pet', '.sprite', '.ghost', '.menu', '.menu-state']

function fakeShadow() {
  const cache = new Map()
  return {
    set innerHTML(value) {
      this._html = value
    },
    get innerHTML() {
      return this._html
    },
    querySelector(selector) {
      const key = selector.split(' ').pop()
      if (!cache.has(key)) cache.set(key, fakeElement('div'))
      return cache.get(key)
    },
    querySelectorAll() {
      return []
    },
  }
}

function createSandbox() {
  const registry = new Map()
  const body = fakeElement('body')
  const originalAppend = body.appendChild.bind(body)
  body.appendChild = (child) => {
    originalAppend(child)
    if (child.id) registry.set(child.id, child)
    return child
  }

  const documentListeners = new Map()
  const document = {
    body,
    hidden: false,
    getElementById(id) {
      return registry.get(id) ?? null
    },
    createElement(tag) {
      return fakeElement(tag)
    },
    querySelectorAll() {
      return []
    },
    addEventListener(type, handler) {
      const list = documentListeners.get(type) ?? []
      list.push(handler)
      documentListeners.set(type, list)
    },
    removeEventListener(type, handler) {
      documentListeners.set(
        type,
        (documentListeners.get(type) ?? []).filter((item) => item !== handler),
      )
    },
  }

  const windowListeners = new Map()
  const window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(type, handler) {
      const list = windowListeners.get(type) ?? []
      list.push(handler)
      windowListeners.set(type, list)
    },
    removeEventListener(type, handler) {
      windowListeners.set(
        type,
        (windowListeners.get(type) ?? []).filter((item) => item !== handler),
      )
    },
  }

  let clock = 1000
  const rafs = []
  const timers = new Map()
  let timerSeq = 0
  let capture = null
  const patches = []

  const sandbox = {
    console,
    document,
    window,
    performance: {
      now: () => clock,
      getEntriesByType: () => [{ name: 'http://127.0.0.1:6575/plugins/??dsh-pet-astra-yao&rev=1' }],
    },
    requestAnimationFrame(callback) {
      rafs.push(callback)
      return rafs.length
    },
    cancelAnimationFrame() {},
    setTimeout(callback, delay) {
      timerSeq += 1
      timers.set(timerSeq, { callback, delay })
      return timerSeq
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    fetch: async (url, init = {}) => {
      if (String(url).endsWith('/config') && init.method === 'PATCH') {
        patches.push(JSON.parse(init.body))
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, config: {}, session: null }),
      }
    },
    __ModuleLoader__: {
      load(entry) {
        capture = entry
      },
    },
  }
  sandbox.window.__ModuleLoader__ = sandbox.__ModuleLoader__
  sandbox.globalThis = sandbox

  return {
    sandbox,
    body,
    patches,
    timers,
    rafs,
    advanceClock(ms) {
      clock += ms
    },
    now: () => clock,
    /** Run the most recently scheduled animation frame. */
    pump(ms = 0) {
      clock += ms
      const callback = rafs.pop()
      assert.ok(callback, 'an animation frame must be scheduled')
      callback(clock)
    },
    /** Run the most recently scheduled timer callback. */
    runTimer() {
      const [id, timer] = [...timers.entries()].pop() ?? []
      assert.ok(timer, 'a timer must be scheduled')
      timers.delete(id)
      return timer.callback()
    },
    /** Run the first pending timer whose delay matches the predicate. */
    runTimerMatching(predicate) {
      for (const [id, timer] of [...timers.entries()]) {
        if (!predicate(timer)) continue
        timers.delete(id)
        return timer.callback()
      }
      return undefined
    },
    /** Dispatch a window-level event, e.g. pointermove. */
    fireWindow(type, event = {}) {
      for (const handler of windowListeners.get(type) ?? []) handler(event)
    },
    load() {
      assert.ok(capture, 'the bundle must call window.__ModuleLoader__.load')
      return capture
    },
  }
}

function loadBundle() {
  const env = createSandbox()
  const context = vm.createContext(env.sandbox)
  vm.runInContext(BUNDLE, context, { filename: 'lib/client.js' })
  return { env, context }
}

function makeContextHandle(env) {
  const effects = []
  return {
    effects,
    effect(factory, label) {
      effects.push({ factory, label })
      return () => {}
    },
  }
}

function applyWidget() {
  const { env, context } = loadBundle()
  const entry = env.load()
  assert.equal(entry.id, BUNDLE_ID)
  const plugin = entry.factory((name) => {
    throw new Error(`the client bundle must not require modules, got ${JSON.stringify(name)}`)
  })
  const ctx = makeContextHandle(env)
  plugin.apply(ctx)
  return { env, context, plugin, ctx }
}

// ---------------------------------------------------------------------------
// Bundle contract
// ---------------------------------------------------------------------------

test('bundle registers the DSH client module for this package', () => {
  const { env } = loadBundle()
  const entry = env.load()
  assert.equal(entry.id, BUNDLE_ID)
  assert.equal(typeof entry.factory, 'function')
})

test('factory exports the client plugin contract', () => {
  const { env } = loadBundle()
  const plugin = env.load().factory(() => {
    throw new Error('no requires expected')
  })
  assert.equal(plugin.name, `${BUNDLE_ID}-client`)
  assert.ok(Array.isArray(plugin.inject))
  assert.deepEqual([...plugin.inject], [])
  assert.equal(typeof plugin.apply, 'function')
})

test('bundle embeds the shared atlas and the package version', () => {
  const match = BUNDLE.match(/const PET_ATLAS = (\{.*?\});\n/u)
  assert.ok(match, 'the bundle must inline the atlas')
  assert.deepEqual(JSON.parse(match[1]), describeAtlas())
  assert.match(BUNDLE, /const PET_VERSION = "\d+\.\d+\.\d+[^"]*";/u)
})

// ---------------------------------------------------------------------------
// Widget behaviour
// ---------------------------------------------------------------------------

test('apply mounts the pet and paints the first idle frame', () => {
  const { env } = applyWidget()
  assert.equal(env.body.children.length, 1)
  const host = env.body.children[0]
  assert.equal(host.id, ROOT_ID)

  const shadow = host._shadow
  const sprite = shadow.querySelector('.sprite')
  assert.match(sprite.style.backgroundImage, /\/plugins\/dsh-pet-astra-yao\/assets\/spritesheet\.webp/u)

  env.pump(0)
  assert.equal(sprite.style.width, '144px')
  assert.equal(sprite.style.height, '156px')
  assert.equal(sprite.style.backgroundSize, '1152px 1716px')
  assert.equal(sprite.style.backgroundPosition, '0px 0px')

  const pet = shadow.querySelector('.pet')
  assert.equal(pet.style.display, 'block')
  assert.equal(pet.style.left, '1112px') // 1280 - 144 - 24
  assert.equal(pet.style.top, '620px') // 800 - 156 - 24
  assert.match(pet.title, /Astra Yao/u)
})

test('the animation loop advances columns and wraps', () => {
  const { env } = applyWidget()
  const sprite = env.body.children[0]._shadow.querySelector('.sprite')

  env.pump(160)
  assert.equal(sprite.style.backgroundPosition, '-144px 0px')
  env.pump(160 * 4)
  assert.equal(sprite.style.backgroundPosition, '-720px 0px')
  env.pump(160)
  assert.equal(sprite.style.backgroundPosition, '0px 0px', 'six-frame idle loops back to column 0')
})

test('config patches repaint scale, opacity, mirror and visibility', async () => {
  const { env, context } = applyWidget()
  const host = env.body.children[0]
  const sprite = host._shadow.querySelector('.sprite')
  const pet = host._shadow.querySelector('.pet')
  const ghost = host._shadow.querySelector('.ghost')
  const handle = env.sandbox.__DSH_PET_ASTRA_YAO__
  assert.ok(handle, 'the widget exposes a debug handle')

  handle.patch({ scale: 1.5, opacity: 0.6, mirror: true })
  await Promise.resolve()
  assert.equal(pet.style.opacity, '0.6')
  assert.equal(sprite.style.transform, 'scaleX(-1)')

  env.pump(0)
  assert.equal(sprite.style.width, '216px')
  assert.equal(sprite.style.height, '234px')
  assert.equal(sprite.style.backgroundSize, '1728px 2574px')

  handle.patch({ hidden: true })
  await Promise.resolve()
  assert.equal(pet.style.display, 'none')
  assert.equal(ghost.hidden, false)

  handle.patch({ hidden: false })
  await Promise.resolve()
  assert.equal(pet.style.display, 'block')
  assert.equal(ghost.hidden, true)

  assert.deepEqual(env.patches, [
    { scale: 1.5, opacity: 0.6, mirror: true },
    { hidden: true },
    { hidden: false },
  ])
  void context
})

test('pausing freezes the sprite on the first frame', async () => {
  const { env } = applyWidget()
  const sprite = env.body.children[0]._shadow.querySelector('.sprite')
  const handle = env.sandbox.__DSH_PET_ASTRA_YAO__
  env.pump(160)
  assert.equal(sprite.style.backgroundPosition, '-144px 0px')
  handle.patch({ paused: true })
  await Promise.resolve()
  env.pump(160)
  assert.equal(sprite.style.backgroundPosition, '0px 0px')
})

test('polling is scheduled and survives a failing fetch', async () => {
  const { env } = applyWidget()
  assert.ok(env.timers.size > 0, 'the first poll must be scheduled')
  env.sandbox.fetch = async () => {
    throw new Error('offline')
  }
  await env.runTimer()
  assert.ok([...env.timers.values()].some((timer) => timer.delay === 4000), 'a failed poll retries slowly')
})

test('teardown removes the widget and unregisters the debug handle', () => {
  const { env } = applyWidget()
  const handle = env.sandbox.__DSH_PET_ASTRA_YAO__
  handle.teardown()
  assert.equal(env.body.children.length, 0)
  assert.equal(env.sandbox.__DSH_PET_ASTRA_YAO__, undefined)
})

// ---------------------------------------------------------------------------
// Session state: bubble text and the anti-flicker base pose
// ---------------------------------------------------------------------------

function sessionPayload(session, config = {}) {
  return { ok: true, config, session, serverTime: 1 }
}

function feed(env, session, config = {}) {
  env.sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => sessionPayload(session, config) })
  return env.runTimer()
}

test('the status bubble mirrors the session and honours showBubble', async () => {
  const { env } = applyWidget()
  const shadow = env.body.children[0]._shadow
  const bubble = shadow.querySelector('.bubble')
  const bubbleState = shadow.querySelector('.bubble-state')
  const bubbleDetail = shadow.querySelector('.bubble-detail')
  const bubbleSub = shadow.querySelector('.bubble-sub')

  await feed(env, {
    active: true,
    sessionId: 's1',
    state: 'working',
    activity: 'shell',
    waitingKind: '',
    errorKind: '',
    errorText: '',
    title: '修 bug',
    project: 'pet-astra-yao',
    pulse: null,
  })

  assert.equal(bubble.hidden, false)
  assert.equal(bubbleState.textContent, '执行中')
  assert.equal(bubbleDetail.hidden, false)
  assert.equal(bubbleDetail.textContent, 'shell')
  assert.equal(bubbleSub.textContent, 'pet-astra-yao · 修 bug')

  const handle = env.sandbox.__DSH_PET_ASTRA_YAO__
  handle.patch({ showBubble: false })
  await Promise.resolve()
  assert.equal(bubble.hidden, true, 'turning the bubble off hides it immediately')

  handle.patch({ showBubble: true, showBubbleUsage: true })
  await Promise.resolve()
  assert.equal(bubble.hidden, false)
})

test('a failed turn shows the error text until acknowledged', async () => {
  const { env } = applyWidget()
  const shadow = env.body.children[0]._shadow
  const bubbleState = shadow.querySelector('.bubble-state')
  const bubbleDetail = shadow.querySelector('.bubble-detail')

  await feed(env, {
    active: true,
    sessionId: 's1',
    state: 'error',
    activity: '',
    waitingKind: '',
    errorKind: 'error',
    errorText: 'HTTP 500 from the model gateway',
    title: null,
    project: null,
    pulse: null,
  })
  assert.equal(bubbleState.textContent, '出错了')
  assert.equal(bubbleDetail.textContent, 'HTTP 500 from the model gateway')

  const handle = env.sandbox.__DSH_PET_ASTRA_YAO__
  handle.acknowledge()
  await Promise.resolve()
  assert.equal(bubbleState.textContent, '待机')
})

test('working/thinking flips do not restart the walk cycle while it is still new', async () => {
  const { env } = applyWidget()
  const sprite = env.body.children[0]._shadow.querySelector('.sprite')
  const handle = env.sandbox.__DSH_PET_ASTRA_YAO__
  env.pump(0)

  await feed(env, { active: true, sessionId: 's1', state: 'thinking', activity: '', pulse: null, title: null, project: null })
  env.pump(0)
  assert.equal(handle.snapshot.baseState, 'thinking')
  assert.equal(sprite.style.backgroundPosition, '-288px -1248px', 'review is row 8, hand-on-chin column')

  // A tool call escalates immediately: working outranks thinking.
  await feed(env, { active: true, sessionId: 's1', state: 'working', activity: 'shell', pulse: null, title: null, project: null })
  env.pump(0)
  assert.equal(handle.snapshot.baseState, 'working')
  assert.equal(sprite.style.backgroundPosition, '0px -1092px', 'running is row 7')

  // ...and the very next poll flips back to thinking. That must NOT restart.
  await feed(env, { active: true, sessionId: 's1', state: 'thinking', activity: '', pulse: null, title: null, project: null })
  env.pump(120)
  assert.equal(handle.snapshot.baseState, 'working', 'a relaxation waits for the hold window')
  assert.equal(sprite.style.backgroundPosition, '-144px -1092px', 'the walk cycle keeps advancing instead of restarting')

  // Once the hold window has passed the pending timer drops back to review.
  env.advanceClock(1600)
  env.runTimerMatching((timer) => timer.delay === 1500)
  env.pump(0)
  assert.equal(handle.snapshot.baseState, 'thinking')
  assert.equal(sprite.style.backgroundPosition, '-288px -1248px')
})

test('the speed setting scales the frame interval', async () => {
  const { env } = applyWidget()
  const sprite = env.body.children[0]._shadow.querySelector('.sprite')
  const handle = env.sandbox.__DSH_PET_ASTRA_YAO__
  env.pump(0)

  await handle.patch({ speed: 0.5 })
  env.pump(160)
  assert.equal(sprite.style.backgroundPosition, '0px 0px', 'half speed keeps the first frame for 320 ms')
  env.pump(160)
  assert.equal(sprite.style.backgroundPosition, '-144px 0px')

  await handle.patch({ speed: 1.6 })
  env.pump(100)
  assert.equal(sprite.style.backgroundPosition, '-144px 0px', 'double speed advances after 80 ms')
})

// ---------------------------------------------------------------------------
// Atlas quirks: this sheet has two rows that cannot be played as drawn
// ---------------------------------------------------------------------------

test('dragging right mirrors the clean left-run row instead of the crouched row', () => {
  const { env } = applyWidget()
  const shadow = env.body.children[0]._shadow
  const pet = shadow.querySelector('.pet')
  const sprite = shadow.querySelector('.sprite')
  env.pump(0)

  pet.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 200, clientY: 200, preventDefault() {} })
  env.fireWindow('pointermove', { clientX: 260, clientY: 200 })
  env.pump(0)
  assert.equal(sprite.style.backgroundPosition, '0px -312px', 'row 2 is the left run, mirrored')
  assert.equal(sprite.style.transform, 'scaleX(-1)')

  env.fireWindow('pointermove', { clientX: 140, clientY: 200 })
  env.pump(0)
  assert.equal(sprite.style.backgroundPosition, '0px -312px')
  assert.equal(sprite.style.transform, '', 'running left drops the mirror again')
})

test('the failed loop skips the lying frame so the pet never flops over', async () => {
  const { env } = applyWidget()
  const shadow = env.body.children[0]._shadow
  const sprite = shadow.querySelector('.sprite')
  const handle = env.sandbox.__DSH_PET_ASTRA_YAO__
  env.pump(0)

  await feed(env, {
    active: true,
    sessionId: 's1',
    state: 'error',
    activity: '',
    waitingKind: '',
    errorKind: 'error',
    errorText: 'boom',
    title: null,
    project: null,
    pulse: null,
  })
  assert.equal(handle.snapshot.baseState, 'error')

  const seen = []
  for (let index = 0; index < 7; index += 1) {
    env.pump(index === 0 ? 0 : 140)
    seen.push(sprite.style.backgroundPosition)
  }
  assert.deepEqual(seen, [
    '0px -780px',
    '-144px -780px',
    '-288px -780px',
    '-432px -780px',
    '-576px -780px',
    '-864px -780px',
    '-1008px -780px',
  ])
})

test('thinking holds the hand-on-chin pose instead of nodding through six frames', async () => {
  const { env } = applyWidget()
  const sprite = env.body.children[0]._shadow.querySelector('.sprite')
  await feed(env, {
    active: true,
    sessionId: 's1',
    state: 'thinking',
    activity: '',
    waitingKind: '',
    errorKind: '',
    errorText: '',
    title: null,
    project: null,
    pulse: null,
  })
  env.pump(0)
  assert.equal(sprite.style.backgroundPosition, '-288px -1248px', 'column 2 is the pondering pose')

  env.pump(619)
  assert.equal(sprite.style.backgroundPosition, '-288px -1248px', 'the pose is held, not flicked through')

  env.pump(2)
  assert.equal(sprite.style.backgroundPosition, '-432px -1248px', 'column 3 is the slow blink')

  env.pump(620)
  assert.equal(sprite.style.backgroundPosition, '-288px -1248px', 'and back to pondering')
})

test('pointer look is opt-in: rows 9-10 are drawn at a different scale', async () => {
  const { env } = applyWidget()
  const sprite = env.body.children[0]._shadow.querySelector('.sprite')
  const session = { active: true, sessionId: 's1', state: 'idle', activity: '', pulse: null, title: null, project: null }
  await feed(env, session)
  env.pump(0)

  // Default config keeps lookAtPointer off, so a nearby cursor changes nothing.
  env.fireWindow('pointermove', { clientX: 72 + 100, clientY: 78 })
  env.pump(0)
  assert.match(sprite.style.backgroundPosition, / 0px$/u, 'the idle row keeps playing by default')

  // Turning it on brings the look cells back, still limited to a 280 px radius.
  await feed(env, session, { lookAtPointer: true })
  env.fireWindow('pointermove', { clientX: 72 + 400, clientY: 78 })
  env.pump(200)
  assert.equal(sprite.style.backgroundPosition, '-144px 0px', 'idle keeps animating when the cursor is far')

  env.fireWindow('pointermove', { clientX: 72 + 120, clientY: 78 })
  env.pump(0)
  assert.equal(sprite.style.backgroundPosition, '-576px -1404px', 'a nearby cursor shows the look-right cell')

  env.advanceClock(120)
  env.fireWindow('pointermove', { clientX: 72 + 400, clientY: 78 })
  env.pump(0)
  assert.match(sprite.style.backgroundPosition, / 0px$/u, 'the idle row comes back once the cursor leaves')
})

// ---------------------------------------------------------------------------
// Status bubble placement
// ---------------------------------------------------------------------------

const WORKING_SESSION = {
  active: true,
  sessionId: 's1',
  state: 'working',
  activity: 'shell',
  waitingKind: '',
  errorKind: '',
  errorText: '',
  title: '修 bug',
  project: 'pet-astra-yao',
  pulse: null,
}

test('the bubble anchors to the pet side and points its tail at the pet', async () => {
  const { env } = applyWidget()
  const shadow = env.body.children[0]._shadow
  const pet = shadow.querySelector('.pet')
  const bubble = shadow.querySelector('.bubble')

  // Right half of the viewport: the bubble's right edge tracks the pet's right edge.
  pet._box = { left: 1000, top: 600, width: 144, height: 156 }
  await feed(env, WORKING_SESSION)
  assert.equal(bubble.style.left, '1000px') // 1144 - 144 (fake bubble width)
  assert.equal(bubble.style.top, '434px') // 600 - 156 - 10
  assert.equal(bubble.style['--tail-x'], '72px') // pet centre 1072 - left
  assert.equal(bubble.classList.contains('below'), false)

  // Left half: it flips to the pet's left edge instead of drifting away.
  pet._box = { left: 100, top: 300, width: 144, height: 156 }
  await feed(env, WORKING_SESSION)
  assert.equal(bubble.style.left, '100px')
  assert.equal(bubble.style.top, '134px')
  assert.equal(bubble.style['--tail-x'], '72px')
})

test('the bubble drops below the pet when there is no room above', async () => {
  const { env } = applyWidget()
  const shadow = env.body.children[0]._shadow
  const pet = shadow.querySelector('.pet')
  const bubble = shadow.querySelector('.bubble')

  pet._box = { left: 400, top: 40, width: 144, height: 156 }
  await feed(env, { ...WORKING_SESSION, state: 'thinking', activity: '' })
  assert.equal(bubble.classList.contains('below'), true)
  assert.equal(bubble.style.top, '206px') // 40 + 156 + 10
  assert.equal(bubble.style.left, '400px')
})
