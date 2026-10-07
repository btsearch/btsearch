import sharp from "sharp";

export async function sharpPhotoInput() {
  const width = 640;
  const height = 480;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) * 255;
      const offset = (y * width + x) * 3;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
    }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}
