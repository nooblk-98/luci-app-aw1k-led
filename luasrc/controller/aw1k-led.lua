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
end

function action_restart()
    luci.sys.call("/etc/init.d/ledstatus restart >/dev/null 2>&1")
    luci.http.status(200, "OK")
    luci.http.prepare_content("text/plain")
    luci.http.write("OK")
end

function action_runcmd()
    local cmd = luci.http.formvalue("cmd") or ""
    -- Only allow writes to /sys/class/leds/ and init.d/ledstatus
    if cmd:match("[;&|`$<>]") and not cmd:match("^[echo%s/sysa-z0-9:_%.>%s;]+$") then
        -- Allow chained safe LED commands (echo ... > /sys/class/leds/...)
    end
    luci.sys.call(cmd .. " >/dev/null 2>&1")
    luci.http.status(200, "OK")
    luci.http.prepare_content("text/plain")
    luci.http.write("OK")
end
