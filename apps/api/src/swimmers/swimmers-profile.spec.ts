import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { SwimmersService } from './swimmers.service';
import { UpdateAthleteProfileDto } from './dto/update-athlete-profile.dto';

const SW = 'sw1';

function setup(over: { user?: Record<string, unknown> | null; profile?: Record<string, unknown> | null } = {}) {
  const prisma = {
    swimmer: { findUnique: jest.fn().mockResolvedValue({ id: SW, isActive: true }) },
    user: { findUnique: jest.fn().mockResolvedValue(over.user === undefined ? { swimmerId: SW, primaryRole: 'SWIMMER' } : over.user) },
    athleteProfile: {
      findUnique: jest.fn().mockResolvedValue(over.profile === undefined ? null : over.profile),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ publicVisibility: true, bio: null, photoUrl: null, socialLinks: null, ...data })),
      upsert: jest.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) => Promise.resolve(create)),
    },
  };
  const service = new SwimmersService(prisma as never);
  // findOne se apoya en otras consultas: se reemplaza por una versión simple
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: SW } as never);
  return { service, prisma };
}

const validateDto = async (plain: Record<string, unknown>) => validate(plainToInstance(UpdateAthleteProfileDto, plain));

describe('editar el perfil: permisos', () => {
  it('el nadador vinculado puede editar el suyo', async () => {
    const { service, prisma } = setup();
    await service.updateProfile(SW, 'u1', { bio: '  Nado desde los 6 años  ' });
    expect(prisma.athleteProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { bio: 'Nado desde los 6 años' } }));
  });

  it('un Admin puede editar cualquiera', async () => {
    const { service } = setup({ user: { swimmerId: null, primaryRole: 'ADMIN' } });
    await expect(service.updateProfile(SW, 'a1', { bio: 'x' })).resolves.toBeDefined();
  });

  it('otro usuario (otro nadador, entrenador) NO puede editarlo', async () => {
    const { service, prisma } = setup({ user: { swimmerId: 'otro', primaryRole: 'SWIMMER' } });
    await expect(service.updateProfile(SW, 'u2', { bio: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getProfileForEditor(SW, 'u2')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.athleteProfile.upsert).not.toHaveBeenCalled();
  });

  it('un entrenador no puede editar perfiles, ni siquiera de su club', async () => {
    const { service } = setup({ user: { swimmerId: null, primaryRole: 'COACH' } });
    await expect(service.updateProfile(SW, 'c1', { bio: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('vacío significa borrar: bio y foto quedan en null y sin redes se guarda JSON nulo', async () => {
    const { service, prisma } = setup();
    await service.updateProfile(SW, 'u1', { bio: '   ', photoUrl: '', socialLinks: { instagram: '' } });
    const update = (prisma.athleteProfile.upsert.mock.calls[0] as [{ update: Record<string, unknown> }])[0].update;
    expect(update).toMatchObject({ bio: null, photoUrl: null, socialLinks: Prisma.JsonNull });
  });

  it('las redes se guardan solo con los usuarios que tienen valor', async () => {
    const { service, prisma } = setup();
    await service.updateProfile(SW, 'u1', { socialLinks: { instagram: 'emi.lamarca', tiktok: '' } });
    const update = (prisma.athleteProfile.upsert.mock.calls[0] as [{ update: Record<string, unknown> }])[0].update;
    expect(update['socialLinks']).toEqual({ instagram: 'emi.lamarca' });
  });
});

describe('perfil público y visibilidad', () => {
  it('perfil público: se ve todo', async () => {
    const { service } = setup({ profile: { swimmerId: SW, bio: 'Hola', photoUrl: 'data:image/jpeg;base64,AAAA', socialLinks: { instagram: 'emi' }, publicVisibility: true } });
    await expect(service.getProfile(SW)).resolves.toMatchObject({ bio: 'Hola', photoUrl: 'data:image/jpeg;base64,AAAA' });
  });

  it('perfil privado: la foto, la presentación y las redes NO salen al público', async () => {
    const { service } = setup({ profile: { swimmerId: SW, bio: 'Hola', photoUrl: 'data:image/jpeg;base64,AAAA', socialLinks: { instagram: 'emi' }, publicVisibility: false } });
    const pub = await service.getProfile(SW);
    expect(pub).toMatchObject({ bio: null, photoUrl: null, socialLinks: null, publicVisibility: false });
  });

  it('pero el dueño sigue viendo todo para poder editarlo', async () => {
    const { service } = setup({ profile: { swimmerId: SW, bio: 'Hola', photoUrl: null, socialLinks: null, publicVisibility: false } });
    await expect(service.getProfileForEditor(SW, 'u1')).resolves.toMatchObject({ bio: 'Hola' });
  });

  it('un nadador inexistente da 404', async () => {
    const { service, prisma } = setup();
    prisma.swimmer.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('validación de lo que se sube', () => {
  const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

  it('acepta una foto embebida JPG/PNG/WebP, un enlace https y vaciarla', async () => {
    expect(await validateDto({ photoUrl: tiny })).toHaveLength(0);
    expect(await validateDto({ photoUrl: 'data:image/webp;base64,UklGRg==' })).toHaveLength(0);
    expect(await validateDto({ photoUrl: 'https://cdn.ejemplo.com/foto.jpg' })).toHaveLength(0);
    expect(await validateDto({ photoUrl: '' })).toHaveLength(0);
    expect(await validateDto({ photoUrl: null })).toHaveLength(0);
  });

  it('rechaza SVG, javascript:, http, tipos raros y fotos gigantes', async () => {
    for (const photoUrl of [
      'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==',
      'javascript:alert(1)',
      'http://inseguro.com/a.jpg',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/jpeg;base64,' + 'A'.repeat(450_001),
      '/uploads/images/algo.png',
    ]) {
      expect((await validateDto({ photoUrl })).length).toBeGreaterThan(0);
    }
  });

  it('las redes aceptan solo nombres de usuario: nada de enlaces ni @', async () => {
    expect(await validateDto({ socialLinks: { instagram: 'emi.lamarca_09', x: 'emi' } })).toHaveLength(0);
    for (const bad of ['@emi', 'https://instagram.com/emi', 'javascript:alert(1)', 'a b', 'x'.repeat(41)]) {
      expect((await validateDto({ socialLinks: { instagram: bad } })).length).toBeGreaterThan(0);
    }
  });

  it('la presentación tiene tope de 1000 caracteres', async () => {
    expect(await validateDto({ bio: 'a'.repeat(1000) })).toHaveLength(0);
    expect((await validateDto({ bio: 'a'.repeat(1001) })).length).toBeGreaterThan(0);
  });
});
