import { bullConnectionFromUrl } from './redis-connection';

describe('bullConnectionFromUrl', () => {
  it('local sin credenciales', () => {
    expect(bullConnectionFromUrl('redis://localhost:6379')).toEqual({ host: 'localhost', port: 6379 });
  });

  it('con usuario, contraseña y base', () => {
    expect(bullConnectionFromUrl('redis://default:s%40cret@red-abc:6380/2')).toEqual({
      host: 'red-abc', port: 6380, username: 'default', password: 's@cret', db: 2,
    });
  });

  it('rediss:// activa TLS', () => {
    expect(bullConnectionFromUrl('rediss://:pw@host.example:6379')).toMatchObject({ password: 'pw', tls: {} });
  });
});
