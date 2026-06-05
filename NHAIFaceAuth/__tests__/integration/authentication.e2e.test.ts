import { MockDataFactory } from '../utils/MockDataFactory';
import { DatabaseManager } from '../../src/modules/dataManager/DatabaseManager';

describe('Authentication E2E Flow', () => {
  let db: DatabaseManager;

  beforeEach(async () => {
    db = DatabaseManager.getInstance();
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  it('should complete successful authentication flow', async () => {
    const user = MockDataFactory.generateMockUser();
    await db.insertUser(user);
    
    const log = MockDataFactory.generateMockAuthLog(user.id, 'success');
    await db.insertAuthLog(log);
    
    const logs = await db.getAuthLogs({ userId: user.id });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].result).toBe('success');
  });

  it('should handle failed authentication', async () => {
    const log = MockDataFactory.generateMockAuthLog(null, 'failure');
    await db.insertAuthLog(log);
    
    const logs = await db.getAuthLogs({ result: 'failure' });
    expect(logs.length).toBeGreaterThan(0);
  });
});
