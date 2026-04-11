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
         * Each signal level for 5G and Signal gets a color picker.
         * We store the color id in UCI, the shell script reads it.
         * ══════════════════════════════════════════════════════════════════ */

        /* Helper: build a color picker DummyValue for one level */
        function makeColorPicker(tabName, uciKey, label, desc, defaultColor) {
            var opt = s.taboption(tabName, form.DummyValue, '_cp_' + uciKey, label, desc);
            opt.rawhtml = true;

            /* We need current value at render time — read from uci object */
            opt.renderWidget = function(section_id) {
                var current = uci.get('ledstatus', section_id, uciKey) || defaultColor;
                var swatches = COLORS.map(function(c) {
                    var sel = (c.id === current) ? 'outline:3px solid #5e72e4;outline-offset:2px;transform:scale(1.15);' : '';
                    return '<span data-color="' + c.id + '" title="' + c.label + '" ' +
                        'style="display:inline-block;width:28px;height:28px;border-radius:50%;' +
                        'background:' + c.hex + ';cursor:pointer;border:2px solid #0003;' +
                        'transition:transform .15s;' + sel + '" ' +
                        'onclick="awLkPickColor(this,\'' + uciKey + '\',\'' + section_id + '\')"></span>';
                }).join(' ');

                /* Live preview swatch */
                var previewHex = colorById(current).hex;
                return E('div', { style: 'margin:4px 0 12px' }, [
                    E('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' }, [
                        E('div', { 'data-preview': uciKey,
                            style: 'width:36px;height:36px;border-radius:8px;border:2px solid #0003;' +
                                   'background:' + previewHex + ';flex-shrink:0' }),
                        E('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
                            COLORS.map(function(c) {
                                var sel = (c.id === current)
                                    ? 'outline:3px solid #5e72e4;outline-offset:2px;transform:scale(1.15);'
                                    : '';
                                return E('span', {
                                    'data-color': c.id,
                                    title: c.label,
                                    style: 'display:inline-block;width:28px;height:28px;border-radius:50%;' +
                                           'background:' + c.hex + ';cursor:pointer;border:2px solid #0003;' +
                                           'transition:transform .15s;' + sel,
                                    click: function(ev) {
                                        awLkPickColor(ev.currentTarget, uciKey, section_id);
                                    }
                                });
                            })
                        ),
                        E('span', { 'data-label': uciKey,
                            style: 'font-size:13px;color:#888' },
                            colorById(current).label)
                    ])
                ]);
            };
            /* No value to save directly — saving done via hidden input populated by JS */
            opt.write = function() {};
            return opt;
        }

        /* ── 5G color section ─────────────────────────────────────────────── */
        o = s.taboption('colors', form.DummyValue, '_5g_color_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:0 0 2px">5G SINR LED colors</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 14px">' +
                    'Choose the color shown on the 5G LED (red:5g + green:5g + blue:5g) for each signal quality level. ' +
                    'All 7 physical mix colors are available.</p>';

        /* Color pickers — Value field with custom renderWidget + formvalue override */
        function addColorSelect(tabName, uciKey, label, desc, defaultColor) {
            var o2 = s.taboption(tabName, form.Value, uciKey, label, desc);
            o2.default  = defaultColor;
            o2.rmempty  = false;

            /* Render swatches + a visible hidden <input> that LuCI reads via formvalue() */
            o2.renderWidget = function(section_id, option_index, cfgvalue) {
                var current  = cfgvalue || defaultColor;
                var inputId  = 'aw1k-inp-' + uciKey + '-' + section_id;

                var swatchEls = COLORS.map(function(c) {
                    var isSel = (c.id === current);
                    return E('span', {
                        'data-color': c.id,
                        title: c.label,
                        style: 'display:inline-block;width:30px;height:30px;border-radius:50%;' +
                               'background:' + c.hex + ';cursor:pointer;' +
                               'border:2px solid rgba(0,0,0,0.15);' +
                               'transition:transform .15s,outline .15s;' +
                               (isSel ? 'outline:3px solid #5e72e4;outline-offset:2px;transform:scale(1.15);' : ''),
                        click: function(ev) {
                            var el     = ev.currentTarget;
                            var row    = el.closest('.aw1k-color-row');
                            /* deselect all swatches */
                            row.querySelectorAll('[data-color]').forEach(function(sw) {
                                sw.style.outline       = '';
                                sw.style.outlineOffset = '';
                                sw.style.transform     = '';
                            });
                            el.style.outline       = '3px solid #5e72e4';
                            el.style.outlineOffset = '2px';
                            el.style.transform     = 'scale(1.15)';
                            /* update preview square + label */
                            var cdata = colorById(el.dataset.color);
                            row.querySelector('.aw1k-preview').style.background = cdata.hex;
                            row.querySelector('.aw1k-clabel').textContent       = cdata.label;
                            /* write value into the real input so LuCI formvalue() picks it up */
                            var inp = row.querySelector('input.aw1k-value');
                            inp.value = el.dataset.color;
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    });
                });

                /* Real <input> — visible to LuCI's formvalue() by id/name */
                var inputEl = E('input', {
                    id:    inputId,
                    name:  uciKey,
                    type:  'text',
                    'class': 'aw1k-value',
                    value: current,
                    style: 'position:absolute;opacity:0;pointer-events:none;width:1px;height:1px'
                });

                return E('div', { 'class': 'aw1k-color-row', style: 'margin:2px 0 14px;position:relative' }, [
                    E('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' }, [
                        E('div', {
                            'class': 'aw1k-preview',
                            style: 'width:38px;height:38px;border-radius:8px;flex-shrink:0;' +
                                   'border:2px solid rgba(0,0,0,0.15);background:' + colorById(current).hex
                        }),
                        E('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, swatchEls),
                        E('span', { 'class': 'aw1k-clabel', style: 'font-size:13px;color:#888;min-width:54px' },
                            colorById(current).label)
                    ]),
                    inputEl
                ]);
            };

            /* Tell LuCI to read the value from our hidden input.
             * Must use the unique id (uciKey + section_id) to avoid
             * querySelector returning the first picker on the page. */
            o2.formvalue = function(section_id) {
                var inp = document.getElementById('aw1k-inp-' + uciKey + '-' + section_id);
                return (inp && inp.value) ? inp.value : (uci.get('ledstatus', section_id, uciKey) || defaultColor);
            };

            return o2;
        }

        addColorSelect('colors', 'color_5g_excellent', _('5G Excellent color'), _('Color when SINR is excellent'), 'green');
        addColorSelect('colors', 'color_5g_good',      _('5G Good color'),      _('Color when SINR is good'),      'blue');
        addColorSelect('colors', 'color_5g_average',   _('5G Average color'),   _('Color when SINR is average'),   'yellow');
        addColorSelect('colors', 'color_5g_poor',      _('5G Poor color'),      _('Color when SINR is poor — will blink'), 'magenta');
        addColorSelect('colors', 'color_5g_none',      _('5G No signal color'), _('Color when no 5G signal'),      'red');

        o = s.taboption('colors', form.DummyValue, '_sig_color_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:8px 0 2px">Signal (CSQ) LED colors</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 14px">' +
                    'Choose the color shown on the Signal LED (red:signal + green:signal + blue:signal) for each CSQ level.</p>';

        addColorSelect('colors', 'color_sig_excellent', _('Signal Excellent color'), _('Color when CSQ is excellent'), 'green');
        addColorSelect('colors', 'color_sig_good',      _('Signal Good color'),      _('Color when CSQ is good'),      'blue');
        addColorSelect('colors', 'color_sig_average',   _('Signal Average color'),   _('Color when CSQ is average'),   'yellow');
        addColorSelect('colors', 'color_sig_weak',      _('Signal Weak color'),      _('Color when CSQ is weak — will blink'), 'red');
        addColorSelect('colors', 'color_sig_offline',   _('Signal Offline color'),   _('Color when internet is disconnected'), 'magenta');

        /* Live preview button */
        o = s.taboption('colors', form.DummyValue, '_color_preview_btn', '');
        o.rawhtml = true;
        o.default = [
            '<div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap">',
            '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-color-preview-btn">',
            '👁 ' + _('Preview on LEDs') + '</button>',
            '<button type="button" class="btn cbi-button cbi-button-reset" id="aw1k-color-restore-btn">',
            '↺ ' + _('Restore service') + '</button>',
            '</div>',
            '<div id="aw1k-color-preview-status" style="font-size:13px;margin-top:6px;color:#888"></div>'
        ].join('');

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

            /* ── Color preview button ── */
            var colorPreviewBtn  = node.querySelector('#aw1k-color-preview-btn');
            var colorRestoreBtn  = node.querySelector('#aw1k-color-restore-btn');
            var colorPreviewSt   = node.querySelector('#aw1k-color-preview-status');

            /* Read current value from the hidden input — use unique id to avoid
             * querySelector matching the wrong picker when multiple share the same name */
            function getCurrentColorId(uciKey) {
                var inp = node.querySelector('#aw1k-inp-' + uciKey + '-settings');
                if (inp && inp.value) return inp.value;
                return uci.get('ledstatus', 'settings', uciKey) || 'green';
            }

            if (colorPreviewBtn) {
                colorPreviewBtn.addEventListener('click', function() {
                    colorPreviewBtn.disabled = true;
                    colorPreviewSt.textContent = _('Stopping service and previewing all levels…');
                    colorPreviewSt.style.color = '#888';

                    /* Build one command that sets all color levels at once */
                    var levels5g = [
                        { key: 'color_5g_excellent', blink: false },
                        { key: 'color_5g_good',      blink: false },
                        { key: 'color_5g_average',   blink: false },
                        { key: 'color_5g_poor',      blink: true  },
                        { key: 'color_5g_none',      blink: false }
                    ];
                    var levelsSig = [
                        { key: 'color_sig_excellent', blink: false },
                        { key: 'color_sig_good',      blink: false },
                        { key: 'color_sig_average',   blink: false },
                        { key: 'color_sig_weak',      blink: true  },
                        { key: 'color_sig_offline',   blink: false }
                    ];

                    /* Show Excellent level for both groups simultaneously */
                    var c5g  = getCurrentColorId('color_5g_excellent');
                    var csig = getCurrentColorId('color_sig_excellent');
                    var previewCmd = colorCmd('5g', c5g, false) + '; ' + colorCmd('signal', csig, false);

                    runCmd('/etc/init.d/ledstatus stop')
                        .then(function() { return delay(300); })
                        .then(function() { return runCmd(previewCmd); })
                        .then(function() {
                            colorPreviewSt.textContent =
                                '5G=' + colorById(c5g).label +
                                '  |  Signal=' + colorById(csig).label +
                                '  — showing Excellent level. Click "Restore service" when done.';
                            colorPreviewSt.style.color = '#5e72e4';
                        })
                        .catch(function(e) {
                            colorPreviewSt.textContent = _('Error: ') + e.message;
                            colorPreviewSt.style.color = '#f5365c';
                        })
                        .finally(function() { colorPreviewBtn.disabled = false; });
                });
            }

            if (colorRestoreBtn) {
                colorRestoreBtn.addEventListener('click', function() {
                    colorRestoreBtn.disabled = true;
                    runCmd('/etc/init.d/ledstatus start')
                        .then(function() {
                            colorPreviewSt.textContent = _('Service restored.');
                            colorPreviewSt.style.color = '#2dce89';
                        })
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
