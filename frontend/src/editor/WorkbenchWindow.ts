import type { Graph, Snapshot } from '../api'
import type { DisplayPrefs } from '../display/preferences'
export interface Workbench extends Window {
  T1Playbook: {
    configureDrafts(options:{user:string;canvas:string;snapshot:()=>Snapshot|null;restore:(value:Snapshot)=>void}):void
    setCanvasTitle(name: string): void
    setDisplayPreferences(prefs: DisplayPrefs): void
    receive(graph: Graph, resetHistory?: boolean): void
    saved(): void
    editing(): boolean
    go(id: string, center: boolean): void
  }
}
