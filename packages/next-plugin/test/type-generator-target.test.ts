import { describe, it, expect } from 'vitest';
import { generateIndexFile } from '../src/type-generator';

/**
 * PAY-2125: the generated `@vibe/types` package must augment the REAL client,
 * `@payez/vibe-client`. Before this it emitted `declare module '@vibe/client'`,
 * and `@vibe/client` does not exist on npm (404), so in a consumer project that
 * module was an ambient declaration of a nonexistent module - the augmentation
 * never reached `VibeClient.collection()`. This pins the emitted target.
 */
describe('type-generator augmentation target (PAY-2125)', () => {
  const out = generateIndexFile(['products', 'orders']);

  it("emits 'declare module \\'@payez/vibe-client\\''", () => {
    expect(out).toContain("declare module '@payez/vibe-client'");
  });

  it("never emits the nonexistent module '@vibe/client'", () => {
    expect(out).not.toContain('@vibe/client');
  });

  it("never emits the 404 package name '@vibe/next-plugin' in the generated banner", () => {
    expect(out).not.toContain('@vibe/next-plugin');
  });

  it('imports Collection from the real client', () => {
    expect(out).toContain("import type { Collection } from '@payez/vibe-client'");
  });
});
