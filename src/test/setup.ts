const elementPrototype = globalThis.HTMLElement?.prototype;
if (elementPrototype) {
  if (!elementPrototype.hasPointerCapture) {
    Object.defineProperty(elementPrototype, 'hasPointerCapture', { configurable: true, value: () => false });
  }
  if (!elementPrototype.setPointerCapture) {
    Object.defineProperty(elementPrototype, 'setPointerCapture', { configurable: true, value: () => {} });
  }
  if (!elementPrototype.releasePointerCapture) {
    Object.defineProperty(elementPrototype, 'releasePointerCapture', { configurable: true, value: () => {} });
  }
  if (!elementPrototype.scrollIntoView) {
    Object.defineProperty(elementPrototype, 'scrollIntoView', { configurable: true, value: () => {} });
  }
}
