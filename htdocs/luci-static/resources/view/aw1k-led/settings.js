'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require rpc';

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

function getServiceStatus() {
    return callServiceList('ledstatus').then(function(res) {
        try { return res['ledstatus']['instances']['instance1']['running']; }
        catch(e) { return false; }
    });
}

/* ─── Color palette ────────────────────────────────────────────────────────
 * Each entry: { id, label, hex, r, g, b }
 * r/g/b are 0 or 1 — the physical LED channels on AW1000 (max_brightness=1)
 * Mixing two or three channels gives all possible colors.
 * ────────────────────────────────────────────────────────────────────────── */
var COLORS = [
    { id: 'off',     label: 'Off',     hex: '#222222', r:0, g:0, b:0 },
    { id: 'red',     label: 'Red',     hex: '#ff3030', r:1, g:0, b:0 },
    { id: 'green',   label: 'Green',   hex: '#22dd44', r:0, g:1, b:0 },
    { id: 'blue',    label: 'Blue',    hex: '#3399ff', r:0, g:0, b:1 },
    { id: 'yellow',  label: 'Yellow',  hex: '#ffdd00', r:1, g:1, b:0 },
    { id: 'cyan',    label: 'Cyan',    hex: '#00eedd', r:0, g:1, b:1 },
    { id: 'magenta', label: 'Magenta', hex: '#dd44ff', r:1, g:0, b:1 },
    { id: 'white',   label: 'White',   hex: '#ffffff', r:1, g:1, b:1 }
];

/* Color id → COLORS entry */
function colorById(id) {
    for (var i = 0; i < COLORS.length; i++)
        if (COLORS[i].id === id) return COLORS[i];
    return COLORS[0]; /* default off */
}

