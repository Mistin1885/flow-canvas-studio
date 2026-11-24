import { $, el, svg } from '../ui/dom.js'
import { graphModel } from '../graph/model.js'
import { go } from '../diagram/navigation.js'

function steps(nodes, edges) {
  const children = new Map(nodes.map(node => [node.id, []]))
  for (const edge of edges) {
    if (edge.kind === 'next' && children.has(edge.to)) children.get(edge.from)?.push(edge.to)
  }

  // Reverse finishing order puts every predecessor before its join on acyclic paths.
  const visited = new Set()
  const ordered = []
  for (const { id } of nodes) {
    if (visited.has(id)) continue
    const stack = [{ id, index: 0 }]
    visited.add(id)
    while (stack.length) {
      const current = stack[stack.length - 1]
      const next = children.get(current.id)
      if (current.index === next.length) {
        ordered.push(stack.pop().id)
      } else {
        const child = next[current.index++]
        if (!visited.has(child)) {
          visited.add(child)
          stack.push({ id: child, index: 0 })
        }
      }
    }
  }

  const depth = new Map(nodes.map(node => [node.id, 0]))
  const placed = new Set()
  for (const id of ordered.reverse()) {
    placed.add(id)
    for (const child of children.get(id)) {
      if (!placed.has(child)) depth.set(child, Math.max(depth.get(child), depth.get(id) + 1))
    }
  }
  return depth
}

export function bindLanes() {
  const dialog = $('lanes-dialog'), board = $('lane-board')
  let observer
  $('lanes-close').onclick = () => dialog.close()
  dialog.addEventListener('close', () => observer?.disconnect())
  $('show-lanes').onclick = () => {
    board.replaceChildren()
    dialog.showModal()
    const nodes = Object.values(graphModel.nodes), edges = graphModel.edges
    if (!nodes.length) {board.append(el('p','','新增節點並指定負責角色/負責人後，即可在此查看流程。'));return}
    const depths = steps(nodes,edges), buttons = new Map()
    const roles = [...new Set(nodes.map(n=>n.ownerRole || '未指定角色'))]
    for (const [r,role] of roles.entries()) {
      const label=el('strong','lane-label',role)
      label.style.gridArea=(r+1)+' / 1'; board.append(label)
      const cells = new Map()
      for (const n of nodes.filter(n=>(n.ownerRole || '未指定角色')===role)) {
        const col = depths.get(n.id)+2
        if (!cells.has(col)) {
          const cell=el('div','lane-cell')
          cell.style.gridArea=(r+1)+' / '+col; board.append(cell); cells.set(col,cell)
        }
        const btn=el('button','lane-node',n.title)
        btn.type='button'
        btn.append(el('small','',n.group))
        btn.onclick=()=>{dialog.close();go(n.id,true)}
        cells.get(col).append(btn); buttons.set(n.id,btn)
      }
    }
    const wires=svg('svg',{'aria-hidden':'true',class:'lane-wires'})
    board.prepend(wires)
    function draw() {
      wires.replaceChildren()
      const defs=svg('defs'), marker=svg('marker',{id:'lane-arrow',viewBox:'0 0 8 8',refX:8,refY:4,markerWidth:6,markerHeight:6,orient:'auto'})
      marker.append(svg('path',{d:'M0 0 L8 4 L0 8',fill:'currentColor'}));defs.append(marker);wires.append(defs)
      const origin=board.getBoundingClientRect()
      for(const e of edges) {
        const a=buttons.get(e.from)?.getBoundingClientRect(), b=buttons.get(e.to)?.getBoundingClientRect()
        if(!a || !b) continue
        const x=a.right-origin.left,y=a.top+a.height/2-origin.top
        const tx=b.left-origin.left,ty=b.top+b.height/2-origin.top
        const path = svg('path',{d:'M'+x+' '+y+' C'+(x+30)+' '+y+' '+(tx-30)+' '+ty+' '+tx+' '+ty,fill:'none',stroke:'currentColor','marker-end':'url(#lane-arrow)'})
        if(e.kind==='return'||e.kind==='retry') path.setAttribute('stroke-dasharray','4 3')
        wires.append(path)
      }
    }
    draw()
    if (typeof ResizeObserver !== 'undefined') {
      observer?.disconnect();observer=new ResizeObserver(draw);observer.observe(board)
    }
  }
}
