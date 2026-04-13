#!/bin/sh
# AW1000 Night Mode controller
# Usage: led-night-mode.sh on|off|check|start-scheduler|stop-scheduler|run-scheduler

STATUS_LEDS="green:5g blue:5g red:5g green:internet green:wifi green:signal blue:signal red:signal"
POWER_LED="/sys/class/leds/green:power"
BLINK_PID="/tmp/led-night-blink.pid"
NIGHT_ACTIVE_FLAG="/tmp/led-night-active"
BLINK_MARKER="aw1k_led_night_blink"
SCHED_PID="/tmp/led-night-scheduler.pid"

valid_time() {
    case "$1" in
        [0-1][0-9]:[0-5][0-9]|2[0-3]:[0-5][0-9]|[0-9]:[0-5][0-9]) return 0 ;;
        *) return 1 ;;
    esac
}

time_to_mins() {
    echo "$1" | awk -F: '{print ($1+0) * 60 + ($2+0)}'
}

is_night_active() {
    [ -f "$NIGHT_ACTIVE_FLAG" ]
}

# Airplane beacon: two quick blinks (150ms on, 150ms gap) then 3s off — runs in background
_start_blink() {
    python3 -c "
import time
LED = '/sys/class/leds/green:power'
def w(f, v):
    open(LED + '/' + f, 'w').write(v)
w('trigger', 'none')
while True:
    w('brightness', '1'); time.sleep(0.15)
    w('brightness', '0'); time.sleep(0.15)
    w('brightness', '1'); time.sleep(0.15)
    w('brightness', '0'); time.sleep(3.0)
" "$BLINK_MARKER" &
    echo $! > "$BLINK_PID"
}

_stop_blink() {
    if [ -f "$BLINK_PID" ]; then
        kill "$(cat "$BLINK_PID")" 2>/dev/null
        rm -f "$BLINK_PID"
    fi

    if command -v pgrep >/dev/null 2>&1; then
        pgrep -f "$BLINK_MARKER" | while read -r pid; do
            [ -n "$pid" ] && kill "$pid" 2>/dev/null
        done
        pgrep -f "/sys/class/leds/green:power" | while read -r pid; do
            [ -n "$pid" ] && kill "$pid" 2>/dev/null
        done
    else
        ps | grep "$BLINK_MARKER" | grep -v grep | awk '{print $1}' | while read -r pid; do
            [ -n "$pid" ] && kill "$pid" 2>/dev/null
        done
        ps | grep "/sys/class/leds/green:power" | grep -v grep | awk '{print $1}' | while read -r pid; do
            [ -n "$pid" ] && kill "$pid" 2>/dev/null
        done
    fi

    rm -f "$BLINK_PID"
}

night_on() {
    # Stop the LED status service so it won't override night LEDs
    /etc/init.d/ledstatus stop 2>/dev/null

    for led in $STATUS_LEDS; do
        echo none > "/sys/class/leds/$led/trigger"
        echo 0    > "/sys/class/leds/$led/brightness"
    done

    echo none > /sys/class/leds/green:phone/trigger
    echo 0    > /sys/class/leds/green:phone/brightness

    _stop_blink
    _start_blink
    touch "$NIGHT_ACTIVE_FLAG"

    logger -t led-night-mode "Night Mode activated"
}

night_off() {
    _stop_blink
    echo none > "$POWER_LED/trigger"
    echo 1    > "$POWER_LED/brightness"

    rm -f "$NIGHT_ACTIVE_FLAG"

    # Restart normal LED service and refresh once
    /etc/init.d/ledstatus start 2>/dev/null
    /usr/bin/led-status-check.sh >/dev/null 2>&1

    logger -t led-night-mode "Night Mode deactivated"
}

