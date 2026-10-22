import { it, expect } from "vitest";
import tokens from "../theme.json";
const luminance = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};
const contrast = (a, b) => {
  const la = luminance(a),
    lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
it("all theme text pairs meet WCAG AA normal-text contrast", () => {
  for (const [fg, bg] of [
    ["ink", "canvas"],
    ["ink", "surface"],
    ["ink", "surface-muted"],
    ["muted", "surface"],
    ["muted", "canvas"],
    ["muted", "surface-muted"],
    ["primary", "surface"],
    ["primary", "surface-muted"],
    ["on-primary", "primary"],
    ["on-primary", "primary-hover"],
    ["on-primary-muted", "primary"],
    ["success", "success-soft"],
    ["danger", "danger-soft"],
    ["warning", "warning-soft"],
  ])
    expect(
      contrast(tokens[fg], tokens[bg]),
      `${fg} on ${bg}`,
    ).toBeGreaterThanOrEqual(4.5);
});
it("interactive control borders and focus have at least 3:1 contrast", () => {
  for (const surface of ["surface", "canvas", "surface-muted"]) {
    expect(
      contrast(tokens.control, tokens[surface]),
      `control on ${surface}`,
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrast(tokens.focus, tokens[surface]),
      `focus on ${surface}`,
    ).toBeGreaterThanOrEqual(3);
  }
});
