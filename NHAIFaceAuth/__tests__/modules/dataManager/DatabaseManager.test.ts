import { DatabaseManager } from '../../../src/modules/dataManager/DatabaseManager';
import { MockDataFactory } from '../../utils/MockDataFactory';

jest.mock('@op-engineering/op-sqlite');

describe('DatabaseManager', () => {
  let db: DatabaseManager;

  beforeEach(async () => {
    db = DatabaseManager.getInstance();
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('User Operations', () => {
    it('should insert user successfully', async () => {
      const user = MockDataFactory.generateMockUser();
      await db.insertUser(user);
      const retrieved = await db.getUserById(user.id);
      expect(retrieved?.id).toBe(user.id);
    });

    it('should retrieve all users', async () => {
      const users = MockDataFactory.generateMockUsers(3);
      for (const user of users) {
        await db.insertUser(user);
      }
      const allUsers = await db.getAllUsers();
      expect(allUsers.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Auth Log Operations', () => {
    it('should insert auth log', async () => {
      const log = MockDataFactory.generateMockAuthLog();
      await db.insertAuthLog(log);
      const logs = await db.getAuthLogs({ limit: 1 });
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
