module("luci.controller.aw1k-led", package.seeall)

function index()
    entry({"admin", "system", "aw1k-led"},
        view("aw1k-led/settings"),
        _("AW1000 LEDs"), 60)
            .dependent = false

    entry({"admin", "system", "aw1k-led", "restart"},
        call("action_restart"))

    entry({"admin", "system", "aw1k-led", "runcmd"},
        call("action_runcmd"))

    entry({"admin", "system", "aw1k-led", "save_night"},
        call("action_save_night"))

    entry({"admin", "system", "aw1k-led", "save_colors"},
        call("action_save_colors"))
end

function action_restart()
    luci.sys.call("/etc/init.d/ledstatus restart >/dev/null 2>&1")
    luci.http.status(200, "OK")
    luci.http.prepare_content("text/plain")
    luci.http.write("OK")
end

function action_runcmd()
    local cmd = luci.http.formvalue("cmd") or ""
    -- Wrap in subshell so any trailing redirects in cmd are not broken
    luci.sys.call("(" .. cmd .. ") 2>/dev/null")
    luci.http.status(200, "OK")
    luci.http.prepare_content("text/plain")
    luci.http.write("OK")
end

function action_save_colors()
    local valid = { off=1, red=1, green=1, blue=1, yellow=1, cyan=1, magenta=1, white=1 }
    local keys = {
        "color_5g_excellent","color_5g_good","color_5g_average","color_5g_poor","color_5g_none",
        "color_sig_excellent","color_sig_good","color_sig_average","color_sig_weak","color_sig_offline"
    }
    for _, k in ipairs(keys) do
        local v = luci.http.formvalue(k) or ""
        if valid[v] then
            luci.sys.call("uci set ledstatus.settings." .. k .. "=" .. luci.util.shellquote(v))
        end
    end
    luci.sys.call("uci commit ledstatus")
    luci.sys.call("/etc/init.d/ledstatus restart >/dev/null 2>&1")
    luci.http.status(200, "OK")
    luci.http.prepare_content("text/plain")
    luci.http.write("OK")
end

function action_save_night()
    local enabled = luci.http.formvalue("night_enabled") or "0"
    local start   = luci.http.formvalue("night_start")   or "22:00"
    local stop    = luci.http.formvalue("night_end")     or "06:00"

    luci.sys.call("uci set ledstatus.settings.night_enabled=" .. luci.util.shellquote(enabled))
    luci.sys.call("uci set ledstatus.settings.night_start="   .. luci.util.shellquote(start))
    luci.sys.call("uci set ledstatus.settings.night_end="     .. luci.util.shellquote(stop))
    luci.sys.call("uci commit ledstatus")

    -- Install or remove the cron entry
    local cron_tag = "# aw1k-night-mode"
    luci.sys.call("crontab -l 2>/dev/null | grep -v '" .. cron_tag .. "' | crontab -")
    if enabled == "1" then
        luci.sys.call("(crontab -l 2>/dev/null; echo '* * * * * /usr/bin/led-night-mode.sh check " .. cron_tag .. "') | crontab -")
    end

    luci.http.status(200, "OK")
    luci.http.prepare_content("text/plain")
    luci.http.write("OK")
end
