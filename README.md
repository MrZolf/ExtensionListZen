# Extensions List for Zen Browser

Sine mod that changes the unified extensions panel into a consistent vertical list, adds extension names, and keeps the panel scrollable.

## Features

- Displays extension items in a vertical list in both Zen extension groups.
- Reads the actual extension name through Firefox's `AddonManager` API.
- Uses the extension ID already present on Zen's native extension item.
- Keeps native extension action buttons and menu buttons in place.
- Adds a name label without rebuilding or moving native toolbar items.
- Watches the browser UI for dynamically inserted extension items.
- Limits the panel body height and enables vertical scrolling.
- Does not use external libraries, network requests, or third-party scripts.

## Requirements

- Zen Browser
- Sine
- Sine setting **Allow installing JS from unofficial sources** enabled

JavaScript mods run in the browser's privileged UI context. Install this mod only if you trust its source and have reviewed its code.

## Installation

1. Extract the ZIP.
2. In Zen, open **Settings → Sine Mods**.
3. Enable **Allow installing JS from unofficial sources** (the wording may vary by Sine version).
4. Install the mod using Sine's local/import option if available, or place the mod folder in the Sine mods directory according to your installed Sine version.
5. Restart Zen Browser.
6. Open the unified extensions panel and check both the upper and lower extension groups.

If your Sine version only installs mods from a URL, put this folder in a Git repository and install the repository URL through Sine.

## Project files

- `theme.json` - Sine metadata and script registration.
- `extensions-list.uc.js` - privileged browser-chrome script. Resolves extension names and adds labels.
- `userChrome.css` - list layout, row styling, and scroll behavior.
- `README.md` - this guide.

## Troubleshooting

### Names do not appear

Open Browser Toolbox → Console and look for messages prefixed with `[extensions-list-sine]`.

The script uses the `extension-id` attribute on each native `toolbaritem.unified-extensions-item` and resolves the name through `AddonManager.getAddonByID()`.

### Script does not run

Check that:
- JavaScript mods from unofficial sources are enabled in Sine.
- The script is listed in `theme.json`.
- The script file name matches the key under `scripts`.
- Zen has been fully restarted after installation.

### Panel still clips

The CSS makes `#zen-site-data-addons` the bounded scroll region (`max-height: 70vh; overflow-y: auto`). If your Zen build uses a different wrapper for the panel body, inspect that element in Browser Toolbox and adjust the selector in `userChrome.css`.

## Compatibility note

The mod targets the DOM structure observed in the user's Zen Browser panel:
- `#zen-site-data-addons`
- `#unified-extensions-area`
- `#overflowed-extensions-list`
- `.unified-extensions-list`
- `toolbaritem.unified-extensions-item`
- `extension-id`

Zen changes its internal browser UI between releases. If these selectors or the extension ID attribute change, the mod may need an update.

## Uninstall

Disable or remove **Extensions List** in Sine and restart Zen. The mod does not alter extension settings or persistent browser data.
