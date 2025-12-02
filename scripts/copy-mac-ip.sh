#!/bin/bash
# Copy MacIP.txt to app bundle resources
# This script should be run as an Xcode build phase

if [ -f "${SRCROOT}/DocScanPro3Temp/MacIP.txt" ]; then
  cp "${SRCROOT}/DocScanPro3Temp/MacIP.txt" "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/MacIP.txt"
  echo "Copied MacIP.txt to bundle resources"
else
  echo "Warning: MacIP.txt not found in source directory"
fi

