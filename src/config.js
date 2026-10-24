/**
 * Config helpers for dsh-pet-astra-yao.
 *
 * Kept free of `@deepseek-ai/schemastery` on purpose: the host plugin imports
 * these from tests and from the HTTP layer, and neither needs the schema
 * runtime. The schema itself lives in `src/index.js`.
 */

/** Fields a client may change through the config endpoint. */
export const CONFIG_PATCH_FIELDS = Object.freeze([
  'enabled',
  'scale',
  'opacity',
  'speed',
  'mirror',
  'locked',
  'hidden',
  'paused',
  'showBubble',
  'showBubbleUsage',
  'showBalanceBar',
  'lookAtPointer',
  'includeSubagents',
  'posX',
  'posY',
])

export const defaults = Object.freeze({
  enabled: true,
  scale: 1,
  opacity: 1,
  speed: 1,
  mirror: false,
  locked: false,
  hidden: false,
  paused: false,
  showBubble: true,
  showBubbleUsage: false,
  showBalanceBar: true,
  lookAtPointer: true,
  includeSubagents: false,
  posX: null,
  posY: null,
})

export const LIMITS = Object.freeze({
  scale: Object.freeze({ min: 0.5, max: 2 }),
  opacity: Object.freeze({ min: 0.3, max: 1 }),
  speed: Object.freeze({ min: 0.5, max: 1.6 }),
})

export function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

export function readNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : null
}

/**
 * Unwrap values that DSH hands back as cosmokit volatile wrappers (`.get()`),
 * then fill defaults field by field.
 */
export function readConfig(config = {}) {
  const value = {}
  for (const key of Object.keys(defaults)) {
    const current = config?.[key]
    const raw = current && typeof current.get === 'function' ? current.get() : current
    value[key] = raw ?? defaults[key]
  }
  return value
}

/** Clamp and coerce a resolved config into the shape sent to the browser. */
export function normalizeConfig(input = {}) {
  const value = readConfig(input)
  return {
    enabled: value.enabled !== false,
    scale: clampNumber(value.scale, LIMITS.scale.min, LIMITS.scale.max, defaults.scale),
    opacity: clampNumber(value.opacity, LIMITS.opacity.min, LIMITS.opacity.max, defaults.opacity),
    speed: clampNumber(value.speed, LIMITS.speed.min, LIMITS.speed.max, defaults.speed),
    mirror: Boolean(value.mirror),
    locked: Boolean(value.locked),
    hidden: Boolean(value.hidden),
    paused: Boolean(value.paused),
    showBubble: value.showBubble !== false,
    showBubbleUsage: Boolean(value.showBubbleUsage),
    showBalanceBar: value.showBalanceBar !== false,
    lookAtPointer: value.lookAtPointer !== false,
    includeSubagents: Boolean(value.includeSubagents),
    posX: readNullableNumber(value.posX),
    posY: readNullableNumber(value.posY),
  }
}

/** Apply a validated patch on top of the current config. */
export function applyPatch(current, patch) {
  const next = normalizeConfig(current)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('config patch must be an object')
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!CONFIG_PATCH_FIELDS.includes(key)) throw new Error(`unknown config field: ${key}`)
    switch (key) {
      case 'scale':
        next.scale = clampNumber(value, LIMITS.scale.min, LIMITS.scale.max, next.scale)
        break
      case 'opacity':
        next.opacity = clampNumber(value, LIMITS.opacity.min, LIMITS.opacity.max, next.opacity)
        break
      case 'speed':
        next.speed = clampNumber(value, LIMITS.speed.min, LIMITS.speed.max, next.speed)
        break
      case 'posX':
      case 'posY':
        next[key] = readNullableNumber(value)
        break
      default:
        next[key] = Boolean(value)
    }
  }
  return next
}
