const cloneGraph = (value) => JSON.parse(JSON.stringify(value))

function safeData(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export { cloneGraph, safeData }
