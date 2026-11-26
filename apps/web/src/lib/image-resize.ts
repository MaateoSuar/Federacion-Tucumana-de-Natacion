/**
 * Prepara una foto de perfil en el navegador: recorta al centro en cuadrado, la achica y la
 * comprime a JPG, así pesa decenas de KB (no hace falta servidor de archivos) y sale de cualquier
 * tamaño de foto del celular. Devuelve una imagen embebida (data URL).
 */
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTO_FILE_MB = 12;
const TARGET_CHARS = 300_000; // el servidor acepta hasta 450.000

export async function resizeToSquareJpeg(file: File, size = 480): Promise<string> {
  if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Elegí una foto JPG, PNG o WebP.');
  }
  if (file.size > MAX_PHOTO_FILE_MB * 1024 * 1024) {
    throw new Error(`La foto pesa demasiado (máximo ${MAX_PHOTO_FILE_MB} MB).`);
  }

  const bitmap = await loadImage(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no pudo procesar la foto.');
  ctx.fillStyle = '#ffffff'; // PNG con transparencia: fondo blanco
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap.source, sx, sy, side, side, 0, 0, size, size);
  bitmap.release();

  for (const quality of [0.86, 0.78, 0.7, 0.6, 0.5, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= TARGET_CHARS) return url;
  }
  throw new Error('No pudimos achicar la foto lo suficiente: probá con otra.');
}

interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function loadImage(file: File): Promise<LoadedImage> {
  // createImageBitmap respeta la orientación EXIF del celular; si no existe, se usa <img>
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* se prueba con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la foto: probá con otra.'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
