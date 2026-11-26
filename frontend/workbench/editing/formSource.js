import { graphModel } from '../graph/model.js'

// The editor can use an older revision while the diagram keeps receiving team updates.
let baseline
export function setFormBaseline(snapshot) { baseline = snapshot }
export function formBaseline() { return baseline }
export function formGraph() { return baseline?.graph ?? graphModel.document }
