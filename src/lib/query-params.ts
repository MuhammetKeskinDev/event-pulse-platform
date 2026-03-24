/** Tekrarlayan query anahtarları diziye dönüşebilir; tek stringe indirger. */
export function singleQueryParam(
  v: string | string[] | undefined,
): string | undefined {
  if (v === undefined) {
    return undefined;
  }
  if (Array.isArray(v)) {
    const first = v[0];
    return typeof first === "string" ? first : undefined;
  }
  return v;
}
