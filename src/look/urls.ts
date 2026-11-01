/** Ask Target's image service for a smaller size (the page requests 1400x1600). Other URLs are unchanged. */
export function sizedImageUrl(url: string, width: number, height = Math.round(width * 1.25)): string {
  return url.replace(/width%3A\d+%2Cheight%3A\d+/, `width%3A${width}%2Cheight%3A${height}`);
}
