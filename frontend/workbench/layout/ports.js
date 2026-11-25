import { simplifyWire } from './polyline.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { diagramState } from '../diagram/state.js'
import { graphModel } from '../graph/model.js'

import { segmentHitsBox } from './routing.js'
import { edgeLabelLines } from './labels.js'

// Preserve the worksheet's entry/exit faces, while docking to the actual card.
// Separate several arrows on one side so their tips and first bends stay visible.
function dockProjectLinks(links, mx, my) {
  const s = diagramState.readingScale,
    sides = new Map()
  function port(i, other, p, adjacent) {
    const b = p && graphModel.nodes[i.id].drawingBox
    let side,
      ratio = 0.5
    if (b) {
      const [x, y, w, h] = b,
        [px, py] = p
      const distances = [Math.abs(px - x), Math.abs(px - x - w), Math.abs(py - y), Math.abs(py - y - h)]
      side = distances.indexOf(Math.min(...distances))
      // Some Excel endpoints terminate just outside a corner. Follow the drawn
      // final leg there so a horizontal arrow still meets a vertical card face.
      if (adjacent && (px < x || px > x + w) && (py < y || py > y + h)) {
        const dx = adjacent[0] - px,
          dy = adjacent[1] - py
        const toward = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : dy < 0 ? 2 : 3
        if (distances[toward] <= distances[side] + 18) side = toward
      }
      ratio = side < 2 ? (py - y) / h : (px - x) / w
    } else {
      const dx = other.x + other.w / 2 - i.x - i.w / 2,
        dy = other.y + other.h / 2 - i.y - i.h / 2
      side = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : dy < 0 ? 2 : 3
    }
    const key = i.key + '|' + side,
      pin = {
        i,
        side,
        ratio: Math.max(0.12, Math.min(0.88, ratio)),
        remote: side < 2 ? other.y + other.h / 2 : other.x + other.w / 2,
      }
    if (!sides.has(key)) sides.set(key, [])
    sides.get(key).push(pin)
    return pin
  }
  for (const l of links) {
    const r = l.edge.drawingRoute,
      raw = mx && r?.from === l.from.id && r?.to === l.to.id ? r.points : null
    l.pins = [port(l.from, l.to, raw?.[0], raw?.[1]), port(l.to, l.from, raw?.at(-1), raw?.at(-2))]
    l.guides = raw ? raw.slice(1, -1).map(([x, y]) => ({ x: mx(x), y: my(y) })) : []
  }
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]
  for (const pins of sides.values()) {
    pins.sort((a, b) => Math.round(a.ratio * 12) - Math.round(b.ratio * 12) || a.remote - b.remote)
    pins.forEach((p, k) => {
      const i = p.i,
        side = p.side,
        u = pins.length === 1 ? p.ratio : 0.14 + (0.72 * k) / (pins.length - 1)
      p.at = { x: i.x + i.w * (side < 2 ? side : u), y: i.y + i.h * (side < 2 ? u : side - 2) }
      const [dx, dy] = directions[side]
      p.stub = { x: p.at.x + dx * 14 * s, y: p.at.y + dy * 14 * s }
    })
  }
  const boxes = diagramState.instances.filter(
    (i) => i.scope === 'project' && !isFrameNode(graphModel.nodes[i.id]),
  )
  const used = []
  for (const l of links) {
    const [source, target] = l.pins,
      a = source.stub,
      b = target.stub
    const middleX = (a.x + b.x) / 2,
      middleY = (a.y + b.y) / 2
    const xTracks = new Set([
      middleX,
      middleX - 16 * s,
      middleX + 16 * s,
      a.x,
      b.x,
      ...l.guides.map((p) => p.x),
    ])
    const yTracks = new Set([
      middleY,
      middleY - 16 * s,
      middleY + 16 * s,
      a.y,
      b.y,
      ...l.guides.map((p) => p.y),
    ])
    const candidates = []
    for (const x of xTracks) candidates.push([a, { x, y: a.y }, { x, y: b.y }, b])
    for (const y of yTracks) candidates.push([a, { x: a.x, y }, { x: b.x, y }, b])
    if (l.guides.length) {
      const g = l.guides,
        first = g[0],
        last = g.at(-1)
      candidates.push([
        a,
        source.side < 2 ? { x: first.x, y: a.y } : { x: a.x, y: first.y },
        ...g,
        target.side < 2 ? { x: last.x, y: b.y } : { x: b.x, y: last.y },
        b,
      ])
    }
    // A self-loop without drawing coordinates still needs two distinct faces.
    if (l.from === l.to) {
      const i = l.from
      candidates.push([
        a,
        { x: i.x + i.w + 28 * s, y: a.y },
        { x: i.x + i.w + 28 * s, y: i.y + i.h + 30 * s },
        { x: b.x, y: i.y + i.h + 30 * s },
        b,
      ])
    }
    let best = null,
      bestScore = Infinity
    for (const candidate of candidates) {
      const ps = simplifyWire([source.at, ...candidate, target.at])
      let score = 0
      for (let k = 1; k < ps.length; k++) {
        const u = ps[k - 1],
          v = ps[k],
          left = Math.min(u.x, v.x),
          right = Math.max(u.x, v.x),
          top = Math.min(u.y, v.y),
          bottom = Math.max(u.y, v.y)
        score += Math.hypot(v.x - u.x, v.y - u.y) + 8 * s
        for (const i of boxes) {
          const pad = i === l.from || i === l.to ? -0.2 : 10 * s
          if (
            left >= i.x + i.w + pad ||
            right <= i.x - pad ||
            top >= i.y + i.h + pad ||
            bottom <= i.y - pad
          )
            continue
          if (segmentHitsBox(u, v, { x: i.x - pad, y: i.y - pad, w: i.w + 2 * pad, h: i.h + 2 * pad }))
            score += 1e6
        }
        // Penalize long parallel runs sharing the same narrow corridor.
        for (const e of used) {
          if (bottom === top && e.top === e.bottom && Math.abs(top - e.top) < 8 * s)
            score += 3 * Math.max(0, Math.min(right, e.right) - Math.max(left, e.left))
          if (left === right && e.left === e.right && Math.abs(left - e.left) < 8 * s)
            score += 3 * Math.max(0, Math.min(bottom, e.bottom) - Math.max(top, e.top))
        }
      }
      if (score < bestScore) {
        best = ps
        bestScore = score
      }
    }
    l.points = best
    for (let k = 1; k < best.length; k++) {
      const a = best[k - 1],
        b = best[k]
      used.push({
        left: Math.min(a.x, b.x),
        right: Math.max(a.x, b.x),
        top: Math.min(a.y, b.y),
        bottom: Math.max(a.y, b.y),
      })
    }
    l.lines = edgeLabelLines(l.edge.label || '', 185)
    l.labelHeight = l.lines.length ? (18 * l.lines.length + 10) * s : 0
  }
}

export { dockProjectLinks, simplifyWire }
