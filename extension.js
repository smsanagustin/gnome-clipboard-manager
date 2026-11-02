import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'load_bytes_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const SHORTCUT = 'toggle-clipboard-manager';
const CLIPBOARD = St.ClipboardType.CLIPBOARD;
const MAX_ITEMS = 100;
const PREVIEW_LENGTH = 5000;
const TERMINALS = /term|console|kitty|alacritty|foot|ghostty|wezterm|ptyxis/i;

export default class ClipboardManager extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._history = [];
        this._matches = [];
        this._dir = GLib.build_filenamev([GLib.get_user_cache_dir(), this.uuid]);
        GLib.mkdir_with_parents(this._dir, 0o700);
        this._file = Gio.File.new_for_path(GLib.build_filenamev([this._dir, 'history.json']));
        this._cancellable = new Gio.Cancellable();
        this._load();
        this._keyboard = global.stage.context.get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

        this._entry = new St.Entry({
            style_class: 'search-entry',
            hint_text: 'Search clipboard…',
            primary_icon: new St.Icon({style_class: 'search-entry-icon', icon_name: 'edit-find-symbolic'}),
        });
        this._entry.clutter_text.connectObject('text-changed', () => this._render(), this);

        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        this._scroll = new St.ScrollView({
            style_class: 'clipboard-manager-card',
            hscrollbar_policy: St.PolicyType.NEVER,
            x_expand: true,
            child: this._list,
        });

        this._text = new St.Label({style_class: 'clipboard-manager-text'});
        this._text.clutter_text.set({
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            ellipsize: Pango.EllipsizeMode.NONE,
        });
        this._image = new St.Widget({style_class: 'clipboard-manager-image', x_expand: true, y_expand: true});
        const preview = new St.Widget({
            style_class: 'clipboard-manager-card',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
        });
        const textBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        textBox.add_child(this._text);
        preview.add_child(new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            x_expand: true,
            y_expand: true,
            child: textBox,
        }));
        preview.add_child(this._image);

        const columns = new St.BoxLayout({style_class: 'clipboard-manager-columns', y_expand: true});
        columns.layout_manager.homogeneous = true;
        columns.add_child(this._scroll);
        columns.add_child(preview);

        this._box = new St.BoxLayout({
            style_class: 'popup-menu-content clipboard-manager',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
        });
        this._box.add_child(this._entry);
        this._box.add_child(columns);
        this._backdrop = new St.Widget({reactive: true, visible: false});
        this._backdrop.add_child(this._box);
        this._backdrop.connectObject(
            'button-press-event', (_actor, event) => {
                if (!this._box.contains(global.stage.get_event_actor(event)))
                    this._close();
            },
            'captured-event', (_actor, event) => this._onKeyPress(event),
            this);
        Main.layoutManager.addTopChrome(this._backdrop);

        global.display.get_selection().connectObject('owner-changed', (_selection, type) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD)
                this._capture();
        }, this);

        Main.wm.addKeybinding(SHORTCUT, this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP,
            () => this._toggle());
        Main.overview.connectObject('showing', () => this._close(), this);
        this._settings.connectObject('changed::show-indicator', () => this._syncIndicator(), this);
        this._syncIndicator();
    }

    disable() {
        this._close();
        this._cancellable.cancel();
        Main.wm.removeKeybinding(SHORTCUT);
        Main.overview.disconnectObject(this);
        global.display.get_selection().disconnectObject(this);
        this._settings.disconnectObject(this);
        this._indicator?.destroy();
        this._backdrop.destroy();
        this._indicator = this._backdrop = this._box = this._entry = this._scroll = this._list = null;
        this._text = this._image = this._file = this._keyboard = this._settings = this._cancellable = this._history = this._matches = null;
    }

    _syncIndicator() {
        this._indicator?.destroy();
        this._indicator = null;
        if (!this._settings.get_boolean('show-indicator'))
            return;
        this._indicator = new PanelMenu.Button(0, this.metadata.name, true);
        this._indicator.add_child(new St.Icon({icon_name: 'edit-paste-symbolic', style_class: 'system-status-icon'}));
        const click = new Clutter.ClickGesture();
        click.connect('recognize', () => this._toggle());
        this._indicator.add_action(click);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    _imageFile(image) {
        return Gio.File.new_for_path(GLib.build_filenamev([this._dir, `${image}.png`]));
    }

    async _load() {
        try {
            const [contents] = await this._file.load_contents_async(this._cancellable);
            this._history.push(...JSON.parse(new TextDecoder().decode(contents)));
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND) &&
                !e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e);
        }
    }

    _save() {
        const bytes = new GLib.Bytes(new TextEncoder().encode(JSON.stringify(this._history)));
        this._file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.PRIVATE, null).catch(logError);
    }

    _capture() {
        const mimetypes = global.display.get_selection().get_mimetypes(Meta.SelectionType.SELECTION_CLIPBOARD);
        if (mimetypes.includes('x-kde-passwordManagerHint'))
            return;
        const clipboard = St.Clipboard.get_default();
        clipboard.get_text(CLIPBOARD, (_clipboard, text) => {
            if (text?.trim()) {
                this._add({text});
            } else if (mimetypes.includes('image/png')) {
                clipboard.get_content(CLIPBOARD, 'image/png', (_c, bytes) => {
                    if (!bytes?.get_size())
                        return;
                    const image = GLib.compute_checksum_for_bytes(GLib.ChecksumType.MD5, bytes);
                    this._imageFile(image).replace_contents_bytes_async(bytes, null, false,
                        Gio.FileCreateFlags.PRIVATE, null).catch(logError);
                    this._add({image});
                });
            }
        });
    }

    _add(item) {
        if (!this._history)
            return;
        this._history = [item, ...this._history.filter(i => i.text !== item.text || i.image !== item.image)];
        for (const {image} of this._history.splice(MAX_ITEMS)) {
            if (image)
                GLib.unlink(this._imageFile(image).get_path());
        }
        this._save();
    }

    _copy(item) {
        this._close();
        const clipboard = St.Clipboard.get_default();
        if (item?.image) {
            this._imageFile(item.image).load_bytes_async(null)
                .then(([bytes]) => {
                    clipboard.set_content(CLIPBOARD, 'image/png', bytes);
                    this._paste();
                })
                .catch(logError);
        } else if (item) {
            clipboard.set_text(CLIPBOARD, item.text);
            this._paste();
        }
    }

    _paste() {
        const wmClass = global.display.focus_window?.get_wm_class();
        if (!wmClass || !this._keyboard)
            return;
        const keys = TERMINALS.test(wmClass)
            ? [Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_v]
            : [Clutter.KEY_Control_L, Clutter.KEY_v];
        const time = GLib.get_monotonic_time();
        for (const key of keys)
            this._keyboard.notify_keyval(time, key, Clutter.KeyState.PRESSED);
        for (const key of keys.reverse())
            this._keyboard.notify_keyval(time, key, Clutter.KeyState.RELEASED);
    }

    _render() {
        const query = this._entry.text.toLowerCase();
        this._matches = this._history.filter(item => (item.text ?? 'image').toLowerCase().includes(query));
        this._list.destroy_all_children();
        this._matches.forEach((item, index) => {
            const row = new St.Button({
                style_class: 'clipboard-manager-item',
                child: new St.Label({
                    text: item.text?.slice(0, 200).replace(/\s+/g, ' ').trim() ?? 'Image',
                    style_class: item.image ? 'clipboard-manager-image-label' : null,
                    x_align: Clutter.ActorAlign.START,
                    x_expand: true,
                }),
            });
            row.connect('motion-event', () => this._select(index));
            row.connect('clicked', () => this._copy(item));
            this._list.add_child(row);
        });
        this._selected = -1;
        this._select(0);
    }

    _select(index) {
        const rows = this._list.get_children();
        index = Math.max(0, Math.min(index, rows.length - 1));
        if (index === this._selected)
            return;
        rows[this._selected]?.remove_style_pseudo_class('selected');
        rows[index]?.add_style_pseudo_class('selected');
        if (rows[index])
            ensureActorVisibleInScrollView(this._scroll, rows[index]);
        this._selected = index;

        const item = this._matches[index];
        this._text.text = item?.text?.slice(0, PREVIEW_LENGTH) ?? '';
        this._image.style = item?.image ? `background-image: url("${this._imageFile(item.image).get_path()}");` : null;
    }

    _onKeyPress(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        const symbol = event.get_key_symbol();
        const ctrl = event.get_state() & Clutter.ModifierType.CONTROL_MASK;
        if (symbol === Clutter.KEY_Escape)
            this._close();
        else if (symbol === Clutter.KEY_Up || (ctrl && symbol === Clutter.KEY_k))
            this._select(this._selected - 1);
        else if (symbol === Clutter.KEY_Down || (ctrl && symbol === Clutter.KEY_j))
            this._select(this._selected + 1);
        else if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter)
            this._copy(this._matches[this._selected]);
        else
            return Clutter.EVENT_PROPAGATE;
        return Clutter.EVENT_STOP;
    }

    _toggle() {
        if (this._grab)
            this._close();
        else if (!Main.overview.visible && !global.display.is_grabbed())
            this._open();
    }

    _open() {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const [width, height] = ['width', 'height'].map(k => this._settings.get_int(k) * scale);
        const monitor = Main.layoutManager.currentMonitor;
        this._backdrop.set_position(monitor.x, monitor.y);
        this._backdrop.set_size(monitor.width, monitor.height);
        this._box.set_position(
            Math.round((monitor.width - width) / 2),
            Math.round((monitor.height - height) / 2));
        this._box.set_size(width, height);

        this._entry.text = '';
        this._render();
        this._backdrop.show();
        this._grab = Main.pushModal(this._backdrop, {actionMode: Shell.ActionMode.POPUP});
        this._entry.grab_key_focus();
    }

    _close() {
        if (!this._grab)
            return;
        this._backdrop.hide();
        Main.popModal(this._grab);
        this._grab = null;
    }
}
