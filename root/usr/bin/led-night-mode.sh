#!/bin/sh
# AW1000 Night Mode controller
# Usage: led-night-mode.sh on|off|check
#   on    - activate night mode (LEDs off, phone LED airplane blink)
#   off   - deactivate night mode (restore LEDs, restart ledstatus)
#   check - called by cron every minute to auto-activate/deactivate

STATUS_LEDS="green:5g blue:5g red:5g green:internet green:wifi green:signal blue:signal red:signal"
POWER_LED="/sys/class/leds/green:power"
BLINK_PID="/tmp/led-night-blink.pid"

# Airplane beacon: two quick blinks (150ms on, 150ms gap) then 3s off — runs in background
_start_blink() {
    python3 -c "
import time, sys
LED = '/sys/class/leds/green:power'
def w(f, v):
    open(LED + '/' + f, 'w').write(v)
w('trigger', 'none')
while True:
    w('brightness', '1'); time.sleep(0.15)
    w('brightness', '0'); time.sleep(0.15)
    w('brightness', '1'); time.sleep(0.15)
    w('brightness', '0'); time.sleep(3.0)
" &
    echo $! > "$BLINK_PID"
}

_stop_blink() {
    if [ -f "$BLINK_PID" ]; then
        kill "$(cat $BLINK_PID)" 2>/dev/null
        rm -f "$BLINK_PID"
    fi
}

night_on() {
    # Stop the led status service so it won't override
    /etc/init.d/ledstatus stop 2>/dev/null

    # Turn off all status LEDs
    for led in $STATUS_LEDS; do
        echo none > /sys/class/leds/$led/trigger
        echo 0    > /sys/class/leds/$led/brightness
    done

    # Phone LED: off
    echo none > /sys/class/leds/green:phone/trigger
    echo 0    > /sys/class/leds/green:phone/brightness

    # Power LED: airplane double-blink beacon
    _stop_blink
    _start_blink

    logger -t led-night-mode "Night Mode activated"
}

night_off() {
    # Stop blink loop and restore power LED to solid on
    _stop_blink
    echo none > "$POWER_LED/trigger"
    echo 1    > "$POWER_LED/brightness"

    # Restart the LED status service to restore all status LEDs
    /etc/init.d/ledstatus start 2>/dev/null

    logger -t led-night-mode "Night Mode deactivated"
}

check_schedule() {
    ENABLED=$(uci get ledstatus.settings.night_enabled 2>/dev/null)
    [ "$ENABLED" != "1" ] && return

    START=$(uci get ledstatus.settings.night_start 2>/dev/null)
    END=$(uci get ledstatus.settings.night_end 2>/dev/null)
    [ -z "$START" ] && START="22:00"
    [ -z "$END"   ] && END="06:00"

    NOW_H=$(date +%H)
    NOW_M=$(date +%M)
    NOW_MINS=$(( NOW_H * 60 + NOW_M ))

    START_H=$(echo "$START" | cut -d: -f1 | sed 's/^0*//')
    START_M=$(echo "$START" | cut -d: -f2 | sed 's/^0*//')
    START_MINS=$(( ${START_H:-0} * 60 + ${START_M:-0} ))

    END_H=$(echo "$END" | cut -d: -f1 | sed 's/^0*//')
    END_M=$(echo "$END" | cut -d: -f2 | sed 's/^0*//')
    END_MINS=$(( ${END_H:-0} * 60 + ${END_M:-0} ))

    # Determine if we are inside the night window
    # Handles overnight ranges (e.g. 22:00 -> 06:00) and same-day (e.g. 01:00 -> 05:00)
    if [ "$START_MINS" -lt "$END_MINS" ]; then
        # Same-day window
        if [ "$NOW_MINS" -ge "$START_MINS" ] && [ "$NOW_MINS" -lt "$END_MINS" ]; then
            IN_WINDOW=1
        else
            IN_WINDOW=0
        fi
    else
        # Overnight window (start >= end means it crosses midnight)
        if [ "$NOW_MINS" -ge "$START_MINS" ] || [ "$NOW_MINS" -lt "$END_MINS" ]; then
            IN_WINDOW=1
        else
            IN_WINDOW=0
        fi
    fi

    # Use PID file as proxy for "night is active"
    if [ -f "$BLINK_PID" ] && kill -0 "$(cat $BLINK_PID)" 2>/dev/null; then
        NIGHT_ACTIVE=1
    else
        NIGHT_ACTIVE=0
    fi

    if [ "$IN_WINDOW" -eq 1 ] && [ "$NIGHT_ACTIVE" -eq 0 ]; then
        night_on
    elif [ "$IN_WINDOW" -eq 0 ] && [ "$NIGHT_ACTIVE" -eq 1 ]; then
        night_off
    fi
}

case "$1" in
    on)    night_on ;;
    off)   night_off ;;
    check) check_schedule ;;
    *)
        echo "Usage: $0 on|off|check"
        exit 1
        ;;
esac
