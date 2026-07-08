import '@testing-library/jest-dom';

// jsdom does not implement ResizeObserver. Provide a no-op default so components
// that observe element resizes (e.g. TerminalTab) don't crash in tests that aren't
// specifically exercising resize behavior. Tests that need to trigger a resize
// callback stub their own ResizeObserver implementation via vi.stubGlobal.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
