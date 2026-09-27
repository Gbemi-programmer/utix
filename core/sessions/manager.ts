import {
  CrossDeviceSession,
  SessionDevice,
  StateSync,
  StateChange,
  SyncConflict,
  ConflictResolution,
  SessionConfig,
} from './types';

class CrossDeviceSessionManager {
  private sessions: Map<string, CrossDeviceSession> = new Map();
  private stateSyncs: Map<string, StateSync[]> = new Map();

  private defaultConfig: SessionConfig = {
    conflictStrategy: 'last-write-wins',
    maxDevices: 5,
    syncIntervalMs: 5000,
    timeoutMs: 30000,
    primaryDeviceStrategy: 'most-recent',
  };

  constructor(private config: Partial<SessionConfig> = {}) {
    this.config = { ...this.defaultConfig, ...config };
  }

  createSession(userId: string, device: Omit<SessionDevice, 'id' | 'active'>): CrossDeviceSession {
    const session: CrossDeviceSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId,
      createdAt: new Date(),
      devices: [
        {
          ...device,
          id: `device-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          active: true,
          lastActivity: new Date(),
        },
      ],
      primaryDevice: '',
      state: {},
      conflicts: [],
      syncToken: this.generateSyncToken(),
      lastSync: new Date(),
    };

    session.primaryDevice = session.devices[0].id;
    this.sessions.set(session.id, session);
    this.stateSyncs.set(session.id, []);

    return session;
  }

  private generateSyncToken(): string {
    return `token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  addDevice(
    sessionId: string,
    device: Omit<SessionDevice, 'id' | 'active'>,
  ): SessionDevice | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.devices.length >= (this.config.maxDevices || 5)) {
      // Remove least active device
      const leastActive = session.devices.reduce((prev, curr) =>
        prev.lastActivity < curr.lastActivity ? prev : curr,
      );
      session.devices = session.devices.filter(d => d.id !== leastActive.id);
    }

    const newDevice: SessionDevice = {
      ...device,
      id: `device-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      active: true,
      lastActivity: new Date(),
    };

    session.devices.push(newDevice);

    // Update primary device based on strategy
    this.updatePrimaryDevice(session);

    return newDevice;
  }

  private updatePrimaryDevice(session: CrossDeviceSession): void {
    const strategy = this.config.primaryDeviceStrategy || 'most-recent';

    switch (strategy) {
      case 'first-active':
        const firstActive = session.devices.find(d => d.active);
        if (firstActive) session.primaryDevice = firstActive.id;
        break;

      case 'most-recent':
        const mostRecent = session.devices.reduce((prev, curr) =>
          prev.lastActivity > curr.lastActivity ? prev : curr,
        );
        session.primaryDevice = mostRecent.id;
        break;

      case 'manual':
        // Keep existing primary device
        break;
    }
  }

  syncState(sessionId: string, deviceId: string, state: Record<string, unknown>): StateSync {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const device = session.devices.find(d => d.id === deviceId);
    if (!device) throw new Error(`Device ${deviceId} not found in session`);

    // Calculate changes
    const changes = this.calculateChanges(session.state, state);

    // Check for conflicts
    const conflicts = this.detectConflicts(session, deviceId, state);

    if (conflicts.length > 0) {
      const resolved = this.resolveConflicts(session, conflicts);

      for (const resolution of resolved) {
        session.conflicts.push(resolution);
        // Apply resolution to state
        const [obj, key] = this.navigateToPath(session.state, resolution.field);
        if (obj && key) {
          obj[key] = resolution.resolution;
        }
      }
    }

    // Update session state
    for (const change of changes) {
      const [obj, key] = this.navigateToPath(session.state, change.path);
      if (obj && key) {
        if (change.operation === 'delete') {
          delete obj[key];
        } else {
          obj[key] = change.value;
        }
      }
    }

    // Update device activity
    device.lastActivity = new Date();

    // Create sync record
    const sync: StateSync = {
      deviceId,
      timestamp: new Date(),
      version: (this.stateSyncs.get(sessionId) || []).length + 1,
      state: JSON.parse(JSON.stringify(session.state)),
      changes,
    };

    const syncs = this.stateSyncs.get(sessionId) || [];
    syncs.push(sync);
    this.stateSyncs.set(sessionId, syncs);

    session.lastSync = new Date();
    session.syncToken = this.generateSyncToken();

    return sync;
  }

  private calculateChanges(
    previousState: Record<string, unknown>,
    newState: Record<string, unknown>,
  ): StateChange[] {
    const changes: StateChange[] = [];

    // Find new or updated values
    for (const [key, value] of Object.entries(newState)) {
      if (JSON.stringify(previousState[key]) !== JSON.stringify(value)) {
        changes.push({
          path: key,
          operation: previousState[key] === undefined ? 'set' : 'update',
          value,
          oldValue: previousState[key],
          timestamp: new Date(),
        });
      }
    }

    // Find deleted values
    for (const key of Object.keys(previousState)) {
      if (!(key in newState)) {
        changes.push({
          path: key,
          operation: 'delete',
          oldValue: previousState[key],
          timestamp: new Date(),
        });
      }
    }

    return changes;
  }

  private detectConflicts(
    session: CrossDeviceSession,
    deviceId: string,
    newState: Record<string, unknown>,
  ): SyncConflict[] {
    const conflicts: SyncConflict[] = [];

    const syncs = this.stateSyncs.get(session.id) || [];
    if (syncs.length < 2) return conflicts;

    const lastOtherSync = syncs.findLast(s => s.deviceId !== deviceId);
    if (!lastOtherSync) return conflicts;

    for (const [key, value] of Object.entries(newState)) {
      if (
        lastOtherSync.state[key] !== undefined &&
        JSON.stringify(lastOtherSync.state[key]) !== JSON.stringify(value) &&
        JSON.stringify(session.state[key]) !== JSON.stringify(lastOtherSync.state[key])
      ) {
        conflicts.push({
          field: key,
          device1Id: deviceId,
          device1Value: value,
          device1Timestamp: new Date(),
          device2Id: lastOtherSync.deviceId,
          device2Value: lastOtherSync.state[key],
          device2Timestamp: lastOtherSync.timestamp,
        });
      }
    }

    return conflicts;
  }

  private resolveConflicts(session: CrossDeviceSession, conflicts: SyncConflict[]): ConflictResolution[] {
    const resolutions: ConflictResolution[] = [];
    const strategy = this.config.conflictStrategy || 'last-write-wins';

    for (const conflict of conflicts) {
      let resolution: unknown;
      let resolveStrategy = strategy;

      switch (strategy) {
        case 'last-write-wins':
          resolution =
            conflict.device1Timestamp > conflict.device2Timestamp
              ? conflict.device1Value
              : conflict.device2Value;
          break;

        case 'device-priority':
          resolution =
            conflict.device1Id === session.primaryDevice
              ? conflict.device1Value
              : conflict.device2Value;
          resolveStrategy = 'device-priority';
          break;

        case 'manual':
          // Return unresolved for manual review
          resolution = null;
          break;
      }

      resolutions.push({
        id: `resolution-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date(),
        field: conflict.field,
        deviceAValue: conflict.device1Value,
        deviceBValue: conflict.device2Value,
        resolution,
        strategy: resolveStrategy as 'last-write-wins' | 'device-priority' | 'manual',
        resolvedBy: 'system',
      });
    }

