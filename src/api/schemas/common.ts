import { z } from 'zod'

export const finiteNumberSchema = z.number().finite()

export const integerSchema = finiteNumberSchema.int()

const rfc3339Pattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/

export const isoTimestampSchema = z
  .string()
  .refine(
    (value) => rfc3339Pattern.test(value) && Number.isFinite(Date.parse(value)),
    'Expected an RFC3339 timestamp with an explicit timezone',
  )

export const stringRecordSchema = z.record(z.string(), z.string())

export const unknownRecordSchema = z.record(z.string(), z.unknown())
