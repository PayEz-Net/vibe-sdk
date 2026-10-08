import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * PAY-2125 (BAPert 70686): the PUBLISH TARGET is the defect. The real package
 * every partner installs is `@payez/vibe-client` (npm has only that name;
 * `@vibe/client` is 404), while the repo's package.json read `@vibe/client`
 * since its initial commit. This row pins the name the tarball will carry.
 */
describe('publish target (PAY-2125)', () => {
  it("packages/client/package.json name is '@payez/vibe-client'", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8')) as {
      name: string;
    };
    expect(pkg.name).toBe('@payez/vibe-client');
  });
});
