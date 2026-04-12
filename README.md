# WTP RSP UI

`WTP RSP UI` is the Visual Studio Code front end for the WTP-RSP toolchain. It provides the Servers view, server and deployment commands, output integration, and the client-side workflow for interacting with WTP-RSP providers.

This extension is the UI layer only. It does not manage any concrete server runtime by itself.

## What this extension does

- Adds the `WTP Servers` view to VS Code
- Connects to one or more RSP providers
- Lists servers, modules, deployments, and server actions
- Starts, stops, restarts, debugs, and publishes servers
- Shows server output streams in VS Code output channels
- Integrates with JDT LS for runtime and classpath container synchronization

## Not a standalone extension

This extension needs at least one RSP provider or connector extension. In this workspace, the intended companion is:

- `WTP RSP Server Connector`

Without a connector, the UI will load, but it will not have any provider to start or connect to.

## Main commands

The extension contributes the following commands through the Command Palette and the `WTP Servers` view:

- `Create New Server...`
- `Add Local Server...`
- `Download Server...`
- `Start / Connect to RSP Provider`
- `Disconnect from RSP Provider`
- `Stop RSP Provider`
- `Terminate RSP Provider`
- `Start Server`
- `Debug Server`
- `Stop Server`
- `Terminate Server`
- `Restart in Run Mode`
- `Restart in Debug Mode`
- `Add Deployment`
- `Remove Deployment`
- `Start Module`
- `Stop Module`
- `Publish Server (Incremental)`
- `Publish Server (Full)`
- `Publish Server (Clean)`
- `Server Actions...`
- `Edit Server`
- `Sync Java Runtime`
- `Deployment Assembly`
- `Run on Server`
- `Debug on Server`

## Settings

The extension currently contributes these settings:

- `wtp-rsp-ui.rsp.java.home`
  Path to the JDK used to launch the RSP server and, by default, Java-based runtimes managed through it.
- `wtp-rsp-ui.connectors.showChannelOnServerOutput`
  Whether server output channels should be shown when new output arrives.
- `wtp-rsp-ui.newServerWebviewWorkflow`
  Whether the new server flow should use webviews instead of prompt-by-prompt input.
- `wtp-rsp-ui.enableAsyncPublish`
  Enables asynchronous publish requests from the UI.
- `wtp-rsp-ui.enableStartServerOnActivation`
  Declares which configured RSP providers should be started automatically when the extension activates.

## Typical workflow

1. Install `WTP RSP UI` and a compatible connector.
2. Start or connect to an RSP provider.
3. Create a new server or add an existing runtime location.
4. Add a deployment to the server.
5. Start, debug, or publish the server from the `WTP Servers` view.

## Related projects

- `rsp-wtp-server`: Eclipse/WTP-based RSP server implementation
- `rsp-wtp-server-connector`: VS Code connector that launches and packages the server
- `rsp-wtp-client`: generated protocol client used by the UI
- `jdtls-jrecontainer-plugin`: JDT LS companion plugin used for Java runtime and classpath container synchronization

## Fork origin

This project started as a fork of the original Red Hat `vscode-rsp-ui` project:

- https://github.com/redhat-developer/vscode-rsp-ui

This fork adapts that UI foundation for the WTP-RSP toolchain. Current development, packaging, and support happen in this repository and its companion projects.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

EPL 2.0. See [LICENSE](LICENSE).
