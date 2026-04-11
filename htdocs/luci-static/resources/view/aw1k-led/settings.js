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

/* Run a shell command via ubus sys exec */
var callRunCmd = rpc.declare({
    object: 'luci',
    method: 'exec',
    params: ['command'],
    expect: { result: '' }
});

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

        /* Restart button inside General tab */
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
         * TAB: LED Test
         * ══════════════════════════════════════════════════════════════════ */
        o = s.taboption('test', form.DummyValue, '_test_ui', '');
        o.rawhtml = true;
        o.default = [
            '<div style="max-width:560px">',

            /* LED map table */
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

            /* Progress / status */
            '<div id="aw1k-test-status" style="min-height:22px;margin-bottom:14px;font-size:13px;color:#888"></div>',

            /* Progress bar */
            '<div style="background:var(--color-bg-2,#eee);border-radius:6px;height:8px;margin-bottom:18px;overflow:hidden">',
            '<div id="aw1k-test-bar" style="height:8px;border-radius:6px;background:#5e72e4;width:0%;transition:width 0.4s"></div>',
            '</div>',

            /* Buttons */
            '<div style="display:flex;gap:10px;flex-wrap:wrap">',
            '<button type="button" class="btn cbi-button cbi-button-action" id="aw1k-test-btn">▶ ' + _('Run LED Test') + '</button>',
            '<button type="button" class="btn cbi-button cbi-button-reset" id="aw1k-test-stop" disabled>■ ' + _('Stop') + '</button>',
            '</div>',

            '<p style="margin-top:14px;color:#aaa;font-size:12px">',
            _('Each LED will blink in every possible colour one by one (1 s each). The normal LED service is paused during the test and automatically restarted when done.'),
            '</p>',

            '</div>'
        ].join('');

        /* ── Render then wire up interactive buttons ─────────────────────── */
        return m.render().then(function(node) {

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

            /* ── LED Test ── */
            var testBtn  = node.querySelector('#aw1k-test-btn');
            var stopBtn  = node.querySelector('#aw1k-test-stop');
            var statusEl = node.querySelector('#aw1k-test-status');
            var barEl    = node.querySelector('#aw1k-test-bar');

            /* All LEDs × all states to cycle through */
            var LEDS = [
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
                { label: 'ON',    cmds: function(led) { return 'echo none > /sys/class/leds/' + led + '/trigger; echo 1 > /sys/class/leds/' + led + '/brightness'; } },
                { label: 'BLINK', cmds: function(led) { return 'echo heartbeat > /sys/class/leds/' + led + '/trigger'; } },
                { label: 'OFF',   cmds: function(led) { return 'echo none > /sys/class/leds/' + led + '/trigger; echo 0 > /sys/class/leds/' + led + '/brightness'; } }
            ];

            var testRunning = false;
            var testAborted = false;
            var STEP_MS     = 900;

            function setStatus(msg, color) {
                if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || '#888'; }
            }

            function setBar(pct) {
                if (barEl) barEl.style.width = pct + '%';
            }

            function sshCmd(cmd) {
                return fetch('/cgi-bin/luci/admin/system/aw1k-led/runcmd', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'cmd=' + encodeURIComponent(cmd)
                });
            }

            function delay(ms) {
                return new Promise(function(resolve) { setTimeout(resolve, ms); });
            }

            function allLedsOff() {
                var cmds = LEDS.map(function(l) {
                    return 'echo none > /sys/class/leds/' + l.name + '/trigger; echo 0 > /sys/class/leds/' + l.name + '/brightness';
                }).join('; ');
                return sshCmd(cmds);
            }

            async function runTest() {
                testRunning = true;
                testAborted = false;
                testBtn.disabled = true;
                stopBtn.disabled = false;
                setBar(0);

                /* Stop the service so it doesn't override LEDs */
                setStatus(_('Stopping LED service…'), '#888');
                await sshCmd('/etc/init.d/ledstatus stop');
                await delay(500);

                var total = LEDS.length * STATES.length;
                var step  = 0;

                for (var i = 0; i < LEDS.length; i++) {
                    for (var j = 0; j < STATES.length; j++) {
                        if (testAborted) break;

                        var led   = LEDS[i];
                        var state = STATES[j];

                        /* Turn everything off, then apply current step */
                        await allLedsOff();
                        await sshCmd(state.cmds(led.name));

                        step++;
                        setBar(Math.round(step / total * 100));
                        setStatus(
                            '(' + step + '/' + total + ')  ' + led.label + '  →  ' + state.label,
                            state.label === 'ON'    ? '#2dce89' :
                            state.label === 'BLINK' ? '#fb6340' : '#888'
                        );

                        await delay(STEP_MS);
                    }
                    if (testAborted) break;
                }

                /* Restore */
                await allLedsOff();
                setBar(testAborted ? 0 : 100);
                setStatus(
                    testAborted ? _('Test stopped. Restarting LED service…') : _('Test complete! Restarting LED service…'),
                    '#888'
                );
                await sshCmd('/etc/init.d/ledstatus start');
                await delay(400);
                setStatus(
                    testAborted ? _('Test stopped. Service restored.') : _('All done! Service restored.'),
                    testAborted ? '#fb6340' : '#2dce89'
                );

                testRunning  = false;
                testBtn.disabled  = false;
                stopBtn.disabled  = true;
            }

            if (testBtn) {
                testBtn.addEventListener('click', function() {
                    if (!testRunning) runTest();
                });
            }
            if (stopBtn) {
                stopBtn.addEventListener('click', function() {
                    if (testRunning) {
                        testAborted = true;
                        setStatus(_('Stopping test…'), '#fb6340');
                    }
                });
            }

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