# Sets IN_WINDOW and NEXT_CHANGE_MINS globals
calc_window_state() {
    START="$1"
    END="$2"

    valid_time "$START" || START="22:00"
    valid_time "$END"   || END="06:00"

    NOW_MINS=$(date +%H:%M | awk -F: '{print ($1+0) * 60 + ($2+0)}')
    START_MINS=$(time_to_mins "$START")
    END_MINS=$(time_to_mins "$END")

    if [ "$START_MINS" -eq "$END_MINS" ]; then
        IN_WINDOW=0
        NEXT_CHANGE_MINS=1440
        return
    fi

    if [ "$START_MINS" -lt "$END_MINS" ]; then
        # Same-day window
        if [ "$NOW_MINS" -ge "$START_MINS" ] && [ "$NOW_MINS" -lt "$END_MINS" ]; then
            IN_WINDOW=1
            NEXT_CHANGE_MINS=$(( END_MINS - NOW_MINS ))
        elif [ "$NOW_MINS" -lt "$START_MINS" ]; then
            IN_WINDOW=0
            NEXT_CHANGE_MINS=$(( START_MINS - NOW_MINS ))
        else
            IN_WINDOW=0
            NEXT_CHANGE_MINS=$(( 1440 - NOW_MINS + START_MINS ))
        fi
    else
        # Overnight window
        if [ "$NOW_MINS" -ge "$START_MINS" ] || [ "$NOW_MINS" -lt "$END_MINS" ]; then
            IN_WINDOW=1
            if [ "$NOW_MINS" -lt "$END_MINS" ]; then
                NEXT_CHANGE_MINS=$(( END_MINS - NOW_MINS ))
            else
                NEXT_CHANGE_MINS=$(( 1440 - NOW_MINS + END_MINS ))
            fi
        else
            IN_WINDOW=0
            NEXT_CHANGE_MINS=$(( START_MINS - NOW_MINS ))
        fi
    fi

    [ "$NEXT_CHANGE_MINS" -lt 1 ] && NEXT_CHANGE_MINS=1
}

check_schedule() {
    ENABLED=$(uci get ledstatus.settings.night_enabled 2>/dev/null)
    START=$(uci get ledstatus.settings.night_start 2>/dev/null)
    END=$(uci get ledstatus.settings.night_end 2>/dev/null)

    if [ "$ENABLED" != "1" ]; then
        is_night_active && night_off
        return
    fi

    calc_window_state "$START" "$END"

    if [ "$IN_WINDOW" -eq 1 ]; then
        is_night_active || night_on
    else
        is_night_active && night_off
    fi
}

run_scheduler() {
    while true; do
        ENABLED=$(uci get ledstatus.settings.night_enabled 2>/dev/null)
        START=$(uci get ledstatus.settings.night_start 2>/dev/null)
        END=$(uci get ledstatus.settings.night_end 2>/dev/null)

        if [ "$ENABLED" != "1" ]; then
            is_night_active && night_off
            rm -f "$SCHED_PID"
            exit 0
        fi

        calc_window_state "$START" "$END"

        if [ "$IN_WINDOW" -eq 1 ]; then
            is_night_active || night_on
        else
            is_night_active && night_off
        fi

        sleep $(( NEXT_CHANGE_MINS * 60 ))
    done
}

start_scheduler() {
    if [ -f "$SCHED_PID" ] && kill -0 "$(cat "$SCHED_PID")" 2>/dev/null; then
        return
    fi

    /usr/bin/led-night-mode.sh run-scheduler >/dev/null 2>&1 &
    echo $! > "$SCHED_PID"
}

stop_scheduler() {
    if [ -f "$SCHED_PID" ]; then
        kill "$(cat "$SCHED_PID")" 2>/dev/null
        rm -f "$SCHED_PID"
    fi
}

case "$1" in
    on)              night_on ;;
    off)             night_off ;;
    check)           check_schedule ;;
    run-scheduler)   run_scheduler ;;
    start-scheduler) start_scheduler ;;
    stop-scheduler)  stop_scheduler ;;
    *)
        echo "Usage: $0 on|off|check|start-scheduler|stop-scheduler|run-scheduler"
        exit 1
        ;;
esac
