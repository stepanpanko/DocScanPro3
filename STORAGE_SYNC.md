# Storage & Cross-Device Sync Architecture

## Current Implementation

### Local Storage Only
Currently, the app stores all data **locally on each device**:

1. **Metadata** (documents list, folders list): Stored in MMKV (local key-value store)
2. **Document Files** (scanned images): Stored in `Documents/DocScanPro/` directory

### iCloud Backup (iOS)
- Files in the `Documents` directory are **automatically backed up to iCloud** if:
  - User has iCloud enabled on their device
  - User has iCloud backup enabled for the app
  - The app has proper iCloud entitlements (configured in `Info.plist`)

**Important**: iCloud backup is **not real-time sync**. It's a backup that:
- Happens automatically in the background
- Restores when you restore a device from backup
- Does NOT sync between multiple devices in real-time

## Future Cloud Sync Options

The app now includes a storage abstraction layer (`src/storage-sync.ts`) that can be extended to support real-time cloud synchronization.

### Option 1: CloudKit (iOS/macOS - Recommended for Apple Ecosystem)

**Pros:**
- Native Apple solution, free for users
- Automatic sync across all user's Apple devices
- Secure, private, end-to-end encrypted
- No backend server needed
- Works offline with automatic sync when online

**Cons:**
- iOS/macOS only (no Android)
- Requires Apple Developer account setup
- More complex implementation

**Implementation Steps:**
1. Enable CloudKit in Xcode project capabilities
2. Create CloudKit schema in CloudKit Dashboard
3. Implement CloudKit adapter in `storage-sync.ts`
4. Use `CKContainer` and `CKDatabase` APIs

**Resources:**
- [CloudKit Documentation](https://developer.apple.com/cloudkit/)
- [React Native CloudKit](https://github.com/react-native-cloudkit/react-native-cloudkit) (community library)

### Option 2: Firebase (Cross-Platform)

**Pros:**
- Works on iOS, Android, and Web
- Real-time sync with Firestore
- File storage with Firebase Storage
- Authentication built-in
- Free tier available

**Cons:**
- Requires Google account
- Costs scale with usage
- Requires backend setup

**Implementation Steps:**
1. Install `@react-native-firebase/app`, `@react-native-firebase/firestore`, `@react-native-firebase/storage`
2. Configure Firebase project
3. Implement Firebase adapter in `storage-sync.ts`
4. Add authentication flow

**Resources:**
- [React Native Firebase](https://rnfirebase.io/)
- [Firebase Documentation](https://firebase.google.com/docs)

### Option 3: Custom Backend (Most Flexible)

**Pros:**
- Full control over sync logic
- Can use any cloud provider (AWS, Azure, GCP)
- Custom business logic
- Can support web version

**Cons:**
- Most complex to implement
- Requires server infrastructure
- Ongoing maintenance
- Costs for hosting

**Implementation Steps:**
1. Set up backend API (Node.js, Python, etc.)
2. Implement REST or GraphQL API
3. Add authentication (JWT, OAuth, etc.)
4. Implement custom adapter in `storage-sync.ts`
5. Add conflict resolution logic

## Current Data Storage Locations

### iOS
- **Metadata**: MMKV database (in app's container)
- **Files**: `Documents/DocScanPro/` (backed up to iCloud automatically)

### Android (when implemented)
- **Metadata**: MMKV database (in app's data directory)
- **Files**: App's document directory

## Migration Path

When implementing cloud sync:

1. **Phase 1**: Keep local storage as primary, add cloud sync as secondary
2. **Phase 2**: Implement conflict resolution (last-write-wins or merge strategy)
3. **Phase 3**: Add sync status UI to show sync progress
4. **Phase 4**: Add offline queue for changes made while offline

## Testing Cross-Device Sync

### Current (iCloud Backup):
1. Create documents on Device A
2. Wait for iCloud backup (can take hours)
3. Restore Device B from iCloud backup
4. Documents should appear on Device B

### Future (Real-time Sync):
1. Create documents on Device A
2. Documents appear on Device B within seconds
3. Changes sync bidirectionally
4. Works even when one device is offline (queues changes)

## Recommendations

For a production app, I recommend:

1. **Short-term**: Rely on iCloud backup (already configured)
   - Works automatically
   - No additional code needed
   - Good for single-device users

2. **Medium-term**: Implement CloudKit sync
   - Best user experience for Apple users
   - Native, secure, free
   - Real-time sync across devices

3. **Long-term**: Add Firebase for Android support
   - Cross-platform solution
   - Unified codebase
   - Real-time sync everywhere

## Code Structure

The sync abstraction is in `src/storage-sync.ts`:

```typescript
// Current: Local storage only
import { getStorageAdapter } from './src/storage-sync';
const adapter = getStorageAdapter(); // Returns LocalStorageAdapter

// Future: Switch to CloudKit
import { setStorageAdapter, CloudKitAdapter } from './src/storage-sync';
setStorageAdapter(new CloudKitAdapter());
```

The app automatically calls `syncAllData()` whenever documents or folders change, so when you implement a cloud adapter, sync will happen automatically.

