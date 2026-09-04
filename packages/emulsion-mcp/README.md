# Emulsion MCP

Development-only MCP server for controlling the live TipTap editor in the
Emulsion Wails desktop application and inspecting persisted `drafts.db` data.

## Start Emulsion

```powershell
cd desktop
wails dev -appargs "--automation"
```

For a directly launched binary, pass `--automation` or set
`EMULSION_AUTOMATION=1` in its environment.

The application writes a short-lived connection descriptor to its config
directory. The descriptor contains a random loopback port and bearer token and
is removed when Emulsion exits.

## Build and run the MCP server

```powershell
pnpm --filter @mo-gallery/emulsion-mcp build
node packages/emulsion-mcp/dist/index.js
```

Codex MCP configuration:

```toml
[mcp_servers.emulsion]
command = "node"
args = ["D:/Projects/mo-gallery/mo-gallery-web/packages/emulsion-mcp/dist/index.js"]
```

Automation is enabled only when `--automation` or `EMULSION_AUTOMATION=1` is
explicitly supplied. Release builds never start the endpoint unless an
operator deliberately opts into the local bridge.

## Navigation and document entry

Use the MCP tools below after starting or restarting Emulsion:

```text
app_location {}
app_navigate { menu: "photo-journal" }
editor_open_document {
  documentId: "<story-or-blog-id>",
  documentKind: "story",
  source: "draft"
}
```

`app_location` reads the route currently committed by Emulsion and returns
`path`, `menu`, `search`, and the active TipTap `activeTarget` when one is
registered. Use it to inspect the current page; `app_navigate` only reports the
requested destination.

`editor_open_document.source` accepts `draft` or `database` and defaults to
`draft`. `draft` loads the local editor draft when available, while
`database` opens the cloud/database version and skips local draft restoration.
The command waits for the requested TipTap target to register before it
returns the live editor state.

## TipTap toolbar automation

The toolbar tools exercise the rendered React controls rather than calling
TipTap commands directly:

```text
editor_toolbar_state { documentId, documentKind }
editor_toolbar_click { documentId, documentKind, commandId: "bold" }
editor_toolbar_select { documentId, documentKind, controlId: "fontSize", value: "18px" }
editor_toolbar_color { documentId, documentKind, kind: "textColor", value: "#ef4444" }
```

Use `editor_toolbar_state` to discover the currently available select values.
An empty color value clears that color style.

For list marker inheritance checks, use:

```text
editor_list_metrics { documentId, documentKind }
```

The result includes list depth, list type, `li`/`::marker` font size and font
family, plus each item's rendered text.

Destructive test scenarios should snapshot and restore the draft:

```text
draft_get { key: "story_editor_<id>" }
# Run editor mutations.
draft_restore { key: "story_editor_<id>", data: <draft_get.data> }
```
