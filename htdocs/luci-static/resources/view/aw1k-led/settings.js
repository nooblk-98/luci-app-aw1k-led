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
        try {
            return res['ledstatus']['instances']['instance1']['running'];
        } catch(e) { return false; }
    });
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

        /* ── Single tabbed section ───────────────────────────────────────── */
        s = m.section(form.NamedSection, 'settings', 'ledstatus');
        s.anonymous = true;
        s.addremove = false;

        s.tab('general',    _('General'));
        s.tab('thresholds', _('Thresholds'));
        s.tab('nightmode',  _('Night Mode'));
        s.tab('test',       _('LED Test'));

        /* ══════════════════════════════════════════════════════════════════
         * TAB: General
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('general', form.Flag, 'enabled', _('Enable LED service'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('general', form.Value, 'interval',
            _('Check interval'), _('Seconds between each LED update (5–300)'));
        o.datatype    = 'range(5,300)';
        o.placeholder = '20';
        o.rmempty     = false;

        o = s.taboption('general', form.Value, 'modem_port',
            _('Modem AT port'), _('Serial port used for AT commands, e.g. /dev/ttyUSB2'));
        o.placeholder = '/dev/ttyUSB2';
        o.rmempty     = false;

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
                    'Excellent → Green &nbsp;|&nbsp; Good → Blue &nbsp;|&nbsp; ' +
                    'Average → Red+Green &nbsp;|&nbsp; Poor → all blink &nbsp;|&nbsp; No signal → Red</p>';

        o = s.taboption('thresholds', form.Value, 'sinr_excellent',
            _('5G Excellent (≥)'), _('SINR ≥ this value → Green LED'));
        o.datatype = 'integer'; o.placeholder = '25';

        o = s.taboption('thresholds', form.Value, 'sinr_good',
            _('5G Good (≥)'), _('SINR ≥ this value → Blue LED'));
        o.datatype = 'integer'; o.placeholder = '15';

        o = s.taboption('thresholds', form.Value, 'sinr_average',
            _('5G Average (≥)'), _('SINR ≥ this value → Red+Green LED'));
        o.datatype = 'integer'; o.placeholder = '5';

        o = s.taboption('thresholds', form.DummyValue, '_csq_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:16px 0 4px">CSQ signal thresholds</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 10px">' +
                    'Excellent → Green &nbsp;|&nbsp; Good → Blue &nbsp;|&nbsp; ' +
                    'Average → Red+Green &nbsp;|&nbsp; Weak → Red blink</p>';

        o = s.taboption('thresholds', form.Value, 'csq_excellent',
            _('CSQ Excellent (≥)'), _('CSQ ≥ this value → Green LED'));
        o.datatype = 'range(0,31)'; o.placeholder = '20';

        o = s.taboption('thresholds', form.Value, 'csq_good',
            _('CSQ Good (≥)'), _('CSQ ≥ this value → Blue LED'));
        o.datatype = 'range(0,31)'; o.placeholder = '14';

        o = s.taboption('thresholds', form.Value, 'csq_average',
            _('CSQ Average (≥)'), _('CSQ ≥ this value → Red+Green LED'));
        o.datatype = 'range(0,31)'; o.placeholder = '10';

        /* ══════════════════════════════════════════════════════════════════
         * TAB: Night Mode
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('nightmode', form.Flag, 'night_enabled',
            _('Enable Night Mode'),
            _('During the scheduled window all status LEDs turn off. The power LED stays on. The phone LED slow-blinks like an airplane beacon.'));
        o.rmempty = false;
        o.default = '0';

        o = s.taboption('nightmode', form.DummyValue, '_night_hdr', '');
        o.rawhtml = true;
        o.default = '<h5 style="margin:8px 0 4px">' + _('Schedule') + '</h5>' +
                    '<p style="color:#888;font-size:12px;margin:0 0 10px">' +
                    _('Night Mode activates at the Start time and deactivates at the End time. Both use 24-hour format (HH:MM).') + '</p>';

        o = s.taboption('nightmode', form.Value, 'night_start',
            _('Start time'), _('Night Mode begins at this time, e.g. 22:00'));
        o.placeholder = '22:00';
        o.rmempty = false;
        o.validate = function(section_id, value) {
            if (!/^\d{1,2}:\d{2}$/.test(value)) return _('Use HH:MM format, e.g. 22:00');
            var parts = value.split(':');
            if (parseInt(parts[0]) > 23 || parseInt(parts[1]) > 59) return _('Invalid time');
            return true;
        };

        o = s.taboption('nightmode', form.Value, 'night_end',
            _('End time'), _('Night Mode ends at this time, e.g. 06:00'));
        o.placeholder = '06:00';
        o.rmempty = false;
        o.validate = function(section_id, value) {
            if (!/^\d{1,2}:\d{2}$/.test(value)) return _('Use HH:MM format, e.g. 06:00');
            var parts = value.split(':');
            if (parseInt(parts[0]) > 23 || parseInt(parts[1]) > 59) return _('Invalid time');
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
            '</ul>',
            '</div>',

            /* Test buttons */
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
            '<tr><td style="padding:5px 10px">🟢</td><td style="padding:5px 10px;font-family:monospace">green:5g</td><td style="padding:5px 10px">5G Excellent</td></tr>',
            '<tr style="background:var(--color-bg-2,#f9f9f9)"><td style="padding:5px 10px">🔵</td><td style="padding:5px 10px;font-family:monospace">blue:5g</td><td style="padding:5px 10px">5G Good</td></tr>',
            '<tr><td style="padding:5px 10px">🔴</td><td style="padding:5px 10px;font-family:monospace">red:5g</td><td style="padding:5px 10px">5G Poor / No signal</td></tr>',
            '<tr style="background:var(--color-bg-2,#f9f9f9)"><td style="padding:5px 10px">🟢</td><td style="padding:5px 10px;font-family:monospace">green:internet</td><td style="padding:5px 10px">Internet connected</td></tr>',
            '<tr><td style="padding:5px 10px">🟢</td><td style="padding:5px 10px;font-family:monospace">green:wifi</td><td style="padding:5px 10px">WiFi enabled</td></tr>',
            '<tr style="background:var(--color-bg-2,#f9f9f9)"><td style="padding:5px 10px">🟢</td><td style="padding:5px 10px;font-family:monospace">green:signal</td><td style="padding:5px 10px">Signal Excellent</td></tr>',
            '<tr><td style="padding:5px 10px">🔵</td><td style="padding:5px 10px;font-family:monospace">blue:signal</td><td style="padding:5px 10px">Signal Good</td></tr>',
            '<tr style="background:var(--color-bg-2,#f9f9f9)"><td style="padding:5px 10px">🔴</td><td style="padding:5px 10px;font-family:monospace">red:signal</td><td style="padding:5px 10px">Signal Poor</td></tr>',
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
            _('Each LED will blink in every possible colour one by one. The LED service is paused during the test and automatically restarted when done.'),
            '</p>',
            '</div>'
        ].join('');

        /* ── Render then wire up buttons ─────────────────────────────────── */
        return m.render().then(function(node) {

            /* shared runcmd helper */
            function runCmd(cmd) {
                return fetch('/cgi-bin/luci/admin/system/aw1k-led/runcmd', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'cmd=' + encodeURIComponent(cmd)
                });
            }
            function delay(ms) {
                return new Promise(function(resolve) { setTimeout(resolve, ms); });
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

            /* ── Night Mode test buttons ── */
            var nightOnBtn  = node.querySelector('#aw1k-night-on-btn');
            var nightOffBtn = node.querySelector('#aw1k-night-off-btn');
            var nightStatus = node.querySelector('#aw1k-night-status');

            var STATUS_LEDS = ['green:5g','blue:5g','red:5g','green:internet','green:wifi','green:signal','blue:signal','red:signal'];

            /* Build night-on command: all status LEDs off + phone LED airplane blink */
            function nightOnCmd() {
                var cmds = STATUS_LEDS.map(function(l) {
                    return 'echo none > /sys/class/leds/' + l + '/trigger; echo 0 > /sys/class/leds/' + l + '/brightness';
                });
                /* timer trigger for slow airplane blink — set delay_on/delay_off to 1500 ms */
                cmds.push('echo timer > /sys/class/leds/green:phone/trigger');
                cmds.push('echo 1500 > /sys/class/leds/green:phone/delay_on');
                cmds.push('echo 1500 > /sys/class/leds/green:phone/delay_off');
                return cmds.join('; ');
            }

            /* Build night-off command: restore phone LED off, restart ledstatus */
            function nightOffCmd() {
                return 'echo none > /sys/class/leds/green:phone/trigger; echo 0 > /sys/class/leds/green:phone/brightness';
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
                    runCmd(nightOffCmd())
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

            var TEST_LEDS = [
                { name: 'green:5g',       label: 'green:5g' },
                { name: 'blue:5g',        label: 'blue:5g' },
                { name: 'red:5g',         label: 'red:5g' },
                { name: 'green:internet', label: 'green:internet' },
                { name: 'green:wifi',     label: 'green:wifi' },
                { name: 'green:signal',   label: 'green:signal' },
                { name: 'blue:signal',    label: 'blue:signal' },
                { name: 'red:signal',     label: 'red:signal' }
            ];

            var STATES = [
                { label: 'ON',    cmd: function(l) { return 'echo none > /sys/class/leds/' + l + '/trigger; echo 1 > /sys/class/leds/' + l + '/brightness'; } },
                { label: 'BLINK', cmd: function(l) { return 'echo heartbeat > /sys/class/leds/' + l + '/trigger'; } },
                { label: 'OFF',   cmd: function(l) { return 'echo none > /sys/class/leds/' + l + '/trigger; echo 0 > /sys/class/leds/' + l + '/brightness'; } }
            ];

            var testRunning = false;
            var testAborted = false;

            function setTestStatus(msg, color) {
                if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || '#888'; }
            }
            function setBar(pct) {
                if (barEl) barEl.style.width = pct + '%';
            }
            function allTestLedsOff() {
                var cmds = TEST_LEDS.map(function(l) {
                    return 'echo none > /sys/class/leds/' + l.name + '/trigger; echo 0 > /sys/class/leds/' + l.name + '/brightness';
                }).join('; ');
                return runCmd(cmds);
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

                var total = TEST_LEDS.length * STATES.length;
                var step  = 0;

                for (var i = 0; i < TEST_LEDS.length; i++) {
                    for (var j = 0; j < STATES.length; j++) {
                        if (testAborted) break;
                        var led   = TEST_LEDS[i];
                        var state = STATES[j];
                        await allTestLedsOff();
                        await runCmd(state.cmd(led.name));
                        step++;
                        setBar(Math.round(step / total * 100));
                        setTestStatus(
                            '(' + step + '/' + total + ')  ' + led.label + '  →  ' + state.label,
                            state.label === 'ON'    ? '#2dce89' :
                            state.label === 'BLINK' ? '#fb6340' : '#888'
                        );
                        await delay(900);
                    }
                    if (testAborted) break;
                }

                await allTestLedsOff();
                await runCmd('echo none > /sys/class/leds/green:power/trigger; echo 1 > /sys/class/leds/green:power/brightness');
                setBar(testAborted ? 0 : 100);
                setTestStatus(
                    testAborted ? _('Test stopped. Restarting LED service…') : _('Test complete! Restarting LED service…'),
                    '#888'
                );
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
