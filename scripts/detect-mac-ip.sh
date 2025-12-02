#!/bin/bash
# Detect Mac's IP address for Metro bundler connection

# Try common network interfaces in order of preference
for interface in en0 en1 eth0; do
  ip=$(ipconfig getifaddr $interface 2>/dev/null)
  if [ -n "$ip" ]; then
    echo "$ip"
    exit 0
  fi
done

# Fallback: try to get any non-loopback IPv4 address
ip=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n1)

if [ -n "$ip" ]; then
  echo "$ip"
  exit 0
fi

# Last resort: return localhost (won't work but won't crash)
echo "127.0.0.1"
exit 1

