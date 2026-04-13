module("luci.controller.aw1k-led", package.seeall)

function index()
    entry({"admin", "system", "aw1k-led"},
        view("aw1k-led/settings"),
        _("AW1000 LEDs"), 60)
            .dependent = false

    entry({"admin", "system", "aw1k-led", "restart"},
        call("action_restart"))

    entry({"admin", "system", "aw1k-led", "restart_if_not_night"},
        call("action_restart_if_not_night"))

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

function action_restart_if_not_night()
    -- Only restart ledstatus if night mode is not currently active
    local blink_pid = "/tmp/led-night-blink.pid"
    local night_flag = "/tmp/led-night-active"
    local night_active = false

    local ff = io.open(night_flag, "r")
    if ff then
        ff:close()
        night_active = true
    end

    if not night_active then
        -- Backward-compatible fallback for old state where only blink PID exists.
        local f = io.open(blink_pid, "r")
        if f then
            local pid = f:read("*l")
            f:close()
            if pid and luci.sys.call("kill -0 " .. pid .. " 2>/dev/null") == 0 then
                night_active = true
            end
        end
    end

    if not night_active then
        luci.sys.call("/etc/init.d/ledstatus restart >/dev/null 2>&1")
    end
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
    -- Don't restart ledstatus if night mode is currently active
    local night_flag = "/tmp/led-night-active"
    local nf = io.open(night_flag, "r")
    if nf then
        nf:close()
    else
        luci.sys.call("/etc/init.d/ledstatus restart >/dev/null 2>&1")
    end
    luci.http.status(200, "OK")
    luci.http.prepare_content("text/plain")
    luci.http.write("OK")
end

function action_save_night()
    local enabled = luci.http.formvalue("night_enabled")
    local start   = luci.http.formvalue("night_start")
    local stop    = luci.http.formvalue("night_end")

    if not enabled or enabled == "" then
        enabled = luci.sys.exec("uci -q get ledstatus.settings.night_enabled 2>/dev/null"):gsub("%s+$", "")
    end
    if not start or start == "" then
        start = luci.sys.exec("uci -q get ledstatus.settings.night_start 2>/dev/null"):gsub("%s+$", "")
    end
    if not stop or stop == "" then
        stop = luci.sys.exec("uci -q get ledstatus.settings.night_end 2>/dev/null"):gsub("%s+$", "")
    end
    local function valid_time(t)
        if type(t) ~= "string" then return false end
        local hh, mm = t:match("^(%d%d?):(%d%d)$")
        if not hh or not mm then return false end
        hh = tonumber(hh)
        mm = tonumber(mm)
        if not hh or not mm then return false end
        return hh >= 0 and hh <= 23 and mm >= 0 and mm <= 59
    end

    enabled = (enabled == "1") and "1" or "0"
    if not valid_time(start) then start = "22:00" end
    if not valid_time(stop) then stop = "06:00" end

    luci.sys.call("uci set ledstatus.settings.night_enabled=" .. luci.util.shellquote(enabled))
    luci.sys.call("uci set ledstatus.settings.night_start="   .. luci.util.shellquote(start))
    luci.sys.call("uci set ledstatus.settings.night_end="     .. luci.util.shellquote(stop))
    luci.sys.call("uci commit ledstatus")
    luci.sys.call("crontab -l 2>/dev/null | grep -v '# aw1k-night-mode' | crontab -")

    if enabled == "1" then
        luci.sys.call("/usr/bin/led-night-mode.sh start-scheduler >/dev/null 2>&1")
        luci.sys.call("/usr/bin/led-night-mode.sh check >/dev/null 2>&1")
    else
        luci.sys.call("/usr/bin/led-night-mode.sh stop-scheduler >/dev/null 2>&1")
        luci.sys.call("/usr/bin/led-night-mode.sh off >/dev/null 2>&1")
        luci.sys.call("/usr/bin/led-status-check.sh >/dev/null 2>&1")
    end

    luci.http.status(200, "OK")
    luci.http.prepare_content("text/plain")
    luci.http.write("OK")
end
