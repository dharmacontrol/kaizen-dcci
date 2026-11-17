/**
 * Client-side image compression utility
 * Scales images to fit within maxDimension and re-encodes as JPEG
 */

export async function compressImageFile(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.8
): Promise<File> {
  // Validate that the file is an image
  if (!file.type.startsWith("image/")) {
    return Promise.reject(
      new Error(
        `File type "${file.type}" is not an image. Expected type to start with "image/".`
      )
    );
  }

  // Load image to get dimensions
  const img = await loadImage(file);

  // Calculate scaled dimensions (no upscaling)
  const { width, height } = calculateScaledDimensions(
    img.width,
    img.height,
    maxDimension
  );

  // Create canvas and draw scaled image
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Failed to get canvas context"));
  }

  ctx.drawImage(img, 0, 0, width, height);

  // Convert canvas to JPEG blob
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });

  if (!blob) {
    return Promise.reject(new Error("Failed to compress image"));
  }

  // Get original filename and change extension to .jpg
  const originalName = file.name;
  const nameWithoutExt = originalName.replace(/\.[^.]+$/, "");
  const newName = `${nameWithoutExt}.jpg`;

  // Create new File from blob
  return new File([blob], newName, { type: "image/jpeg" });
}

/**
 * Load image from File blob
 * Returns an HTMLImageElement or ImageBitmap
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("Failed to load image from file"));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Calculate scaled dimensions to fit within maxDimension
 * Does not upscale if image is already smaller
 */
function calculateScaledDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number
): { width: number; height: number } {
  // If image is already smaller than maxDimension on both sides, don't scale
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }

  // Calculate scale factor based on the longer dimension
  const scale = Math.min(
    maxDimension / originalWidth,
    maxDimension / originalHeight
  );

  // Don't upscale
  const finalScale = Math.min(scale, 1);

  return {
    width: Math.round(originalWidth * finalScale),
    height: Math.round(originalHeight * finalScale),
  };
}
