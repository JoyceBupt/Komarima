import { z } from 'zod'
import { finiteNumberSchema, isoTimestampSchema } from './common'

export const publicNodeSchema = z
  .object({
    uuid: z.string().min(1),
    name: z.string(),
    cpu_name: z.string(),
    virtualization: z.string(),
    arch: z.string(),
    cpu_cores: z.number().int(),
    cpu_physical_cores: z.number().int(),
    os: z.string(),
    kernel_version: z.string(),
    gpu_name: z.string(),
    region: z.string(),
    public_remark: z.string().optional(),
    mem_total: finiteNumberSchema,
    swap_total: finiteNumberSchema,
    disk_total: finiteNumberSchema,
    weight: z.number().int(),
    price: finiteNumberSchema,
    billing_cycle: z.number().int(),
    auto_renewal: z.boolean(),
    currency: z.string(),
    expired_at: isoTimestampSchema.nullable(),
    group: z.string(),
    tags: z.string(),
    hidden: z.boolean(),
    traffic_limit: finiteNumberSchema,
    traffic_limit_type: z.string(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
  })
  .strip()

export const publicNodesSchema = z.array(publicNodeSchema)

export const publicNodeMapSchema = z.record(z.string(), publicNodeSchema)

export const pingLatestStatSchema = z
  .object({
    name: z.string(),
    latest: finiteNumberSchema,
    avg: finiteNumberSchema,
    tail: finiteNumberSchema,
    loss: finiteNumberSchema,
    min: finiteNumberSchema,
    max: finiteNumberSchema,
  })
  .passthrough()

export const latestStatusSchema = z
  .object({
    client: z.string().min(1),
    time: isoTimestampSchema,
    cpu: finiteNumberSchema,
    gpu: finiteNumberSchema,
    ram: finiteNumberSchema,
    ram_total: finiteNumberSchema,
    swap: finiteNumberSchema,
    swap_total: finiteNumberSchema,
    load: finiteNumberSchema,
    load5: finiteNumberSchema,
    load15: finiteNumberSchema,
    temp: finiteNumberSchema,
    disk: finiteNumberSchema,
    disk_total: finiteNumberSchema,
    net_in: finiteNumberSchema,
    net_out: finiteNumberSchema,
    net_total_up: finiteNumberSchema,
    net_total_down: finiteNumberSchema,
    process: z.number().int(),
    connections: z.number().int(),
    connections_udp: z.number().int(),
    online: z.boolean(),
    uptime: finiteNumberSchema,
    ping: z.record(z.string(), pingLatestStatSchema),
  })
  .passthrough()

export const latestStatusMapSchema = z
  .record(z.string(), latestStatusSchema)
  .superRefine((statuses, context) => {
    for (const [uuid, status] of Object.entries(statuses)) {
      if (status.client === uuid) continue
      context.addIssue({
        code: 'custom',
        message: `Latest status key ${uuid} does not match client ${status.client}`,
        path: [uuid, 'client'],
      })
    }
  })

export const latestStatusParamsSchema = z
  .object({
    uuid: z.string().trim().min(1).optional(),
    uuids: z.array(z.string().trim().min(1)).min(1).optional(),
  })
  .refine((value) => !(value.uuid && value.uuids), {
    message: 'uuid and uuids are mutually exclusive',
  })

export type PublicNode = z.infer<typeof publicNodeSchema>
export type LatestStatus = z.infer<typeof latestStatusSchema>
export type PingLatestStat = z.infer<typeof pingLatestStatSchema>
export type LatestStatusParams = z.infer<typeof latestStatusParamsSchema>
