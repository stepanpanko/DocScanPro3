#!/bin/bash
# Wait for Metro bundler to be ready

echo "Waiting for Metro bundler to start..."
timeout=30
while [ $timeout -gt 0 ]; do
  if curl -s http://127.0.0.1:8081/status > /dev/null 2>&1; then
    echo "✓ Metro bundler is ready!"
    exit 0
  fi
  sleep 1
  timeout=$((timeout-1))
  echo -n "."
done

echo ""
echo "✗ Metro bundler failed to start within 30 seconds"
echo "Check Metro logs: tail -f /tmp/metro.log"
exit 1

