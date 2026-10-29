import { describe, expect, it } from 'vitest';
import { buildCsp } from '../vite.config.ts';

describe('Content-Security-Policy', () => {
  it('allows only same-origin script, style and images', () => {
    expect(buildCsp()).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });
});
