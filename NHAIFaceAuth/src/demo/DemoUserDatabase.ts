/**
 * NHAI FaceAuth — Demo User Database
 *
 * Pre-configured demo users with realistic profiles for hackathon presentations
 */

export interface DemoUser {
  id: string;
  name: string;
  role: string;
  zone: string;
  photo: string; // Asset path or base64
  embedding: Float32Array;
  enrollmentDate: string;
  photoCount: number;
}

/**
 * Demo User Database with 7 realistic Indian profiles
 */
export class DemoUserDatabase {
  /**
   * Generate a deterministic embedding for demo users
   * (In production, these would be actual face embeddings)
   */
  private static generateDemoEmbedding(userId: string): Float32Array {
    const embedding = new Float32Array(128);
    const seed = userId.split('_')[1] ? parseInt(userId.split('_')[1], 10) : 1000;
    
    // Simple seeded random generation
    let randomSeed = seed;
    for (let i = 0; i < 128; i++) {
      randomSeed = (randomSeed * 1664525 + 1013904223) % (2 ** 32);
      embedding[i] = (randomSeed / (2 ** 32)) * 2 - 1;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < 128; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);

    for (let i = 0; i < 128; i++) {
      embedding[i] /= norm;
    }

    return embedding;
  }

  /**
   * Get all demo users
   */
  static getUsers(): DemoUser[] {
    return [
      {
        id: 'demo_user_1001',
        name: 'Ramesh Kumar',
        role: 'Senior Engineer',
        zone: 'Zone-A (Delhi-Jaipur)',
        photo: 'demo_user_1.jpg', // Placeholder
        embedding: this.generateDemoEmbedding('demo_user_1001'),
        enrollmentDate: '2024-01-15',
        photoCount: 5,
      },
      {
        id: 'demo_user_1002',
        name: 'Priya Singh',
        role: 'Site Supervisor',
        zone: 'Zone-B (Mumbai-Pune)',
        photo: 'demo_user_2.jpg',
        embedding: this.generateDemoEmbedding('demo_user_1002'),
        enrollmentDate: '2024-01-18',
        photoCount: 5,
      },
      {
        id: 'demo_user_1003',
        name: 'Amit Patel',
        role: 'Highway Worker',
        zone: 'Zone-A (Delhi-Jaipur)',
        photo: 'demo_user_3.jpg',
        embedding: this.generateDemoEmbedding('demo_user_1003'),
        enrollmentDate: '2024-01-20',
        photoCount: 5,
      },
      {
        id: 'demo_user_1004',
        name: 'Sunita Sharma',
        role: 'Safety Inspector',
        zone: 'Zone-C (Bangalore-Chennai)',
        photo: 'demo_user_4.jpg',
        embedding: this.generateDemoEmbedding('demo_user_1004'),
        enrollmentDate: '2024-01-22',
        photoCount: 5,
      },
      {
        id: 'demo_user_1005',
        name: 'Vijay Verma',
        role: 'Toll Operator',
        zone: 'Zone-B (Mumbai-Pune)',
        photo: 'demo_user_5.jpg',
        embedding: this.generateDemoEmbedding('demo_user_1005'),
        enrollmentDate: '2024-01-25',
        photoCount: 5,
      },
      {
        id: 'demo_user_1006',
        name: 'Anjali Reddy',
        role: 'Maintenance Lead',
        zone: 'Zone-C (Bangalore-Chennai)',
        photo: 'demo_user_6.jpg',
        embedding: this.generateDemoEmbedding('demo_user_1006'),
        enrollmentDate: '2024-01-28',
        photoCount: 5,
      },
      {
        id: 'demo_user_1007',
        name: 'Rajesh Gupta',
        role: 'Project Manager',
        zone: 'Zone-A (Delhi-Jaipur)',
        photo: 'demo_user_7.jpg',
        embedding: this.generateDemoEmbedding('demo_user_1007'),
        enrollmentDate: '2024-02-01',
        photoCount: 5,
      },
    ];
  }

  /**
   * Get a specific demo user by ID
   */
  static getUserById(userId: string): DemoUser | null {
    return this.getUsers().find(user => user.id === userId) || null;
  }

  /**
   * Get demo users by zone
   */
  static getUsersByZone(zone: string): DemoUser[] {
    return this.getUsers().filter(user => user.zone.includes(zone));
  }

  /**
   * Get demo users by role
   */
  static getUsersByRole(role: string): DemoUser[] {
    return this.getUsers().filter(user =>
      user.role.toLowerCase().includes(role.toLowerCase()),
    );
  }

  /**
   * Get a random demo user (for success scenario)
   */
  static getRandomUser(): DemoUser {
    const users = this.getUsers();
    return users[Math.floor(Math.random() * users.length)];
  }

  /**
   * Get user statistics for dashboard
   */
  static getStatistics() {
    const users = this.getUsers();
    const roleCount: Record<string, number> = {};
    const zoneCount: Record<string, number> = {};

    users.forEach(user => {
      roleCount[user.role] = (roleCount[user.role] || 0) + 1;
      const zoneKey = user.zone.split(' ')[0]; // Extract "Zone-A" from "Zone-A (Delhi-Jaipur)"
      zoneCount[zoneKey] = (zoneCount[zoneKey] || 0) + 1;
    });

    return {
      totalUsers: users.length,
      roleDistribution: roleCount,
      zoneDistribution: zoneCount,
      enrollmentDateRange: {
        earliest: '2024-01-15',
        latest: '2024-02-01',
      },
    };
  }
}
