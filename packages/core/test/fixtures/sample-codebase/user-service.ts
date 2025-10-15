/**
 * User service for managing user data
 */
export class UserService {
  private users: Map<string, User> = new Map()

  /**
   * Get user by ID
   */
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) || null
  }

  /**
   * Create a new user
   */
  async createUser(userData: CreateUserData): Promise<User> {
    const user: User = {
      id: this.generateId(),
      name: userData.name,
      email: userData.email,
      createdAt: new Date(),
    }

    this.users.set(user.id, user)
    return user
  }

  /**
   * Update existing user
   */
  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id)
    if (!user) {
      return null
    }

    const updated = { ...user, ...updates }
    this.users.set(id, updated)
    return updated
  }

  /**
   * Delete user by ID
   */
  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id)
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export interface User {
  id: string
  name: string
  email: string
  createdAt: Date
}

export interface CreateUserData {
  name: string
  email: string
}
