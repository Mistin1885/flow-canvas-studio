import { readGraph } from './readGraph.js'
import { normalizedLegend } from '../categories/model.js'
import { cloneGraph } from './json.js'

export function validateGraph(value) {
  return normalizedLegend(cloneGraph(readGraph(value)))
}
