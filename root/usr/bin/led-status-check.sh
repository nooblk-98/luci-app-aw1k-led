#!/bin/sh
# AW1000 LED Status Monitor
# Reads thresholds and settings from UCI: uci get ledstatus.settings.*

# --- Helpers ---
on_led()    { echo none      > /sys/class/leds/$1/trigger; echo 1 > /sys/class/leds/$1/brightness; }
off_led()   { echo none      > /sys/class/leds/$1/trigger; echo 0 > /sys/class/leds/$1/brightness; }
blink_led() { echo heartbeat > /sys/class/leds/$1/trigger; }

# --- Load UCI settings ---
COMM=$(uci get ledstatus.settings.modem_port 2>/dev/null)
[ -z "$COMM" ] && COMM="/dev/ttyUSB2"

SINR_EXCELLENT=$(uci get ledstatus.settings.sinr_excellent 2>/dev/null); [ -z "$SINR_EXCELLENT" ] && SINR_EXCELLENT=25
SINR_GOOD=$(uci get ledstatus.settings.sinr_good 2>/dev/null);           [ -z "$SINR_GOOD"      ] && SINR_GOOD=15
SINR_AVERAGE=$(uci get ledstatus.settings.sinr_average 2>/dev/null);     [ -z "$SINR_AVERAGE"   ] && SINR_AVERAGE=5

CSQ_EXCELLENT=$(uci get ledstatus.settings.csq_excellent 2>/dev/null);   [ -z "$CSQ_EXCELLENT"  ] && CSQ_EXCELLENT=20
CSQ_GOOD=$(uci get ledstatus.settings.csq_good 2>/dev/null);             [ -z "$CSQ_GOOD"       ] && CSQ_GOOD=14
CSQ_AVERAGE=$(uci get ledstatus.settings.csq_average 2>/dev/null);       [ -z "$CSQ_AVERAGE"    ] && CSQ_AVERAGE=10

# --- 5G SINR (green:5g / blue:5g / red:5g) ---
QENG_DATA=$(sms_tool -d "$COMM" at 'at+qeng="servingcell"' 2>/dev/null | tr -d '\r')
QENG_LINE=$(echo "$QENG_DATA" | grep -E 'QENG: "NR5G' | head -n1)
SINR=$(echo "$QENG_LINE" | awk -F',' '{print $6}' | grep -oE '[-0-9.]+')

off_led "green:5g"; off_led "blue:5g"; off_led "red:5g"

if [ -z "$SINR" ]; then
    on_led "red:5g"
    echo "5G: NO SIGNAL"
else
    SINR_INT=$(printf "%.0f" "$SINR" 2>/dev/null)
    if   [ "$SINR_INT" -ge "$SINR_EXCELLENT" ]; then
        on_led "green:5g";                              echo "5G: Excellent (SINR=$SINR_INT)"
    elif [ "$SINR_INT" -ge "$SINR_GOOD" ]; then
        on_led "blue:5g";                               echo "5G: Good (SINR=$SINR_INT)"
    elif [ "$SINR_INT" -ge "$SINR_AVERAGE" ]; then
        on_led "red:5g"; on_led "green:5g";             echo "5G: Average (SINR=$SINR_INT)"
    else
        blink_led "red:5g"; blink_led "green:5g"; blink_led "blue:5g"
        echo "5G: Very Bad (SINR=$SINR_INT)"
    fi
fi

# --- Internet connection (green:internet) ---
found=0
ip link show wwan0_1 >/dev/null 2>&1 && ip route show dev wwan0_1 | grep -q '^default' && found=1
ip link show wwan0   >/dev/null 2>&1 && ip route show dev wwan0   | grep -q '^default' && found=1

if [ "$found" -eq 1 ]; then
    on_led "green:internet"; echo "Internet: Connected"
else
    blink_led "green:internet"; echo "Internet: Not connected"
fi

# --- WiFi (green:wifi) ---
WIFI_STATUS=$(uci get wireless.@wifi-device[0].disabled 2>/dev/null)
if [ "$WIFI_STATUS" = "1" ]; then
    off_led "green:wifi"; echo "WiFi: Disabled"
else
    on_led "green:wifi";  echo "WiFi: Enabled"
fi

# --- CSQ Signal (green:signal / blue:signal / red:signal) ---
CSQ=$(sms_tool -d "$COMM" at 'at+csq' 2>/dev/null \
    | grep -oE '\+csq: [0-9]+,[0-9]+' \
    | awk -F'[:,]' '{print $2}' \
    | tr -d '\r\n ')

off_led "green:signal"; off_led "blue:signal"; off_led "red:signal"

if [ "$found" -eq 1 ]; then
    if [ -n "$CSQ" ]; then
        if   [ "$CSQ" -ge "$CSQ_EXCELLENT" ]; then
            on_led "green:signal";                       echo "Signal: Excellent (CSQ=$CSQ)"
        elif [ "$CSQ" -ge "$CSQ_GOOD" ]; then
            on_led "blue:signal";                        echo "Signal: Good (CSQ=$CSQ)"
        elif [ "$CSQ" -ge "$CSQ_AVERAGE" ]; then
            on_led "red:signal"; on_led "green:signal";  echo "Signal: Average (CSQ=$CSQ)"
        else
            blink_led "red:signal";                      echo "Signal: Very Weak (CSQ=$CSQ)"
        fi
    else
        echo "Signal: CSQ not detected"
    fi
else
    on_led "red:signal"; echo "Signal: Internet Disconnected (CSQ=$CSQ)"
fi
