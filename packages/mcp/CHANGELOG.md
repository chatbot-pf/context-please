# Changelog

## [0.4.0](https://github.com/pleaseai/context-please/compare/mcp-v0.3.2...mcp-v0.4.0) (2025-12-12)


### Features

* add FAISS vector database support for local-only deployments ([#41](https://github.com/pleaseai/context-please/issues/41)) ([d01dba7](https://github.com/pleaseai/context-please/commit/d01dba7b0f73cd3317c7f85f6cf2bb7bbdb3f676))
* **core:** add HuggingFace Transformers embedding provider with LEAF model support ([#53](https://github.com/pleaseai/context-please/issues/53)) ([75307d5](https://github.com/pleaseai/context-please/commit/75307d5e931fe8329b93568e4669ba6d6ce49cd1))


### Bug Fixes

* **mcp:** resolve race condition where search fails immediately after indexing ([#51](https://github.com/pleaseai/context-please/issues/51)) ([f26a59d](https://github.com/pleaseai/context-please/commit/f26a59d0f4ef28b58e7e9fda89baf454809c9528))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @pleaseai/context-please-core bumped to 0.5.0

## [0.3.2](https://github.com/chatbot-pf/context-please/compare/mcp-v0.3.1...mcp-v0.3.2) (2025-10-31)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @pleaseai/context-please-core bumped to 0.4.0

## [0.3.1](https://github.com/chatbot-pf/context-please/compare/mcp-v0.3.0...mcp-v0.3.1) (2025-10-30)


### Bug Fixes

* **mcp:** resolve search_code failure when snapshot is out of sync ([#38](https://github.com/chatbot-pf/context-please/issues/38)) ([27de02c](https://github.com/chatbot-pf/context-please/commit/27de02ce6bf8dcf5ff06fe2931019a26fe689524))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @pleaseai/context-please-core bumped to 0.3.1

## [0.3.0](https://github.com/chatbot-pf/context-please/compare/mcp-v0.2.1...mcp-v0.3.0) (2025-10-18)


### Features

* add support for Qdrant and enhance evaluation scripts ([#10](https://github.com/chatbot-pf/context-please/issues/10)) ([7ad86cf](https://github.com/chatbot-pf/context-please/commit/7ad86cfd72379e5aec4085d2037fc8c82bb8ffb3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @pleaseai/context-please-core bumped to 0.3.0

## [0.2.1](https://github.com/chatbot-pf/context-please/compare/mcp-v0.2.0...mcp-v0.2.1) (2025-10-12)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @pleaseai/context-please-core bumped to 0.2.1

## [0.2.0](https://github.com/chatbot-pf/context-please/compare/mcp-v0.1.0...mcp-v0.2.0) (2025-10-11)


### Features

* **core:** Add Qdrant vector database support with hybrid search ([#4](https://github.com/chatbot-pf/context-please/issues/4)) ([033b4de](https://github.com/chatbot-pf/context-please/commit/033b4dec810f8663e61667e818005bb3b202192d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @pleaseai/context-please-core bumped to 0.2.0
