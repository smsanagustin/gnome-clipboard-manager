# Clipboard Manager

Clipboard manager for Gnome.

## How to install

### Manually

```sh
git clone <this repo>
cd gnome-clipboard-manager
./install.sh
```

<kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>V</kbd> opens the clipboard manager in a popup. This keybind can be changed from the extension settings.

## Uninstall

```sh
gnome-extensions uninstall clipboard-manager@smsanagustin.github.io
```

## Usage

- Type to search, <kbd>↑</kbd>/<kbd>↓</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd>/<kbd>J</kbd> to move, <kbd>Esc</kbd> to close the popup

## Features
- Both text and images are stored in the history, up to 100 items.
- Skips text copied from password managers.
- History is stored in `~/.cache/clipboard-manager@smsanagustin.github.io`.

## Settings

- Custom keybind
- Popup size (width and height)
- Top bar icon, for opening the popup with a click
