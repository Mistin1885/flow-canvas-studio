import type { Graph } from '../api'
import type { DisplayPrefs } from '../display/preferences'
export interface Workbench extends Window {
  T1Playbook: {
    setDisplayPreferences(prefs: DisplayPrefs): void
    receive(graph: Graph, resetHistory?: boolean): void
    saved(): void
    editing(): boolean
    go(id: string, center: boolean): void
  }
}
