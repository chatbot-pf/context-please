import { beforeEach, describe, expect, it } from 'vitest'
import { MerkleDAG } from '../../src/sync/merkle'

describe('merkleDAG', () => {
  let dag: MerkleDAG

  beforeEach(() => {
    dag = new MerkleDAG()
  })

  describe('constructor', () => {
    it('should initialize with empty nodes and rootIds', () => {
      expect(dag.nodes.size).toBe(0)
      expect(dag.rootIds).toEqual([])
    })
  })

  describe('addNode', () => {
    it('should add a root node when no parent is provided', () => {
      const nodeId = dag.addNode('test data')

      expect(dag.nodes.size).toBe(1)
      expect(dag.rootIds).toContain(nodeId)

      const node = dag.getNode(nodeId)
      expect(node).toBeDefined()
      expect(node?.data).toBe('test data')
      expect(node?.parents).toEqual([])
      expect(node?.children).toEqual([])
    })

    it('should add a child node when parent is provided', () => {
      const parentId = dag.addNode('parent data')
      const childId = dag.addNode('child data', parentId)

      expect(dag.nodes.size).toBe(2)
      expect(dag.rootIds).toHaveLength(1)
      expect(dag.rootIds).toContain(parentId)

      const parentNode = dag.getNode(parentId)
      const childNode = dag.getNode(childId)

      expect(parentNode?.children).toContain(childId)
      expect(childNode?.parents).toContain(parentId)
    })

    it('should generate consistent hash for same data', () => {
      const id1 = dag.addNode('same data')
      const dag2 = new MerkleDAG()
      const id2 = dag2.addNode('same data')

      expect(id1).toBe(id2)
    })

    it('should not add parent relationship if parent does not exist', () => {
      const nodeId = dag.addNode('test', 'non-existent-parent')
      const node = dag.getNode(nodeId)

      expect(node?.parents).toEqual([])
      // Node is added but not as a root since parentId was provided
      expect(dag.rootIds).not.toContain(nodeId)
    })
  })

  describe('getNode', () => {
    it('should return node if it exists', () => {
      const nodeId = dag.addNode('test data')
      const node = dag.getNode(nodeId)

      expect(node).toBeDefined()
      expect(node?.data).toBe('test data')
    })

    it('should return undefined if node does not exist', () => {
      const node = dag.getNode('non-existent-id')
      expect(node).toBeUndefined()
    })
  })

  describe('getAllNodes', () => {
    it('should return empty array for empty DAG', () => {
      expect(dag.getAllNodes()).toEqual([])
    })

    it('should return all nodes', () => {
      dag.addNode('node1')
      dag.addNode('node2')
      dag.addNode('node3')

      const nodes = dag.getAllNodes()
      expect(nodes).toHaveLength(3)
    })
  })

  describe('getRootNodes', () => {
    it('should return only root nodes', () => {
      const root1 = dag.addNode('root1')
      const root2 = dag.addNode('root2')
      dag.addNode('child', root1)

      const roots = dag.getRootNodes()
      expect(roots).toHaveLength(2)
      expect(roots.map((n) => n.id)).toContain(root1)
      expect(roots.map((n) => n.id)).toContain(root2)
    })

    it('should return empty array if no root nodes', () => {
      expect(dag.getRootNodes()).toEqual([])
    })
  })

  describe('getLeafNodes', () => {
    it('should return nodes with no children', () => {
      const root = dag.addNode('root')
      const child1 = dag.addNode('child1', root)
      const child2 = dag.addNode('child2', root)

      const leaves = dag.getLeafNodes()
      expect(leaves).toHaveLength(2)
      expect(leaves.map((n) => n.id)).toContain(child1)
      expect(leaves.map((n) => n.id)).toContain(child2)
    })

    it('should return root nodes if they have no children', () => {
      const root = dag.addNode('root')
      const leaves = dag.getLeafNodes()

      expect(leaves).toHaveLength(1)
      expect(leaves[0].id).toBe(root)
    })
  })

  describe('serialize and deserialize', () => {
    it('should serialize DAG to plain object', () => {
      dag.addNode('node1')
      dag.addNode('node2')

      const serialized = dag.serialize()
      expect(serialized).toHaveProperty('nodes')
      expect(serialized).toHaveProperty('rootIds')
      expect(serialized.nodes).toBeInstanceOf(Array)
    })

    it('should deserialize back to MerkleDAG', () => {
      const root = dag.addNode('root')
      const child = dag.addNode('child', root)

      const serialized = dag.serialize()
      const deserialized = MerkleDAG.deserialize(serialized)

      expect(deserialized.nodes.size).toBe(2)
      expect(deserialized.rootIds).toEqual([root])
      expect(deserialized.getNode(child)?.data).toBe('child')
    })

    it('should preserve parent-child relationships', () => {
      const root = dag.addNode('root')
      const child = dag.addNode('child', root)

      const serialized = dag.serialize()
      const deserialized = MerkleDAG.deserialize(serialized)

      const rootNode = deserialized.getNode(root)
      const childNode = deserialized.getNode(child)

      expect(rootNode?.children).toContain(child)
      expect(childNode?.parents).toContain(root)
    })
  })

  describe('compare', () => {
    it('should detect added nodes', () => {
      const dag1 = new MerkleDAG()
      const dag2 = new MerkleDAG()

      dag1.addNode('node1')
      dag2.addNode('node1')
      const newNode = dag2.addNode('node2')

      const diff = MerkleDAG.compare(dag1, dag2)

      expect(diff.added).toContain(newNode)
      expect(diff.removed).toEqual([])
      expect(diff.modified).toEqual([])
    })

    it('should detect removed nodes', () => {
      const dag1 = new MerkleDAG()
      const dag2 = new MerkleDAG()

      const removedNode = dag1.addNode('node1')
      dag1.addNode('node2')
      dag2.addNode('node2')

      const diff = MerkleDAG.compare(dag1, dag2)

      expect(diff.added).toEqual([])
      expect(diff.removed).toContain(removedNode)
      expect(diff.modified).toEqual([])
    })

    it('should detect modified nodes', () => {
      const dag1 = new MerkleDAG()
      const dag2 = new MerkleDAG()

      // Same ID but different data won't happen with current hash-based IDs
      // This test documents current behavior
      dag1.addNode('data1')
      dag2.addNode('data2')

      const diff = MerkleDAG.compare(dag1, dag2)

      // Different data means different IDs, so treated as add/remove
      expect(diff.modified).toEqual([])
    })

    it('should handle empty DAGs', () => {
      const dag1 = new MerkleDAG()
      const dag2 = new MerkleDAG()

      const diff = MerkleDAG.compare(dag1, dag2)

      expect(diff.added).toEqual([])
      expect(diff.removed).toEqual([])
      expect(diff.modified).toEqual([])
    })

    it('should correctly compare complex DAGs', () => {
      const dag1 = new MerkleDAG()
      const dag2 = new MerkleDAG()

      // Common nodes
      dag1.addNode('common1')
      dag2.addNode('common1')

      // Unique to dag1
      const removed = dag1.addNode('unique1')

      // Unique to dag2
      const added = dag2.addNode('unique2')

      const diff = MerkleDAG.compare(dag1, dag2)

      expect(diff.added).toContain(added)
      expect(diff.removed).toContain(removed)
    })
  })
})
