# Clipboard Manager

A very simple clipboard manager for Gnome.

## Screenshot
### Default:

<img width="953" height="559" alt="image" src="https://github.com/user-attachments/assets/d693ba7c-1ed9-4e17-82d9-0562c1957715" />

### With [blur my shell](https://github.com/aunetx/blur-my-shell):
<img width="953" height="559" alt="image" src="https://github.com/user-attachments/assets/d4c250f2-a162-446b-bdf0-77a87f5579db" />


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
