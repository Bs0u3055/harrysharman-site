#!/bin/bash
# schedule_carousel.sh — call this right after publishing a blog post
# Usage: bash schedule_carousel.sh <slug>
# Example: bash schedule_carousel.sh biggest-barrier-ai-adoption-identity
#
# Creates a cron job to fire 48 hours from now, which generates the carousel
# with Sonnet, sends the PDF to Harry for approval, then waits for "post it".

SLUG="$1"
if [ -z "$SLUG" ]; then
  echo "Usage: $0 <slug>"
  exit 1
fi

FIRE_AT=$(date -u -d "+48 hours" +%Y-%m-%dT%H:%M:%SZ)

echo "Scheduling carousel cron for slug=${SLUG} at ${FIRE_AT}"
echo "SLUG=${SLUG}" > /tmp/carousel_cron_args.env
echo "FIRE_AT=${FIRE_AT}" >> /tmp/carousel_cron_args.env
echo "Cron args written to /tmp/carousel_cron_args.env — Dobby will create the cron job."
