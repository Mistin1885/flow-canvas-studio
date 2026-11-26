import type { Graph, Snapshot } from '../api'
import type { DisplayPrefs } from '../display/preferences'
export interface Workbench extends Window {
  T1Playbook: {
    configureDrafts(options:{user:string;canvas:string;snapshot:()=>Snapshot|null}):void
    setCanvasTitle(name: string): void
    setDisplayPreferences(prefs: DisplayPrefs): void
    receive(graph: Graph, resetHistory?: boolean): void
    refreshTeamForm(): void
    saved(): void
    editing(allowNodeForm?: boolean): boolean
    go(id: string, center: boolean): void
  }
}
