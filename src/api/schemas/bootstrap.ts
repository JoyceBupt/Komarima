import { z } from 'zod'
import { isoTimestampSchema, unknownRecordSchema } from './common'

export const restEnvelopeSchema = <Output, Input = Output>(
  dataSchema: z.ZodType<Output, Input>,
) =>
  z
    .object({
      status: z.literal('success'),
      message: z.string(),
      data: dataSchema,
    })
    .passthrough()

export const restErrorSchema = z
  .object({
    status: z.literal('error'),
    message: z.string(),
  })
  .passthrough()

export const publicInfoSchema = z
  .object({
    sitename: z.string(),
    description: z.string(),
    custom_head: z.string(),
    custom_body: z.string(),
    oauth_enable: z.boolean(),
    oauth_provider: z.string(),
    disable_password_login: z.boolean(),
    cors_origin_check_enabled: z.boolean(),
    record_enabled: z.boolean(),
    record_preserve_time: z.number().int(),
    ping_record_preserve_time: z.number().int(),
    private_site: z.boolean(),
    visitor_audit_enabled: z.boolean(),
    theme: z.string(),
    theme_settings: unknownRecordSchema,
  })
  .passthrough()

export const meSchema = z
  .object({
    logged_in: z.boolean(),
    username: z.string(),
    uuid: z.string().optional(),
    sso_type: z.string().optional(),
    sso_id: z.string().optional(),
    '2fa_enabled': z.boolean().optional(),
  })
  .passthrough()

export const versionInfoSchema = z
  .object({
    version: z.string(),
    hash: z.string(),
  })
  .passthrough()

export const healthTimestampSchema = z
  .object({
    time: isoTimestampSchema,
  })
  .passthrough()

export type PublicInfo = z.infer<typeof publicInfoSchema>
export type Me = z.infer<typeof meSchema>
export type VersionInfo = z.infer<typeof versionInfoSchema>
