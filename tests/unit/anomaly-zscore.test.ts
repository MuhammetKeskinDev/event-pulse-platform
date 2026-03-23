import { describe, expect, it } from "vitest";

import {
  computeVolumeZScoreDecision,
  sampleStdDev,
  zScoreDistance,
} from "@src/services/anomaly-detector";

describe("sampleStdDev", () => {
  it("boş veya tek eleman için 0 döner", () => {
    expect(sampleStdDev([])).toBe(0);
    expect(sampleStdDev([42])).toBe(0);
  });

  it("iki nokta için örneklem sapmasını hesaplar", () => {
    expect(sampleStdDev([0, 2])).toBeCloseTo(Math.sqrt(2), 10);
  });

  it("sabit seride 0 sapma", () => {
    expect(sampleStdDev([5, 5, 5, 5])).toBe(0);
  });
});

describe("zScoreDistance (3σ eşiği)", () => {
  it("σ > 0 iken ortalamaya yakın değer anomali değildir", () => {
    const r = zScoreDistance(10, 10, 2);
    expect(r.anomaly).toBe(false);
    expect(r.sigmaDistance).toBe(0);
  });

  it("σ > 0 iken 3σ altında kalır: normal", () => {
    const r = zScoreDistance(12, 10, 1);
    expect(r.sigmaDistance).toBe(2);
    expect(r.anomaly).toBe(false);
  });

  it("σ > 0 iken 3σ üstü: anomali", () => {
    const r = zScoreDistance(20, 10, 2);
    expect(r.sigmaDistance).toBe(5);
    expect(r.anomaly).toBe(true);
  });

  it("tam 3σ sınırında anomali yok (strict > 3)", () => {
    const r = zScoreDistance(13, 10, 1);
    expect(r.sigmaDistance).toBe(3);
    expect(r.anomaly).toBe(false);
  });

  it("σ = 0 ve değerlendirme ortalamaya eşit: anomali yok (mesafe raporlama için inf)", () => {
    const r = zScoreDistance(7, 7, 0);
    expect(r.anomaly).toBe(false);
    expect(r.sigmaDistance).toBe(Number.POSITIVE_INFINITY);
  });

  it("σ = 0 ve hem ortalama hem değerlendirme 0: mesafe 0", () => {
    const r = zScoreDistance(0, 0, 0);
    expect(r.anomaly).toBe(false);
    expect(r.sigmaDistance).toBe(0);
  });

  it("σ = 0 ve değerlendirme ortalamadan farklı: anomali, sonsuz mesafe", () => {
    const r = zScoreDistance(8, 7, 0);
    expect(r.anomaly).toBe(true);
    expect(r.sigmaDistance).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("computeVolumeZScoreDecision (baseline dakika serisi)", () => {
  it("düz baseline ile aynı hacim: normal", () => {
    const baseline = Array.from({ length: 15 }, () => 10);
    const d = computeVolumeZScoreDecision(10, baseline);
    expect(d.mean).toBe(10);
    expect(d.stdDev).toBe(0);
    expect(d.anomaly).toBe(false);
  });

  it("hafif dalgalanma, değerlendirme ortalama civarında: normal", () => {
    const baseline = [8, 9, 10, 11, 12, 10, 9, 11, 10, 10, 9, 11, 10, 10, 10];
    const d = computeVolumeZScoreDecision(10, baseline);
    expect(d.anomaly).toBe(false);
    expect(d.sigmaDistance).toBeLessThanOrEqual(3);
  });

  it("çok yüksek ani hacim: 3σ üstü anomali", () => {
    const baseline = Array.from({ length: 15 }, () => 5);
    const d = computeVolumeZScoreDecision(500, baseline);
    expect(d.mean).toBe(5);
    expect(d.stdDev).toBe(0);
    expect(d.anomaly).toBe(true);
  });

  it("anlamlı σ ile aşırı sapma: anomali", () => {
    const baseline = [10, 11, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    const d = computeVolumeZScoreDecision(100, baseline);
    expect(d.anomaly).toBe(true);
    expect(d.sigmaDistance).toBeGreaterThan(3);
  });
});
