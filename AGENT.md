# Flow Workspace

Flow Workspace is a self-hosted flowchart editor for a team of about five people working across multiple canvases. Each canvas defines its own workflows, groups, and categories. DFx and Debug Playbook can serve as example datasets.

## Development Environment

- Build the frontend with React, TypeScript, Vite, and React Flow. Use elkjs for automatic layout when needed.
- Build the backend with Python, FastAPI, and WebSocket connections. Enable write-ahead logging (WAL) in SQLite and store the database on the server's local disk.

## Editing and Collaboration

- Keep node IDs unique within each canvas. Both endpoints of an edge must belong to that canvas. When deleting a node, delete all connected edges in the same transaction.
- Use groups to organize workflows and set their layout direction, such as top-down (TD) or left-to-right (LR). Use categories to label and filter items. Read group and category definitions from the canvas data.
- Save changes per node or edge. The backend must check the version before writing and broadcast changes to clients on the same canvas only after the transaction commits. Preserve the user's draft if a version conflict occurs.
- Keep JSON import and export compatible with the existing workflow format. When changing the format, import an existing example, export it again, and verify that its nodes, edges, and custom fields survive the round trip.

## Verification

Run the project's configured type checks, builds, or tests that apply to the change. When changing collaboration logic, use two browser sessions on the same canvas to verify that edits sync and that conflicting edits to the same node preserve the user's draft.

## Commits and public repository contents

- Write every commit subject and body in English. Use Conventional Commits: `type(scope): summary` or `type: summary`, for example `feat: add canvas duplication` or `fix(sync): preserve conflicting edits`.
- Commit application source, dependency manifests and lockfiles, documentation, and tests using synthetic data. Keep real workspace and canvas data outside the repository, including database snapshots, backups, exports, embedded graph payloads, and private source material. Keep credentials and machine-specific configuration local.
- Before committing, review the staged paths and contents. The shipped workbench template must contain an empty graph.
