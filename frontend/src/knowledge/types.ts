import type { Workspace } from '../api'
export type Section = { id: string; title: string; body: string }
export type Article = { title: string; summary: string; sections: Section[]; source?: string }
export type Usage = {
  canvas: string
  name: string
  workspace: string
  pinned: boolean
  nodes: Workspace[]
}
export type Entry = {
  id: string
  doc: Article
  scope: 'canvas' | 'workspace' | 'shared'
  owner: string
  local: string | null
  version: number
  localVersion?: number
  actions: ('edit' | 'share')[]
  shares: string[]
  uses: Usage[]
}
export type Library = { entries: Entry[]; spaces: Workspace[]; pins: string[]; pinVersion: number | null }
export type Picker = {
  label: string
  pending: Record<string, Article>
  insert: (id: string, doc: Article, label: string, section: string) => void
}
export const newKey = () => crypto.randomUUID().replaceAll('-', '')
export function scopeLabel(entry: Entry, spaces: Workspace[]) {
  if (entry.scope === 'shared')
    return '來自 ' + (spaces.find((s) => s.id === entry.owner)?.name || '其他工作區')
  return entry.scope === 'canvas' ? '此畫布專用' : '工作區共用'
}
