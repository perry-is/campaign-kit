/**
 * Load an image and wait until it's ready. Uses the load event rather than img.decode(),
 * which can stall while the window is in the background.
 */
export function waitForImage(img: HTMLImageElement, src: string, timeoutMs = 30000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The image took too long to load.")), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error("Couldn't read that image.")); };
    img.src = src;
    if (img.complete && img.naturalWidth) { clearTimeout(timer); resolve(img); }
  });
}
