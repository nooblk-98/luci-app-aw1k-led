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
        } catch(e) {
            return false;
        }
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
            _('Configure LED behaviour for the Arcadyan AW1000 router. ' +
              'Service status: ') +
            (running
                ? '<span style="color:green;font-weight:bold">' + _('Running') + '</span>'
                : '<span style="color:red;font-weight:bold">'   + _('Stopped') + '</span>'));

        // ── General ──────────────────────────────────────────────────────────
        s = m.section(form.TypedSection, 'ledstatus', _('General Settings'));
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Flag, 'enabled', _('Enable LED service'));
        o.rmempty = false;

        o = s.option(form.Value, 'interval', _('Check interval'), _('Seconds between each LED update'));
        o.datatype = 'range(5,300)';
        o.placeholder = '20';
        o.rmempty = false;

        o = s.option(form.Value, 'modem_port', _('Modem AT port'), _('e.g. /dev/ttyUSB2'));
        o.placeholder = '/dev/ttyUSB2';
        o.rmempty = false;

        // ── 5G SINR thresholds ───────────────────────────────────────────────
        s = m.section(form.TypedSection, 'ledstatus', _('5G SINR Thresholds'));
        s.anonymous = true;
        s.addremove = false;
        s.description = _('LED colours: Excellent = Green, Good = Blue, Average = Red+Green, Very Bad = all blink, No signal = Red');

        o = s.option(form.Value, 'sinr_excellent', _('Excellent (≥)'), _('SINR ≥ this value → Green LED'));
        o.datatype = 'integer';
        o.placeholder = '25';

        o = s.option(form.Value, 'sinr_good', _('Good (≥)'), _('SINR ≥ this value → Blue LED'));
        o.datatype = 'integer';
        o.placeholder = '15';

        o = s.option(form.Value, 'sinr_average', _('Average (≥)'), _('SINR ≥ this value → Red+Green LED'));
        o.datatype = 'integer';
        o.placeholder = '5';

        // ── CSQ Signal thresholds ────────────────────────────────────────────
        s = m.section(form.TypedSection, 'ledstatus', _('Signal (CSQ) Thresholds'));
        s.anonymous = true;
        s.addremove = false;
        s.description = _('LED colours: Excellent = Green, Good = Blue, Average = Red+Green, Weak = Red blink');

        o = s.option(form.Value, 'csq_excellent', _('Excellent (≥)'), _('CSQ ≥ this value → Green LED'));
        o.datatype = 'range(0,31)';
        o.placeholder = '20';

        o = s.option(form.Value, 'csq_good', _('Good (≥)'), _('CSQ ≥ this value → Blue LED'));
        o.datatype = 'range(0,31)';
        o.placeholder = '14';

        o = s.option(form.Value, 'csq_average', _('Average (≥)'), _('CSQ ≥ this value → Red+Green LED'));
        o.datatype = 'range(0,31)';
        o.placeholder = '10';

        // ── Actions ──────────────────────────────────────────────────────────
        s = m.section(form.TypedSection, 'ledstatus', _('Service Control'));
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Button, '_restart', _('Restart LED service'));
        o.inputstyle = 'action';
        o.inputtitle = _('Restart');
        o.onclick = function() {
            return ui.showModal(_('Restarting…'), [
                E('p', _('Restarting LED service, please wait…'))
            ], function() {}).then(function() {
                return fetch('/cgi-bin/luci/admin/system/aw1k-led/restart', { method: 'POST' });
            }).then(function() {
                ui.hideModal();
                ui.addNotification(null, E('p', _('LED service restarted.')), 'info');
            }).catch(function(e) {
                ui.hideModal();
                ui.addNotification(null, E('p', _('Failed: ') + e.message), 'error');
            });
        };

        return m.render();
    },

    handleSaveApply: function(ev) {
        return this.handleSave(ev).then(function() {
            // Reload the service after saving
            return fetch('/cgi-bin/luci/admin/system/aw1k-led/restart', { method: 'POST' });
        }).then(function() {
            ui.addNotification(null, E('p', _('Settings saved. LED service restarted.')), 'info');
        });
    }
});
