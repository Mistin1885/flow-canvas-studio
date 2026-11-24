import type { CSSProperties } from 'react'
import type { Graph, NodeData } from '../api'
import { badgeIcons } from '../../workbench/badges/model.js'
import { readableInk } from '../../workbench/appearance/contrast.js'
import '../../workbench/styles/badge-chip.css'

type Style = { color: string; style: 'solid' | 'outline'; icon: keyof typeof badgeIcons }

export function overviewLabel(node: NodeData, graph: Graph) {
  const styles = graph.badgeStyles as Record<string, Style> | undefined
  const placements = Object.entries((node.badges ?? {}) as Record<string, string>)
  if (!placements.length) return { label: node.title, count: 0 }
  const badges = (side: string) => placements.filter(([, pos]) => pos === side).map(([name]) => {
    const style = styles?.[name]
    if (!style) return null
    const colors = { '--badge-color': style.color, '--badge-ink': readableInk(style.color) } as CSSProperties
    return <span key={name} className={'highlight-badge ' + style.style} style={colors} title={name}>
      {badgeIcons[style.icon] && <span aria-hidden="true">{badgeIcons[style.icon]}</span>}
      <span className="badge-name">{name}</span>
    </span>
  })
  return { label: <span className="overviewNodeBadges">{badges('top')}{node.title}{badges('bottom')}</span>,
    count: placements.length }
}
