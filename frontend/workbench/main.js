import './styles/index.css'
import { bindSearch } from './ui/search.js'
import { bindViewport } from './diagram/viewport.js'
import { bindWorkspaceControls } from './display/workspace.js'
import { bindExports } from './io/export.js'
import { bindImportDialog } from './io/importDialog.js'
import { bindNodeForm } from './editing/nodeForm.js'
import { bindNodeActions } from './editing/saveNode.js'
import { bindSourceReview } from './ui/sourceReview.js'
import { exposeStudioApi } from './integration/studio.js'
import { bindDisplayControls } from './display/controls.js'
import { openWorkbench } from './bootstrap.js'

bindSearch()
bindViewport()
bindWorkspaceControls()
bindExports()
bindImportDialog()
bindNodeForm()
bindNodeActions()
bindSourceReview()
openWorkbench()
exposeStudioApi()
bindDisplayControls()
