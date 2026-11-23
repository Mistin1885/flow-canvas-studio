import { $ } from '../ui/dom.js'
import { adaptDfxDraft } from './dfx.js'

const initial = JSON.parse($('playbook-data').textContent)
export const graphModel = {
  document: initial.schema ? adaptDfxDraft(initial) : initial,
  get nodes() {
    return this.document.nodes
  },
  get edges() {
    return this.document.edges
  },
}
export const groupNames = {}

// Index outgoing edges whenever a complete graph arrives from import, undo or a peer.
export const outgoing = new Map()

export function setGraphDocument(document) {
  graphModel.document = document
  outgoing.clear()
  for (const edge of document.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, [])
    outgoing.get(edge.from).push(edge)
  }
}
setGraphDocument(graphModel.document)
