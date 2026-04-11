#!/bin/sh
# AW1000 Night Mode controller
# Usage: led-night-mode.sh on|off|check
#   on    - activate night mode (LEDs off, phone LED airplane blink)
#   off   - deactivate night mode (restore LEDs, restart ledstatus)
#   check - called by cron every minute to auto-activate/deactivate

STATUS_LEDS="green:5g blue:5g red:5g green:internet green:wifi green:signal blue:signal red:signal"

night_on() {
    # Stop the led status service so it won't override
    /etc/init.d/ledstatus stop 2>/dev/null

    # Turn off all status LEDs
    for led in $STATUS_LEDS; do
        echo none      > /sys/class/leds/$led/trigger
        echo 0         > /sys/class/leds/$led/brightness
    done

    # Phone LED: slow airplane-style blink via timer trigger (1500ms on / 1500ms off)
    echo timer > /sys/class/leds/green:phone/trigger
    echo 1500  > /sys/class/leds/green:phone/delay_on
    echo 1500  > /sys/class/leds/green:phone/delay_off

    # Power LED stays untouched
    logger -t led-night-mode "Night Mode activated"
}

night_off() {
    # Stop phone LED blink
    echo none > /sys/class/leds/green:phone/trigger
    echo 0    > /sys/class/leds/green:phone/brightness

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

    START_H=$(echo "$START" | cut -d: -f1)
    START_M=$(echo "$START" | cut -d: -f2)
    START_MINS=$(( 10#$START_H * 60 + 10#$START_M ))

    END_H=$(echo "$END" | cut -d: -f1)
    END_M=$(echo "$END" | cut -d: -f2)
    END_MINS=$(( 10#$END_H * 60 + 10#$END_M ))

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

    # Only act at boundary minutes to avoid re-triggering every minute
    # Check if phone LED is currently in timer mode as proxy for "night is active"
    PHONE_TRIGGER=$(cat /sys/class/leds/green:phone/trigger 2>/dev/null | grep -o '\[timer\]')

    if [ "$IN_WINDOW" -eq 1 ] && [ -z "$PHONE_TRIGGER" ]; then
        night_on
    elif [ "$IN_WINDOW" -eq 0 ] && [ -n "$PHONE_TRIGGER" ]; then
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
