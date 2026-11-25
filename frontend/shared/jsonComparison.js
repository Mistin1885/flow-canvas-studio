// Compare JSON records without allocating a pair of sorted strings for every
// node during a save. Object key order is immaterial; array order is meaningful.
export function equalJson(left, right) {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((item, index) => equalJson(item, right[index]))
  }
  // Optional fields set to undefined are omitted when serialized as JSON.
  const keys = Object.keys(left).filter(key => left[key] !== undefined)
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length &&
    keys.every(key => Object.hasOwn(right, key) && equalJson(left[key], right[key]))
}

// Preserve the existing sha256-v1 export format and stable conflict tokens.
export function signature(value) {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item,
  ) ?? 'undefined'
}
