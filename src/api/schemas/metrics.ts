import { z } from 'zod'
import {
  finiteNumberSchema,
  isoTimestampSchema,
  stringRecordSchema,
} from './common'

export const metricTypeSchema = z.enum([
  'gauge',
  'counter',
  'histogram',
  'summary',
])

export const aggregationSchema = z.enum([
  'avg',
  'min',
  'max',
  'sum',
  'count',
  'p50',
  'p95',
  'p99',
  'first',
  'last',
  'rate',
  'stddev',
])

export const metricDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.union([z.string(), stringRecordSchema]).optional(),
    type: metricTypeSchema,
    unit: z.string().optional(),
    retention_days: z.number().int(),
    metadata: stringRecordSchema.optional(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
  })
  .passthrough()

export const metricDefinitionsSchema = z.array(metricDefinitionSchema)

export const metricPointSchema = z
  .object({
    time: isoTimestampSchema,
    value: finiteNumberSchema.nullable(),
    count: z.number().int().optional(),
    tags: stringRecordSchema.optional(),
    labels: stringRecordSchema.optional(),
  })
  .passthrough()

export const metricSeriesSchema = z
  .object({
    metric_key: z.string().min(1),
    entity_id: z.string().min(1),
    type: metricTypeSchema.optional(),
    unit: z.string().optional(),
    retention_days: z.number().int().optional(),
    tags: stringRecordSchema.optional(),
    downsampled: z.boolean(),
    downsample_algorithm: aggregationSchema.optional(),
    fill_empty: z.boolean().optional(),
    max_points: z.number().int().positive().optional(),
    interval_seconds: finiteNumberSchema.positive().optional(),
    count: z.number().int().nonnegative(),
    points: z.array(metricPointSchema),
  })
  .passthrough()

export const metricQueryResultSchema = z
  .object({
    start: isoTimestampSchema,
    end: isoTimestampSchema,
    server_downsample_default: z.literal(true),
    default_points: z.number().int().positive(),
    series: z.array(metricSeriesSchema),
    count: z.number().int().nonnegative(),
  })
  .passthrough()

const positivePointMapSchema = z.record(z.string(), z.number().int().positive())
const aggregationMapSchema = z.record(z.string(), aggregationSchema)

export const metricQueryParamsSchema = z
  .object({
    metric_key: z.string().min(1).optional(),
    metric_keys: z.array(z.string().min(1)).optional(),
    metrics: z.array(z.string().min(1)).optional(),
    entity_id: z.string().min(1).optional(),
    entity_ids: z.array(z.string().min(1)).optional(),
    start: isoTimestampSchema.optional(),
    start_time: isoTimestampSchema.optional(),
    end: isoTimestampSchema.optional(),
    end_time: isoTimestampSchema.optional(),
    hours: finiteNumberSchema.positive().optional(),
    tags: stringRecordSchema.optional(),
    fill_empty: z.boolean().optional(),
    max_points: z.number().int().positive().optional(),
    max_points_by_metric: positivePointMapSchema.optional(),
    points_by_metric: positivePointMapSchema.optional(),
    aggregation: aggregationSchema.optional(),
    algorithm: aggregationSchema.optional(),
    aggregation_by_metric: aggregationMapSchema.optional(),
    algorithm_by_metric: aggregationMapSchema.optional(),
  })
  .refine(
    (value) =>
      Boolean(value.metric_key) ||
      Boolean(value.metric_keys?.length) ||
      Boolean(value.metrics?.length),
    { message: 'At least one metric key is required' },
  )

export const publicPingTaskSchema = z
  .object({
    id: z.number().int().nonnegative(),
    weight: z.number().int(),
    name: z.string(),
    clients: z.array(z.string()),
    default_on: z.boolean(),
    type: z.string(),
    interval: z.number().int(),
  })
  .passthrough()

export const publicPingTasksSchema = z.array(publicPingTaskSchema)

export const pingMetricStatsParamsSchema = z.object({
  uuid: z.string().min(1).optional(),
  entity_id: z.string().min(1).optional(),
  entity_ids: z.array(z.string().min(1)).optional(),
  task_id: z.union([z.string(), z.number()]).optional(),
  task_ids: z.array(z.union([z.string(), z.number()])).optional(),
  start: isoTimestampSchema.optional(),
  start_time: isoTimestampSchema.optional(),
  end: isoTimestampSchema.optional(),
  end_time: isoTimestampSchema.optional(),
  hours: finiteNumberSchema.positive().optional(),
  max_points: z.number().int().positive().optional(),
})

export const pingMetricTaskStatsSchema = z
  .object({
    entity_id: z.string().min(1),
    task_id: z.string().min(1),
    name: z.string().optional(),
    type: z.string().optional(),
    interval: z.number().int().optional(),
    tags: stringRecordSchema.optional(),
    total: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    loss: finiteNumberSchema,
    loss_approximate: z.boolean().optional(),
    min: finiteNumberSchema.optional(),
    max: finiteNumberSchema.optional(),
    avg: finiteNumberSchema.optional(),
    latest: finiteNumberSchema.optional(),
    p50: finiteNumberSchema.optional(),
    p99: finiteNumberSchema.optional(),
    stddev: finiteNumberSchema.optional(),
    p99_p50_ratio: finiteNumberSchema,
  })
  .passthrough()

export const pingMetricStatsResultSchema = z
  .object({
    start: isoTimestampSchema,
    end: isoTimestampSchema,
    interval_seconds: finiteNumberSchema.positive().optional(),
    stats: z.array(pingMetricTaskStatsSchema),
    count: z.number().int().nonnegative(),
  })
  .passthrough()

export type MetricType = z.infer<typeof metricTypeSchema>
export type Aggregation = z.infer<typeof aggregationSchema>
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>
export type MetricPoint = z.infer<typeof metricPointSchema>
export type MetricSeries = z.infer<typeof metricSeriesSchema>
export type MetricQueryResult = z.infer<typeof metricQueryResultSchema>
export type MetricQueryParams = z.infer<typeof metricQueryParamsSchema>
export type PublicPingTask = z.infer<typeof publicPingTaskSchema>
export type PingMetricStatsParams = z.infer<typeof pingMetricStatsParamsSchema>
export type PingMetricTaskStats = z.infer<typeof pingMetricTaskStatsSchema>
export type PingMetricStatsResult = z.infer<typeof pingMetricStatsResultSchema>
