import { resolveAppUrl } from '~/utils/env';

describe('resolveAppUrl', () => {
  it('should prefer the explicitly set address over the Vercel hostname', () => {
    expect(resolveAppUrl('https://safi.kafoai.com', 'split-abc.vercel.app')).toBe(
      'https://safi.kafoai.com',
    );
  });

  it('should add https to the Vercel hostname so it parses as a URL', () => {
    const url = resolveAppUrl(undefined, 'split-abc.vercel.app');
    expect(url).toBe('https://split-abc.vercel.app');
    expect(new URL(String(url)).host).toBe('split-abc.vercel.app');
  });

  it('should treat a blank value as unset', () => {
    expect(resolveAppUrl('  ', 'split-abc.vercel.app')).toBe('https://split-abc.vercel.app');
  });

  it('should leave the value alone when there is no Vercel hostname', () => {
    expect(resolveAppUrl(undefined, '')).toBeUndefined();
  });
});
