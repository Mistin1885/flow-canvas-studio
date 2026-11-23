import { useEffect, useState } from 'react'
import { ReactFlow, Controls, Background, Position, type Node } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import '@xyflow/react/dist/style.css'
import { edgeKey, errorText, type Graph } from '../api'

import { readingScales, type DisplayPrefs } from '../display/preferences'
export default function Overview({
  graph,
  locate,
  prefs,
}: {
  graph: Graph
  prefs: DisplayPrefs
  locate: (id: string) => void
}) {
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [error, setError] = useState('')
  const scale = readingScales[prefs.reading]
  useEffect(() => {
    let active = true
    const layout = new ELK()
    const children = Object.values(graph.nodes).map((n) => ({
      id: n.id,
      width: 190 * scale,
      height: 64 * scale,
    }))
    const edges = graph.edges.map((e) => ({ id: edgeKey(e), sources: [e.from], targets: [e.to] }))
    layout
      .layout({
        id: '$canvas',
        layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
        children,
        edges,
      })
      .then((result) => {
        if (active)
          setNodes(
            (result.children || []).map((n) => ({
              id: n.id,
              sourcePosition: Position.Right,
              targetPosition: Position.Left,
              position: { x: n.x || 0, y: n.y || 0 },
              data: { label: graph.nodes[n.id].title },
              style: { width: 190 * scale, minHeight: 56 * scale, fontSize: 12 * scale, borderRadius: 8 },
            })),
          )
      })
      .catch((e) => active && setError(errorText(e)))
    return () => {
      active = false
    }
  }, [graph, scale])
  if (error) return <p role="alert">{error}</p>
  if (!nodes) return <p>正在排列節點…</p>
  if (!nodes.length) return <p>新增節點後即可查看全圖。</p>
  return (
    <ReactFlow
      colorMode={prefs.theme}
      nodes={nodes}
      edges={graph.edges.map((e) => ({ id: edgeKey(e), source: e.from, target: e.to, label: e.label }))}
      fitView
      minZoom={0.02}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, node) => locate(node.id)}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