/* Build sysfs commands to set a group (prefix = '5g' or 'signal') to a color */
function colorCmd(prefix, colorId, blink) {
    var c    = colorById(colorId);
    var leds = ['red', 'green', 'blue'];
    var cmds = [];
    leds.forEach(function(ch) {
        var path = '/sys/class/leds/' + ch + ':' + prefix;
        var on   = c[ch] === 1 ? 1 : 0;
        if (blink && on) {
            cmds.push('echo heartbeat > ' + path + '/trigger');
        } else {
            cmds.push('echo none > ' + path + '/trigger');
            cmds.push('echo ' + on + ' > ' + path + '/brightness');
        }
    });
    return cmds.join('; ');
}

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('ledstatus'),
            getServiceStatus()
        ]);
    },

    render: function(data) {
        var running = data[1];
        var m, s, o;

        m = new form.Map('ledstatus', _('AW1000 LED Status'),
            _('Configure LED behaviour for the Arcadyan AW1000 router. Service status: ') +
            (running
                ? '<span style="color:#2dce89;font-weight:bold">' + _('Running') + '</span>'
                : '<span style="color:#f5365c;font-weight:bold">' + _('Stopped') + '</span>'));

        s = m.section(form.NamedSection, 'settings', 'ledstatus');
        s.anonymous = true;
        s.addremove = false;

        s.tab('general',    _('General'));
        s.tab('thresholds', _('Thresholds'));
        s.tab('colors',     _('LED Colors'));
        s.tab('nightmode',  _('Night Mode'));
        s.tab('test',       _('LED Test'));

        /* ══════════════════════════════════════════════════════════════════
         * TAB: General
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('general', form.Flag, 'enabled', _('Enable LED service'));
        o.rmempty = false; o.default = '1';

        o = s.taboption('general', form.Value, 'interval',
            _('Check interval'), _('Seconds between each LED update (5–300)'));
        o.datatype = 'range(5,300)'; o.placeholder = '20'; o.rmempty = false;

        o = s.taboption('general', form.Value, 'modem_port',
            _('Modem AT port'), _('Serial port used for AT commands, e.g. /dev/ttyUSB2'));
        o.placeholder = '/dev/ttyUSB2'; o.rmempty = false;

        o = s.taboption('general', form.DummyValue, '_svc_ctrl', _('Service control'));
        o.rawhtml = true;
        o.default = '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-restart-btn">' +
                    _('Restart LED service') + '</button>' +
                    '<span id="aw1k-restart-status" style="margin-left:12px;font-size:13px"></span>';

        /* ══════════════════════════════════════════════════════════════════
         * TAB: Thresholds
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('thresholds', form.DummyValue, '_5g_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:0 0 4px">5G SINR thresholds</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 10px">' +
                    'Assign colours in the <b>LED Colors</b> tab. Thresholds only define the cutoff values.</p>';

        o = s.taboption('thresholds', form.Value, 'sinr_excellent',
            _('5G Excellent (≥)'), _('SINR ≥ this value'));
        o.datatype = 'integer'; o.placeholder = '25';

        o = s.taboption('thresholds', form.Value, 'sinr_good',
            _('5G Good (≥)'), _('SINR ≥ this value'));
        o.datatype = 'integer'; o.placeholder = '15';

        o = s.taboption('thresholds', form.Value, 'sinr_average',
            _('5G Average (≥)'), _('SINR ≥ this value'));
        o.datatype = 'integer'; o.placeholder = '5';

        o = s.taboption('thresholds', form.DummyValue, '_csq_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:16px 0 4px">CSQ signal thresholds</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 10px">' +
                    'Assign colours in the <b>LED Colors</b> tab. Thresholds only define the cutoff values.</p>';

        o = s.taboption('thresholds', form.Value, 'csq_excellent',
            _('CSQ Excellent (≥)'), _('CSQ ≥ this value'));
        o.datatype = 'range(0,31)'; o.placeholder = '20';

        o = s.taboption('thresholds', form.Value, 'csq_good',
            _('CSQ Good (≥)'), _('CSQ ≥ this value'));
        o.datatype = 'range(0,31)'; o.placeholder = '14';

        o = s.taboption('thresholds', form.Value, 'csq_average',
            _('CSQ Average (≥)'), _('CSQ ≥ this value'));
        o.datatype = 'range(0,31)'; o.placeholder = '10';

        /* ══════════════════════════════════════════════════════════════════
         * TAB: LED Colors
         * Rendered entirely as DummyValue HTML — save/preview via dedicated
         * controller endpoints so LuCI form machinery is not involved at all.
         * ══════════════════════════════════════════════════════════════════ */

        /* Build one swatch-picker row and return HTML string */
        function pickerRow(uciKey, label, desc, currentColor) {
            var swatches = COLORS.map(function(c) {
                var sel = c.id === currentColor
                    ? 'outline:3px solid #5e72e4;outline-offset:2px;transform:scale(1.18);z-index:1;'
                    : '';
                return '<span data-key="' + uciKey + '" data-color="' + c.id + '" title="' + c.label + '" ' +
                    'onclick="awLkPick(this)" ' +
                    'style="display:inline-block;width:30px;height:30px;border-radius:50%;cursor:pointer;' +
                    'background:' + c.hex + ';border:2px solid rgba(0,0,0,0.18);position:relative;' +
                    'transition:transform .12s,outline .12s;' + sel + '"></span>';
            }).join('');

            return '<tr><td style="padding:6px 14px 6px 0;white-space:nowrap;font-size:13px;vertical-align:middle">' +
                '<b>' + label + '</b>' +
                (desc ? '<br><span style="color:#999;font-size:11px">' + desc + '</span>' : '') +
                '</td><td style="padding:6px 0;vertical-align:middle">' +
                '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
                '<div id="aw1k-prev-' + uciKey + '" style="width:36px;height:36px;border-radius:8px;' +
                'flex-shrink:0;border:2px solid rgba(0,0,0,0.15);background:' + colorById(currentColor).hex + '"></div>' +
                '<div style="display:flex;gap:5px;flex-wrap:wrap">' + swatches + '</div>' +
                '<span id="aw1k-lbl-' + uciKey + '" style="font-size:13px;color:#888;min-width:52px">' +
                colorById(currentColor).label + '</span>' +
                '</div></td></tr>';
        }

        /* Whole colors tab is one DummyValue block.
         * cfgvalue() runs after UCI is loaded — return the full HTML string.
         * rawhtml=true makes LuCI render it verbatim inside <output>. */
        o = s.taboption('colors', form.DummyValue, '_colors_ui', '');
        o.rawhtml = true;

        o.cfgvalue = function(section_id) {
            var g = function(k, d) { return uci.get('ledstatus', section_id, k) || d; };

            var rows5g = [
                pickerRow('color_5g_excellent', '5G Excellent', 'SINR ≥ excellent threshold',  g('color_5g_excellent','green')),
                pickerRow('color_5g_good',      '5G Good',      'SINR ≥ good threshold',        g('color_5g_good','blue')),
                pickerRow('color_5g_average',   '5G Average',   'SINR ≥ average threshold',     g('color_5g_average','yellow')),
                pickerRow('color_5g_poor',      '5G Poor',      'SINR below average — blinks',  g('color_5g_poor','magenta')),
                pickerRow('color_5g_none',      '5G No signal', 'No NR5G cell found',            g('color_5g_none','red'))
            ].join('');

            var rowsSig = [
                pickerRow('color_sig_excellent', 'Signal Excellent', 'CSQ ≥ excellent threshold',  g('color_sig_excellent','green')),
                pickerRow('color_sig_good',      'Signal Good',      'CSQ ≥ good threshold',        g('color_sig_good','blue')),
                pickerRow('color_sig_average',   'Signal Average',   'CSQ ≥ average threshold',     g('color_sig_average','yellow')),
                pickerRow('color_sig_weak',      'Signal Weak',      'CSQ below average — blinks',  g('color_sig_weak','red')),
                pickerRow('color_sig_offline',   'Signal Offline',   'Internet disconnected',        g('color_sig_offline','magenta'))
            ].join('');

            return [
                '<div style="max-width:700px">',

                '<h5 style="margin:0 0 2px">5G SINR LED colors</h5>',
                '<p style="color:#888;font-size:12px;margin:0 0 10px">',
                'red:5g + green:5g + blue:5g — all 8 colors (7 mixes + off) available.',
                '</p>',
                '<table style="border-collapse:collapse;width:100%">', rows5g, '</table>',

                '<h5 style="margin:16px 0 2px">Signal (CSQ) LED colors</h5>',
                '<p style="color:#888;font-size:12px;margin:0 0 10px">',
                'red:signal + green:signal + blue:signal.',
                '</p>',
                '<table style="border-collapse:collapse;width:100%">', rowsSig, '</table>',

                '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">',
                '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-color-save-btn">💾 Save Colors</button>',
                '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-color-preview-btn">👁 Preview on LEDs</button>',
                '<button type="button" class="btn cbi-button cbi-button-reset"  id="aw1k-color-restore-btn">↺ Restore service</button>',
                '</div>',
                '<div id="aw1k-color-status" style="font-size:13px;margin-top:8px;min-height:20px;color:#888"></div>',
                '</div>'
            ].join('');
        };
        o.write = function() {};

        /* ══════════════════════════════════════════════════════════════════
         * TAB: Night Mode
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('nightmode', form.Flag, 'night_enabled',
            _('Enable Night Mode'),
            _('During the scheduled window all status LEDs turn off. The power LED stays on. The phone LED slow-blinks like an airplane beacon.'));
        o.rmempty = false; o.default = '0';

        o = s.taboption('nightmode', form.DummyValue, '_night_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:8px 0 4px">' + _('Schedule') + '</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 10px">' +
                    _('Night Mode activates at the Start time and deactivates at the End time. Both use 24-hour format (HH:MM).') + '</p>';

        o = s.taboption('nightmode', form.Value, 'night_start',
            _('Start time'), _('Night Mode begins at this time, e.g. 22:00'));
        o.placeholder = '22:00'; o.rmempty = false;
        o.validate = function(section_id, value) {
            if (!/^\d{1,2}:\d{2}$/.test(value)) return _('Use HH:MM format, e.g. 22:00');
            var p = value.split(':');
            if (+p[0] > 23 || +p[1] > 59) return _('Invalid time');
            return true;
        };

        o = s.taboption('nightmode', form.Value, 'night_end',
            _('End time'), _('Night Mode ends at this time, e.g. 06:00'));
        o.placeholder = '06:00'; o.rmempty = false;
        o.validate = function(section_id, value) {
            if (!/^\d{1,2}:\d{2}$/.test(value)) return _('Use HH:MM format, e.g. 06:00');
            var p = value.split(':');
            if (+p[0] > 23 || +p[1] > 59) return _('Invalid time');
            return true;
        };

        o = s.taboption('nightmode', form.DummyValue, '_night_info', '');
        o.rawhtml = true;
        o.default = [
            '<div style="background:var(--color-bg-2,#f4f4f4);border-radius:8px;padding:12px 16px;margin:8px 0 16px;font-size:13px">',
            '<b>' + _('Night Mode behaviour') + '</b><br>',
            '<ul style="margin:6px 0 0 16px;padding:0">',
            '<li>' + _('All status LEDs (5G, Internet, WiFi, Signal) → OFF') + '</li>',
            '<li>' + _('green:power → stays ON (unchanged)') + '</li>',
            '<li>' + _('green:phone → slow airplane-style blink (timer, 1500 ms on / 1500 ms off)') + '</li>',
            '<li>' + _('ledstatus service is stopped during night window and restarted at end time') + '</li>',
            '</ul></div>',
            '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">',
            '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-night-on-btn">🌙 ' + _('Test Night Mode ON') + '</button>',
            '<button type="button" class="btn cbi-button cbi-button-reset" id="aw1k-night-off-btn">☀️ ' + _('Test Night Mode OFF') + '</button>',
            '</div>',
            '<div id="aw1k-night-status" style="font-size:13px;min-height:20px;color:#888"></div>'
        ].join('');

        /* ══════════════════════════════════════════════════════════════════
         * TAB: LED Test
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('test', form.DummyValue, '_test_ui', '');
        o.rawhtml = true;
        o.default = [
            '<div style="max-width:560px">',
            '<h5 style="margin:0 0 8px">AW1000 LED Map</h5>',
            '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">',
            '<thead><tr style="background:var(--color-bg-2,#f4f4f4)">',
            '<th style="padding:6px 10px;text-align:left">LED</th>',
            '<th style="padding:6px 10px;text-align:left">sysfs name</th>',
            '<th style="padding:6px 10px;text-align:left">Used for</th>',
            '</tr></thead><tbody>',
            '<tr><td style="padding:5px 10px">🟢🔵🔴</td><td style="padding:5px 10px;font-family:monospace">*:5g</td><td style="padding:5px 10px">5G quality (RGB mix)</td></tr>',
            '<tr style="background:var(--color-bg-2,#f9f9f9)"><td style="padding:5px 10px">🟢</td><td style="padding:5px 10px;font-family:monospace">green:internet</td><td style="padding:5px 10px">Internet connected</td></tr>',
            '<tr><td style="padding:5px 10px">🟢</td><td style="padding:5px 10px;font-family:monospace">green:wifi</td><td style="padding:5px 10px">WiFi enabled</td></tr>',
            '<tr style="background:var(--color-bg-2,#f9f9f9)"><td style="padding:5px 10px">🟢🔵🔴</td><td style="padding:5px 10px;font-family:monospace">*:signal</td><td style="padding:5px 10px">Signal quality (RGB mix)</td></tr>',
            '</tbody></table>',
            '<div id="aw1k-test-status" style="min-height:22px;margin-bottom:14px;font-size:13px;color:#888"></div>',
            '<div style="background:var(--color-bg-2,#eee);border-radius:6px;height:8px;margin-bottom:18px;overflow:hidden">',
            '<div id="aw1k-test-bar" style="height:8px;border-radius:6px;background:#5e72e4;width:0%;transition:width 0.4s"></div>',
            '</div>',
            '<div style="display:flex;gap:10px;flex-wrap:wrap">',
            '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-test-btn">▶ ' + _('Run LED Test') + '</button>',
            '<button type="button" class="btn cbi-button cbi-button-reset" id="aw1k-test-stop" disabled>■ ' + _('Stop') + '</button>',
            '</div>',
            '<p style="margin-top:14px;color:#aaa;font-size:12px">',
            _('Cycles every color on both the 5G and Signal LED groups (all 7 mixes). Power LED is untouched.'),
            '</p></div>'
        ].join('');

        /* ════════════════════════════════════════════════════════════════════
         * RENDER + wire up all interactive buttons
         * ════════════════════════════════════════════════════════════════════ */
        return m.render().then(function(node) {

            /* Global swatch click handler — must be on window so inline
             * onclick="awLkPick(this)" attributes in the color picker HTML work */
            window.awLkPick = function(el) {
                var key = el.dataset.key;
                node.querySelectorAll('[data-key="' + key + '"]').forEach(function(sw) {
                    sw.style.outline = ''; sw.style.outlineOffset = ''; sw.style.transform = '';
                });
                el.style.outline = '3px solid #5e72e4'; el.style.outlineOffset = '2px'; el.style.transform = 'scale(1.18)';
                var hexMap   = { off:'#222222',red:'#ff3030',green:'#22dd44',blue:'#3399ff',yellow:'#ffdd00',cyan:'#00eedd',magenta:'#dd44ff',white:'#ffffff' };
                var labelMap = { off:'Off',red:'Red',green:'Green',blue:'Blue',yellow:'Yellow',cyan:'Cyan',magenta:'Magenta',white:'White' };
                var p = node.querySelector('#aw1k-prev-' + key); if (p) p.style.background = hexMap[el.dataset.color] || '#888';
                var l = node.querySelector('#aw1k-lbl-'  + key); if (l) l.textContent = labelMap[el.dataset.color] || el.dataset.color;
            };

            function runCmd(cmd) {
                return fetch('/cgi-bin/luci/admin/system/aw1k-led/runcmd', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'cmd=' + encodeURIComponent(cmd)
                });
            }
            function delay(ms) {
                return new Promise(function(r) { setTimeout(r, ms); });
            }

            /* ── Restart button ── */
            var restartBtn    = node.querySelector('#aw1k-restart-btn');
            var restartStatus = node.querySelector('#aw1k-restart-status');
            if (restartBtn) {
                restartBtn.addEventListener('click', function() {
                    restartBtn.disabled = true;
                    restartStatus.textContent = _('Restarting…');
                    restartStatus.style.color = '#888';
                    fetch('/cgi-bin/luci/admin/system/aw1k-led/restart', { method: 'POST' })
                        .then(function() {
                            restartStatus.textContent = _('Restarted successfully.');
                            restartStatus.style.color = '#2dce89';
                        })
                        .catch(function(e) {
                            restartStatus.textContent = _('Error: ') + e.message;
                            restartStatus.style.color = '#f5365c';
                        })
                        .finally(function() { restartBtn.disabled = false; });
                });
            }

            /* ── Color tab: Save / Preview / Restore ── */
            var colorSaveBtn    = node.querySelector('#aw1k-color-save-btn');
            var colorPreviewBtn = node.querySelector('#aw1k-color-preview-btn');
            var colorRestoreBtn = node.querySelector('#aw1k-color-restore-btn');
            var colorStatus     = node.querySelector('#aw1k-color-status');

            var COLOR_KEYS = [
                'color_5g_excellent','color_5g_good','color_5g_average','color_5g_poor','color_5g_none',
                'color_sig_excellent','color_sig_good','color_sig_average','color_sig_weak','color_sig_offline'
            ];

            /* Read selected color from the outlined swatch for a given uciKey */
            function getPickedColor(uciKey) {
                /* The selected swatch has transform:scale(1.18) in its style */
                var sel = node.querySelector('[data-key="' + uciKey + '"][style*="scale"]');
                return sel ? sel.dataset.color : (uci.get('ledstatus', 'settings', uciKey) || 'green');
            }

            function setColorStatus(msg, color) {
                if (colorStatus) { colorStatus.textContent = msg; colorStatus.style.color = color || '#888'; }
            }

            /* Save all 10 colors via dedicated controller endpoint */
            if (colorSaveBtn) {
                colorSaveBtn.addEventListener('click', function() {
                    colorSaveBtn.disabled = true;
                    setColorStatus('Saving colors…', '#888');
                    var body = COLOR_KEYS.map(function(k) {
                        return encodeURIComponent(k) + '=' + encodeURIComponent(getPickedColor(k));
                    }).join('&');
                    fetch('/cgi-bin/luci/admin/system/aw1k-led/save_colors', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: body
                    })
                    .then(function() { setColorStatus('Colors saved. LED service restarted.', '#2dce89'); })
                    .catch(function(e) { setColorStatus('Error: ' + e.message, '#f5365c'); })
                    .finally(function() { colorSaveBtn.disabled = false; });
                });
            }

            /* Preview: stop service, light up Excellent color on both groups at once */
            if (colorPreviewBtn) {
                colorPreviewBtn.addEventListener('click', function() {
                    colorPreviewBtn.disabled = true;
                    setColorStatus('Stopping service and previewing…', '#888');
                    var c5g  = getPickedColor('color_5g_excellent');
                    var csig = getPickedColor('color_sig_excellent');
                    /* both groups in one shell call — no clearing between them */
                    var cmd  = colorCmd('5g', c5g, false) + '; ' + colorCmd('signal', csig, false);
                    runCmd('/etc/init.d/ledstatus stop')
                        .then(function() { return delay(300); })
                        .then(function() { return runCmd(cmd); })
                        .then(function() {
                            setColorStatus(
                                '5G → ' + colorById(c5g).label + '   |   Signal → ' + colorById(csig).label +
                                '   (Excellent level). Click "Restore service" when done.',
                                '#5e72e4'
                            );
                        })
                        .catch(function(e) { setColorStatus('Error: ' + e.message, '#f5365c'); })
                        .finally(function() { colorPreviewBtn.disabled = false; });
                });
            }

            if (colorRestoreBtn) {
                colorRestoreBtn.addEventListener('click', function() {
                    colorRestoreBtn.disabled = true;
                    runCmd('/etc/init.d/ledstatus start')
                        .then(function() { setColorStatus('Service restored.', '#2dce89'); })
                        .finally(function() { colorRestoreBtn.disabled = false; });
                });
            }

            /* ── Night Mode buttons ── */
            var nightOnBtn  = node.querySelector('#aw1k-night-on-btn');
            var nightOffBtn = node.querySelector('#aw1k-night-off-btn');
            var nightStatus = node.querySelector('#aw1k-night-status');
            var STATUS_LEDS = ['green:5g','blue:5g','red:5g','green:internet','green:wifi','green:signal','blue:signal','red:signal'];

            function nightOnCmd() {
                var cmds = STATUS_LEDS.map(function(l) {
                    return 'echo none > /sys/class/leds/' + l + '/trigger; echo 0 > /sys/class/leds/' + l + '/brightness';
                });
                cmds.push('echo timer > /sys/class/leds/green:phone/trigger');
                cmds.push('echo 1500  > /sys/class/leds/green:phone/delay_on');
                cmds.push('echo 1500  > /sys/class/leds/green:phone/delay_off');
                return cmds.join('; ');
            }

            if (nightOnBtn) {
                nightOnBtn.addEventListener('click', function() {
                    nightOnBtn.disabled = true;
                    nightStatus.textContent = _('Activating Night Mode…');
                    nightStatus.style.color = '#888';
                    runCmd('/etc/init.d/ledstatus stop')
                        .then(function() { return delay(400); })
                        .then(function() { return runCmd(nightOnCmd()); })
                        .then(function() {
                            nightStatus.textContent = _('Night Mode active — status LEDs off, phone LED blinking.');
                            nightStatus.style.color = '#5e72e4';
                        })
                        .catch(function(e) {
                            nightStatus.textContent = _('Error: ') + e.message;
                            nightStatus.style.color = '#f5365c';
                        })
                        .finally(function() { nightOnBtn.disabled = false; });
                });
            }

            if (nightOffBtn) {
                nightOffBtn.addEventListener('click', function() {
                    nightOffBtn.disabled = true;
                    nightStatus.textContent = _('Deactivating Night Mode…');
                    nightStatus.style.color = '#888';
                    runCmd('echo none > /sys/class/leds/green:phone/trigger; echo 0 > /sys/class/leds/green:phone/brightness')
                        .then(function() { return delay(200); })
                        .then(function() { return runCmd('/etc/init.d/ledstatus start'); })
                        .then(function() {
                            nightStatus.textContent = _('Night Mode off — LED service restored.');
                            nightStatus.style.color = '#2dce89';
                        })
                        .catch(function(e) {
                            nightStatus.textContent = _('Error: ') + e.message;
                            nightStatus.style.color = '#f5365c';
                        })
                        .finally(function() { nightOffBtn.disabled = false; });
                });
            }

            /* ── LED Test ── */
            var testBtn  = node.querySelector('#aw1k-test-btn');
            var stopBtn  = node.querySelector('#aw1k-test-stop');
            var statusEl = node.querySelector('#aw1k-test-status');
            var barEl    = node.querySelector('#aw1k-test-bar');

            /* Test: cycle all 7 colors on both 5g and signal groups */
            var TEST_STEPS = [];
            ['5g', 'signal'].forEach(function(grp) {
                COLORS.forEach(function(c) {
                    if (c.id === 'off') return; /* skip off — already visible between steps */
                    TEST_STEPS.push({ group: grp, color: c });
                });
            });

            var testRunning = false;
            var testAborted = false;

            function setTestStatus(msg, color) {
                if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || '#888'; }
            }
            function setBar(pct) {
                if (barEl) barEl.style.width = pct + '%';
            }
            function allLedsOff() {
                var leds = ['green:5g','blue:5g','red:5g','green:signal','blue:signal','red:signal'];
                return runCmd(leds.map(function(l) {
                    return 'echo none > /sys/class/leds/' + l + '/trigger; echo 0 > /sys/class/leds/' + l + '/brightness';
                }).join('; '));
            }

            async function runTest() {
                testRunning = true;
                testAborted = false;
                testBtn.disabled = true;
                stopBtn.disabled = false;
                setBar(0);

                setTestStatus(_('Stopping LED service…'), '#888');
                await runCmd('/etc/init.d/ledstatus stop');
                await delay(500);

                var total = TEST_STEPS.length;
                for (var i = 0; i < total; i++) {
                    if (testAborted) break;
                    var step = TEST_STEPS[i];
                    await allLedsOff();
                    await runCmd(colorCmd(step.group, step.color.id, false));
                    setBar(Math.round((i + 1) / total * 100));
                    setTestStatus(
                        '(' + (i+1) + '/' + total + ')  ' + step.group.toUpperCase() + ' → ' + step.color.label,
                        step.color.hex === '#222222' ? '#888' : step.color.hex
                    );
                    await delay(900);
                }

                await allLedsOff();
                await runCmd('echo none > /sys/class/leds/green:power/trigger; echo 1 > /sys/class/leds/green:power/brightness');
                setBar(testAborted ? 0 : 100);
                setTestStatus(testAborted ? _('Test stopped. Restarting…') : _('Test complete! Restarting…'), '#888');
                await runCmd('/etc/init.d/ledstatus start');
                await delay(400);
                setTestStatus(
                    testAborted ? _('Test stopped. Service restored.') : _('All done! Service restored.'),
                    testAborted ? '#fb6340' : '#2dce89'
                );
                testRunning = false;
                testBtn.disabled = false;
                stopBtn.disabled = true;
            }

            if (testBtn) testBtn.addEventListener('click', function() { if (!testRunning) runTest(); });
            if (stopBtn) stopBtn.addEventListener('click', function() {
                if (testRunning) { testAborted = true; setTestStatus(_('Stopping test…'), '#fb6340'); }
            });

            return node;
        });
    },

    handleSaveApply: function(ev) {
        return this.handleSave(ev).then(function() {
            return fetch('/cgi-bin/luci/admin/system/aw1k-led/restart', { method: 'POST' });
        }).then(function() {
            ui.addNotification(null, E('p', _('Settings saved. LED service restarted.')), 'info');
        });
    }
});
