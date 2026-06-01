import crypto from "crypto";

/**
 * Generate a cryptographically random 6-digit OTP.
 * Uses crypto.randomInt to avoid modulo bias present in Math.random().
 */
export function generateOTP() {
  // randomInt(min, max) returns a value in [min, max)
  return crypto.randomInt(100000, 1000000).toString();
}
