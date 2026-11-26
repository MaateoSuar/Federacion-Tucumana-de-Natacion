'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { ACCEPTED_PHOTO_TYPES, resizeToSquareJpeg } from '@/lib/image-resize';

interface ProfileData {
  bio: string | null;
  photoUrl: string | null;
  publicVisibility: boolean;
  socialLinks: { instagram?: string; tiktok?: string; facebook?: string; x?: string } | null;
}

type SocialKey = 'instagram' | 'tiktok' | 'facebook' | 'x';
const SOCIALS: { key: SocialKey; label: string; prefix: string }[] = [
  { key: 'instagram', label: 'Instagram', prefix: 'instagram.com/' },
  { key: 'tiktok', label: 'TikTok', prefix: 'tiktok.com/@' },
  { key: 'facebook', label: 'Facebook', prefix: 'facebook.com/' },
  { key: 'x', label: 'X (Twitter)', prefix: 'x.com/' },
];
const BIO_MAX = 1000;

/** Acepta "@usuario" o un enlace pegado y se queda con el usuario. */
function cleanHandle(raw: string): string {
  let v = raw.trim().replace(/^@/, '');
  v = v.replace(/^https?:\/\/(www\.)?[^/]+\/@?/i, '').replace(/[/?#].*$/, '');
  return v;
}

export default function EditarPerfilPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const swimmerId = user?.swimmerId ?? null;

  const [loaded, setLoaded] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [social, setSocial] = useState<Record<SocialKey, string>>({ instagram: '', tiktok: '', facebook: '', x: '' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !user) void router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!swimmerId) return;
    apiFetch<ProfileData>(`/swimmers/${swimmerId}/profile/edit`)
      .then((p) => {
        setPhoto(p.photoUrl);
        setBio(p.bio ?? '');
        setIsPublic(p.publicVisibility);
        setSocial({ instagram: p.socialLinks?.instagram ?? '', tiktok: p.socialLinks?.tiktok ?? '', facebook: p.socialLinks?.facebook ?? '', x: p.socialLinks?.x ?? '' });
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, [swimmerId]);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSaved(false);
    setPhotoBusy(true);
    try {
      setPhoto(await resizeToSquareJpeg(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!swimmerId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/swimmers/${swimmerId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          bio,
          photoUrl: photo ?? '',
          publicVisibility: isPublic,
          socialLinks: Object.fromEntries(SOCIALS.map(({ key }) => [key, cleanHandle(social[key])])),
        }),
      });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !user) return <div className="min-h-screen bg-pool-950" />;

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <nav className="border-b border-pool-800 px-6 md:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-md px-1.5 py-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LogoPNGSinLetras.png" alt="FTN" className="h-7 w-auto" />
          </div>
          <span className="text-pool-500 text-xs">Mi perfil</span>
        </div>
        {swimmerId && (
          <Link href={`/nadadores/${swimmerId}`} className="text-pool-400 hover:text-white text-sm transition-colors">← Volver a mi perfil</Link>
        )}
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-black mb-1">Editar mi perfil</h1>
        <p className="text-pool-400 text-sm mb-8">Tus resultados y marcas los carga la federación y no se editan acá: podés cambiar tu foto, tu presentación y tus redes.</p>

        {!swimmerId ? (
          <div className="rounded-2xl border border-pool-700/60 bg-pool-900/60 p-6 text-sm text-pool-300">
            Tu cuenta todavía no está vinculada a un perfil de nadador.{' '}
            <Link href="/nadador" className="text-aqua-300 underline">Vinculala con tu código</Link> y después volvés acá.
          </div>
        ) : !loaded && !error ? (
          <p className="text-pool-400 text-sm">Cargando…</p>
        ) : (
          <form onSubmit={(e) => void save(e)} className="space-y-8">
            {/* Foto */}
            <section className="rounded-2xl border border-pool-700/60 bg-pool-900/60 p-6">
              <h2 className="font-bold mb-4">Foto de perfil</h2>
              <div className="flex items-center gap-5">
                <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-pool-800 border border-pool-700 flex items-center justify-center text-3xl font-black text-aqua-300">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="Tu foto de perfil" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden="true">{(user.firstName[0] ?? '') + (user.lastName[0] ?? '')}</span>
                  )}
                </div>
                <div className="space-y-2">
                  <input ref={fileRef} type="file" accept={ACCEPTED_PHOTO_TYPES.join(',')} className="sr-only" id="photo-file" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
                  <label htmlFor="photo-file" className="inline-block cursor-pointer rounded-xl bg-aqua-500 hover:bg-aqua-400 text-pool-950 font-bold text-sm px-5 py-2.5 transition-colors">
                    {photoBusy ? 'Procesando…' : photo ? 'Cambiar foto' : 'Subir foto'}
                  </label>
                  {photo && (
                    <button type="button" onClick={() => { setPhoto(null); setSaved(false); }} className="block text-xs text-pool-400 hover:text-red-300 underline">
                      Quitar foto
                    </button>
                  )}
                  <p className="text-xs text-pool-500">JPG, PNG o WebP. Se recorta en cuadrado y se achica sola.</p>
                </div>
              </div>
            </section>

            {/* Presentación */}
            <section className="rounded-2xl border border-pool-700/60 bg-pool-900/60 p-6">
              <label htmlFor="bio" className="block font-bold mb-2">Sobre mí</label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => { setBio(e.target.value); setSaved(false); }}
                maxLength={BIO_MAX}
                rows={5}
                placeholder="Contá desde cuándo nadás, tu prueba favorita, tus objetivos…"
                className="w-full rounded-xl bg-pool-950 border border-pool-700 px-4 py-3 text-white placeholder-pool-600 focus:outline-none focus:border-aqua-400 focus:ring-2 focus:ring-aqua-400/30"
              />
              <p className="mt-1 text-right text-xs text-pool-500">{bio.length}/{BIO_MAX}</p>
            </section>

            {/* Redes */}
            <section className="rounded-2xl border border-pool-700/60 bg-pool-900/60 p-6">
              <h2 className="font-bold mb-1">Mis redes</h2>
              <p className="text-xs text-pool-500 mb-4">Escribí solo tu usuario (con o sin @). Si no usás alguna, dejala vacía.</p>
              <div className="space-y-3">
                {SOCIALS.map(({ key, label, prefix }) => (
                  <div key={key}>
                    <label htmlFor={`social-${key}`} className="block text-xs text-pool-400 mb-1">{label}</label>
                    <div className="flex items-center rounded-xl bg-pool-950 border border-pool-700 focus-within:border-aqua-400">
                      <span className="pl-3 text-xs text-pool-600 select-none">{prefix}</span>
                      <input
                        id={`social-${key}`}
                        value={social[key]}
                        onChange={(e) => { setSocial((s) => ({ ...s, [key]: e.target.value })); setSaved(false); }}
                        maxLength={80}
                        autoComplete="off"
                        className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm text-white placeholder-pool-600 focus:outline-none"
                        placeholder="tu_usuario"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Visibilidad */}
            <section className="rounded-2xl border border-pool-700/60 bg-pool-900/60 p-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={isPublic} onChange={(e) => { setIsPublic(e.target.checked); setSaved(false); }} className="mt-1 h-4 w-4 accent-aqua-500" />
                <span>
                  <span className="block font-bold">Mostrar mi foto, presentación y redes en mi perfil público</span>
                  <span className="block text-xs text-pool-500 mt-0.5">
                    Si lo desactivás, solo se ven tus resultados y marcas (que son datos deportivos de la federación), sin foto ni datos personales.
                  </span>
                </span>
              </label>
            </section>

            {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
            {saved && (
              <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                ¡Guardado! Tu perfil público se actualiza en unos segundos.{' '}
                <Link href={`/nadadores/${swimmerId}`} className="underline">Ver mi perfil</Link>
              </p>
            )}

            <div className="flex items-center gap-4">
              <button type="submit" disabled={saving || photoBusy} className="rounded-xl bg-aqua-500 hover:bg-aqua-400 disabled:opacity-50 text-pool-950 font-bold px-8 py-3 transition-colors">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <Link href={`/nadadores/${swimmerId}`} className="text-sm text-pool-400 hover:text-white">Cancelar</Link>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
