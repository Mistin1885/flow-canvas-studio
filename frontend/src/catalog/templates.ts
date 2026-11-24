import type { Graph, NodeData } from '../api'

type Step = [string, string, string, string?]
type Path = [string, string, string?, boolean?]
type Template = { name: string; steps: Step[]; paths: Path[] }
export const templates: Template[] = [
  {name:'審批與退回', steps:[['submit','提交申請','申請人'],['review','審查申請','審查人'],['accept','完成核准','申請人']],
    paths:[['submit','review'],['review','submit','補件',true],['review','accept','核准']]},
  {name:'平行審閱與匯合', steps:[['start','分派審閱','協調人','split-all'],['first','內容審閱','編輯'],['second','格式審閱','校對'],['join','彙整意見','協調人','join-all']],
    paths:[['start','first'],['start','second'],['first','join'],['second','join']]},
  {name:'檢查與重工', steps:[['check','檢查項目','檢查人'],['fix','處理異常','執行人'],['done','完成驗收','檢查人']],
    paths:[['check','fix','需調整'],['fix','check','重新檢查',true],['check','done','通過']]},
]
export function templateGraph(index: string, title: string): Graph | undefined {
  if (!index) return
  const template = templates[Number(index)]
  const nodes: Record<string,NodeData> = {}
  for (const [id,name,role,rule] of template.steps) {
    const decision = !rule && template.paths.filter(([from])=>from===id).length > 1
    nodes[id] = {id,title:name,group:'主要流程',ownerRole:role,decision,content:[],...(rule ? {gatewayRule:rule} : {})}
  }
  return {schemaVersion:1,documentType:'dfx-project-flow',title,nodes,navigation:[template.steps[0][0]],subflows:[],
    edges:template.paths.map(([from,to,label='',back])=>({from,to,label,kind:back?'return':'next'}))}
}
