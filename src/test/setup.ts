import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; the Chat auto-scroll effect constructs one. A no-op stub is enough
// (tests assert on scroll behavior via the message list, not on observer callbacks firing).
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
