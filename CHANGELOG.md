# Changelog

## 2.0.3

### Patch Changes

- d0fdaee: Allow the `max` reasoning effort advertised by GPT-5.6 models.

## 2.0.2

### Patch Changes

- f1b988c: Update and pin the provider's runtime and development dependencies.

## 2.0.1

### Patch Changes

- f0784b6: Use safe dependency ranges, reduce published package contents, tighten documentation, and expand deterministic AI SDK integration coverage.

## [2.0.0] - 2026-07-03

### Added

- Native AI SDK 7 `ProviderV4` and `LanguageModelV4` support
- Live authenticated model-catalog lookup and instruction caching
- Current `gpt-5.5`, `gpt-5.4`, and `gpt-5.4-mini` model metadata
- AI SDK 7 generation and streaming regression tests
- Standalone Safari-tested PKCE integration flow
- Scoped package ownership under `@grikomsn`

### Changed

- Require Node.js 22 or later and publish ESM only
- Pin all direct development and runtime dependencies
- Map V4 usage, structured finish reasons, reasoning parts, and stream framing
- Update all examples and documentation for AI SDK 7

### Fixed

- Honor custom `fetch` implementations
- Prevent debug output from exposing authorization headers
- Parse current Codex account ID claims
- Propagate backend response failures with `ChatGPTOAuthError`
- Store standalone OAuth credentials with mode `0600`

## [1.0.0] - 2025-08-18

### Added

- Initial stable release of the ChatGPT OAuth AI SDK provider
- Full support for gpt-5 models via ChatGPT OAuth
- Streaming support for text generation
- Tool calling capabilities with parallel execution
- Structured output generation (JSON mode)
- Reasoning effort control (low, medium, high)
- Complete OAuth implementation example with headless support
- Comprehensive documentation and examples
- Support for both Zod 3 and 4 with minimal validation

### Fixed

- Removed unsupported 'name' parameter from system messages
- Simplified tool examples for better compatibility

### Changed

- Reorganized documentation structure for clarity
- Enhanced JSON generation examples

## [1.0.0-beta.2] - 2025-08-13

### Added

- JSON generation examples and improved documentation
- OAuth implementation example with headless support

### Fixed

- Tool calling compatibility issues

## 1.0.0-beta.1 - 2025-08-12

### Added

- Initial beta implementation of ChatGPT OAuth AI SDK provider
- Basic text generation support
- Authentication handling via ChatGPT OAuth tokens

[1.0.0]: https://github.com/ben-vargas/ai-sdk-provider-chatgpt-oauth/releases/tag/v1.0.0
[1.0.0-beta.2]: https://github.com/ben-vargas/ai-sdk-provider-chatgpt-oauth/releases/tag/v1.0.0-beta.2
[2.0.0]: https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth/releases/tag/v2.0.0
