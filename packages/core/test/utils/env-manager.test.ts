import * as os from 'node:os'
import * as path from 'node:path'
import { vol } from 'memfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EnvManager } from '../../src/utils/env-manager'

// Mock fs module with memfs
vi.mock('fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs')
  return memfs.fs
})

describe('envManager', () => {
  let envManager: EnvManager
  let testEnvPath: string

  beforeEach(() => {
    // Reset memfs
    vol.reset()

    // Create test environment
    const homeDir = os.homedir()
    testEnvPath = path.join(homeDir, '.context', '.env')

    // Create the directory structure
    vol.mkdirSync(path.dirname(testEnvPath), { recursive: true })

    envManager = new EnvManager()
  })

  afterEach(() => {
    // Clean up process.env
    delete process.env.TEST_VAR
    delete process.env.ANOTHER_VAR
    vol.reset()
  })

  describe('get', () => {
    it('should return value from process.env if exists', () => {
      process.env.TEST_VAR = 'from-process'
      vol.writeFileSync(testEnvPath, 'TEST_VAR=from-file\n')

      const value = envManager.get('TEST_VAR')
      expect(value).toBe('from-process')
    })

    it('should return value from .env file if not in process.env', () => {
      vol.writeFileSync(testEnvPath, 'TEST_VAR=from-file\n')

      const value = envManager.get('TEST_VAR')
      expect(value).toBe('from-file')
    })

    it('should return undefined if variable not found', () => {
      const value = envManager.get('NON_EXISTENT_VAR')
      expect(value).toBeUndefined()
    })

    it('should return undefined if .env file does not exist', () => {
      const value = envManager.get('TEST_VAR')
      expect(value).toBeUndefined()
    })

    it('should parse multiple variables from .env file', () => {
      vol.writeFileSync(
        testEnvPath,
        'VAR1=value1\nVAR2=value2\nVAR3=value3\n',
      )

      expect(envManager.get('VAR1')).toBe('value1')
      expect(envManager.get('VAR2')).toBe('value2')
      expect(envManager.get('VAR3')).toBe('value3')
    })

    it('should handle variables with empty values', () => {
      vol.writeFileSync(testEnvPath, 'EMPTY_VAR=\n')

      const value = envManager.get('EMPTY_VAR')
      expect(value).toBe('')
    })

    it('should handle variables with special characters', () => {
      vol.writeFileSync(testEnvPath, 'SPECIAL_VAR=value-with_special.chars\n')

      const value = envManager.get('SPECIAL_VAR')
      expect(value).toBe('value-with_special.chars')
    })

    it('should ignore empty lines and whitespace', () => {
      vol.writeFileSync(testEnvPath, '\n  \nTEST_VAR=value\n\n')

      const value = envManager.get('TEST_VAR')
      expect(value).toBe('value')
    })
  })

  describe('set', () => {
    it('should create .env file if it does not exist', () => {
      envManager.set('NEW_VAR', 'new-value')

      expect(vol.existsSync(testEnvPath)).toBe(true)
      const content = vol.readFileSync(testEnvPath, 'utf-8')
      expect(content).toContain('NEW_VAR=new-value')
    })

    it('should create parent directory if it does not exist', () => {
      vol.reset() // Remove all files

      envManager.set('NEW_VAR', 'new-value')

      expect(vol.existsSync(path.dirname(testEnvPath))).toBe(true)
      expect(vol.existsSync(testEnvPath)).toBe(true)
    })

    it('should update existing variable in .env file', () => {
      vol.writeFileSync(testEnvPath, 'TEST_VAR=old-value\n')

      envManager.set('TEST_VAR', 'new-value')

      const content = vol.readFileSync(testEnvPath, 'utf-8')
      expect(content).toContain('TEST_VAR=new-value')
      expect(content).not.toContain('old-value')
    })

    it('should append new variable to existing file', () => {
      vol.writeFileSync(testEnvPath, 'EXISTING_VAR=existing-value\n')

      envManager.set('NEW_VAR', 'new-value')

      const content = vol.readFileSync(testEnvPath, 'utf-8')
      expect(content).toContain('EXISTING_VAR=existing-value')
      expect(content).toContain('NEW_VAR=new-value')
    })

    it('should preserve other variables when updating one', () => {
      vol.writeFileSync(
        testEnvPath,
        'VAR1=value1\nVAR2=value2\nVAR3=value3\n',
      )

      envManager.set('VAR2', 'updated-value')

      const content = vol.readFileSync(testEnvPath, 'utf-8')
      expect(content).toContain('VAR1=value1')
      expect(content).toContain('VAR2=updated-value')
      expect(content).toContain('VAR3=value3')
    })

    it('should handle setting empty values', () => {
      envManager.set('EMPTY_VAR', '')

      const content = vol.readFileSync(testEnvPath, 'utf-8')
      expect(content).toContain('EMPTY_VAR=')
    })

    it('should handle values with special characters', () => {
      envManager.set('SPECIAL_VAR', 'value-with_special.chars@123')

      const value = envManager.get('SPECIAL_VAR')
      expect(value).toBe('value-with_special.chars@123')
    })

    it('should add newline if file does not end with one', () => {
      vol.writeFileSync(testEnvPath, 'EXISTING_VAR=value')

      envManager.set('NEW_VAR', 'new-value')

      const content = vol.readFileSync(testEnvPath, 'utf-8') as string
      const lines = content.split('\n').filter((l: string) => l.trim())
      expect(lines).toHaveLength(2)
    })
  })

  describe('getEnvFilePath', () => {
    it('should return the correct .env file path', () => {
      const filePath = envManager.getEnvFilePath()
      const homeDir = os.homedir()
      const expectedPath = path.join(homeDir, '.context', '.env')

      expect(filePath).toBe(expectedPath)
    })
  })

  describe('integration', () => {
    it('should set and get variable correctly', () => {
      envManager.set('INTEGRATION_VAR', 'test-value')
      const value = envManager.get('INTEGRATION_VAR')

      expect(value).toBe('test-value')
    })

    it('should handle multiple set operations', () => {
      envManager.set('VAR1', 'value1')
      envManager.set('VAR2', 'value2')
      envManager.set('VAR1', 'updated-value1')

      expect(envManager.get('VAR1')).toBe('updated-value1')
      expect(envManager.get('VAR2')).toBe('value2')
    })

    it('should prioritize process.env over file', () => {
      envManager.set('PRIORITY_VAR', 'file-value')
      process.env.PRIORITY_VAR = 'process-value'

      const value = envManager.get('PRIORITY_VAR')
      expect(value).toBe('process-value')
    })
  })
})
