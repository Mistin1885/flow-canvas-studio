// Use the same grid for the background, the drag preview and the release event.
// At overview zoom, display and snap to whole multiples of the underlying grid.
export function gridStep(readingScale, zoom) {
  const unit = 20 * readingScale
  return unit * Math.max(1, Math.ceil(3 / (unit * zoom)))
}

export function snapDrag(item, dx, dy, readingScale, zoom) {
  const step = gridStep(readingScale, zoom)
  return {
    x: Math.round((item.x + dx / zoom) / step) * step,
    y: Math.round((item.y + dy / zoom) / step) * step,
  }
}

export function overlapsAt(item, target, other) {
  const box = item.inlineFlow || item, obstacle = other.inlineFlow || other
  const x = box.x + target.x - item.x, y = box.y + target.y - item.y
  return x < obstacle.x + obstacle.w && x + box.w > obstacle.x &&
    y < obstacle.y + obstacle.h && y + box.h > obstacle.y
}

// Snap the grabbed card once and apply that displacement to every selected card.
// Independent rounding would change the spacing of imported, off-grid nodes.
export function snappedDisplacement(anchor, dx, dy, readingScale, zoom) {
  const pos = snapDrag(anchor, dx, dy, readingScale, zoom)
  return { x: pos.x - anchor.x, y: pos.y - anchor.y }
}

export function dropPositions(roots, delta, obstacles, isFrame) {
  const positions = roots.map(item => ({ item, x: item.x + delta.x, y: item.y + delta.y }))
  for (const pos of positions) {
    if (!isFrame(pos.item) && obstacles.some(other =>
      other.scope === pos.item.scope && overlapsAt(pos.item, pos, other))) return null
  }
  return positions
}
