import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number | string | null | undefined): string {
  const numericPrice = typeof price === 'number' ? price : Number(price);

  // Incomplete package rows must never crash the whole customer journey.
  if (!Number.isFinite(numericPrice)) return '0';

  // For very small amounts (like small profits), show up to 4 decimal places
  if (numericPrice > 0 && numericPrice < 0.10) {
    return numericPrice.toFixed(4).replace(/\.?0+$/, '');
  }
  // For normal amounts, show 2 decimal places and remove trailing zeros
  return numericPrice.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Normalize a phone number by stripping all non-digit characters.
 * Example: "68-516-9218" -> "685169218"
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}
