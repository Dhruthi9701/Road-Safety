import { DemoModeManager } from '../../src/demo/DemoModeManager';

jest.mock('@react-native-async-storage/async-storage');

describe('DemoModeManager', () => {
  let manager: DemoModeManager;

  beforeEach(() => {
    manager = DemoModeManager.getInstance();
  });

  describe('Demo Mode Toggle', () => {
    it('should enable demo mode', async () => {
      await manager.setDemoMode(true);
      expect(manager.isDemoMode()).toBe(true);
    });

    it('should disable demo mode', async () => {
      await manager.setDemoMode(false);
      expect(manager.isDemoMode()).toBe(false);
    });
  });

  describe('Scenario Simulation', () => {
    it('should simulate successful authentication', async () => {
      await manager.setDemoMode(true);
      await manager.loadScenario('success');
      
      const result = await manager.simulateAuthentication();
      
      expect(result.success).toBe(true);
      expect(result.userId).toBeTruthy();
      expect(result.processingTimeMs).toBeLessThan(1000);
    });

    it('should simulate liveness failure', async () => {
      await manager.setDemoMode(true);
      await manager.loadScenario('liveness_failure');
      
      const result = await manager.simulateAuthentication();
      
      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('LIVENESS_FAILED');
    });
  });

  describe('Demo Users', () => {
    it('should provide demo users', () => {
      const users = manager.getDemoUsers();
      expect(users.length).toBeGreaterThan(0);
      expect(users[0].id).toBeTruthy();
    });
  });
});
