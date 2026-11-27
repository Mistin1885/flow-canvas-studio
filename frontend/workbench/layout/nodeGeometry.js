export const sizeLimits = { minWidth: 80, minHeight: 48, max: 1000000 }

export function validNodeSize(size) {
  return !!size && typeof size === 'object' && !Array.isArray(size) &&
    Number.isFinite(size.width) && Number.isFinite(size.height) &&
    size.width >= sizeLimits.minWidth && size.height >= sizeLimits.minHeight &&
    size.width <= sizeLimits.max && size.height <= sizeLimits.max
}

// Coordinates here are rendered canvas units; store dimensions without reading/zoom scaling.
export function resizedBounds(box, corner, dx, dy, scale = 1) {
  const west = corner.includes('w'), north = corner.includes('n')
  const w = Math.max(sizeLimits.minWidth * scale, Math.min(sizeLimits.max * scale, box.w + (west ? -dx : dx)))
  const h = Math.max(sizeLimits.minHeight * scale, Math.min(sizeLimits.max * scale, box.h + (north ? -dy : dy)))
  return { x: box.x + (west ? box.w - w : 0), y: box.y + (north ? box.h - h : 0), w, h }
}

export function enclosingBounds(items, scale = 1, margin = 24) {
  if (!items.length) throw Error('請先選取節點。')
  const boxes = items.map(i => i.inlineFlow || i), pad = margin * scale, header = 36 * scale
  const x = Math.min(...boxes.map(i => i.x)) - pad
  const y = Math.min(...boxes.map(i => i.y - (i.badgeTop || 0))) - pad - header
  return { x, y,
    w: Math.max(160 * scale, Math.max(...boxes.map(i => i.x + i.w)) + pad - x),
    h: Math.max(100 * scale, Math.max(...boxes.map(i => i.y + i.h + (i.badgeBottom || 0))) + pad - y) }
}
