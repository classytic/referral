import { z } from 'zod';

export const refSchema = z.string().min(1).max(256);
export const modelSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z][A-Za-z0-9_-]*$/,
    'model must start with a letter and contain only alphanumerics, _ or -',
  );

export const codeSchema = z.string().min(3).max(64);
export const metadataSchema = z.record(z.string(), z.unknown());