    return resolutions;
  }

  private navigateToPath(obj: Record<string, unknown>, path: string): [Record<string, unknown>, string | null] {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }

    return [current, parts[parts.length - 1]];
  }

  getSession(sessionId: string): CrossDeviceSession | undefined {
    return this.sessions.get(sessionId);
  }

  getDeviceStatus(sessionId: string): Array<{
    id: string;
    name: string;
    active: boolean;
    lastActivity: Date;
    isPrimary: boolean;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.devices.map(d => ({
      id: d.id,
      name: d.deviceName,
      active: d.active,
      lastActivity: d.lastActivity,
      isPrimary: d.id === session.primaryDevice,
    }));
  }

  updateDeviceStatus(sessionId: string, deviceId: string, active: boolean): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const device = session.devices.find(d => d.id === deviceId);
    if (!device) return false;

    device.active = active;
    device.lastActivity = new Date();

    if (active) {
      this.updatePrimaryDevice(session);
    }

    return true;
  }

  getConflictHistory(sessionId: string, limit: number = 50): ConflictResolution[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.conflicts.slice(-limit);
  }

  getSyncHistory(sessionId: string, limit: number = 50): StateSync[] {
    const syncs = this.stateSyncs.get(sessionId) || [];
    return syncs.slice(-limit);
  }

  cleanup(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Mark all devices as inactive
    session.devices.forEach(d => (d.active = false));

    // Keep data for 30 days
    return true;
  }
}

export const sessionManager = new CrossDeviceSessionManager();
