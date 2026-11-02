import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SHORTCUT = 'toggle-clipboard-manager';

export default class ClipboardManagerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const group = new Adw.PreferencesGroup();
        const page = new Adw.PreferencesPage();
        page.add(group);
        window.add(page);

        const label = new Adw.ShortcutLabel({disabled_text: 'Disabled', valign: Gtk.Align.CENTER});
        const row = new Adw.ActionRow({
            title: 'Shortcut',
            subtitle: 'Click to change, Backspace to disable',
            activatable: true,
        });
        row.add_suffix(label);
        group.add(row);

        const sync = () => label.set({
            accelerator: settings.get_strv(SHORTCUT)[0] ?? '',
            disabled_text: 'Disabled',
        });
        sync();

        let recording = false;
        row.connect('activated', () => {
            recording = true;
            label.set({accelerator: '', disabled_text: 'Press a shortcut…'});
        });

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            if (!recording)
                return Gdk.EVENT_PROPAGATE;
            const mods = state & Gtk.accelerator_get_default_mod_mask();
            if (keyval === Gdk.KEY_BackSpace) {
                settings.set_strv(SHORTCUT, []);
            } else if (keyval !== Gdk.KEY_Escape) {
                if (!mods || !Gtk.accelerator_valid(keyval, mods))
                    return Gdk.EVENT_STOP;
                settings.set_strv(SHORTCUT, [Gtk.accelerator_name(Gdk.keyval_to_lower(keyval), mods)]);
            }
            recording = false;
            sync();
            return Gdk.EVENT_STOP;
        });
        row.add_controller(keys);

        for (const [key, title, subtitle, min, max, step] of [
            ['width', 'Width', 'Pixels', 400, 4000, 10],
            ['height', 'Height', 'Pixels', 200, 4000, 10],
        ]) {
            const spin = Adw.SpinRow.new_with_range(min, max, step);
            spin.set({title, subtitle});
            settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
            group.add(spin);
        }

        const indicator = new Adw.SwitchRow({title: 'Top Bar Icon', subtitle: 'Click the icon to open the clipboard'});
        settings.bind('show-indicator', indicator, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(indicator);
    }
}
