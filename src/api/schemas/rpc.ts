import { z } from 'zod'

export const rpcIdSchema = z.union([z.string(), z.number(), z.null()])

export const rpcErrorSchema = z
  .object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .passthrough()

export const rpcFailureSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: rpcIdSchema.optional(),
  error: rpcErrorSchema,
})

export const rpcSuccessSchema = <Output, Input = Output>(
  resultSchema: z.ZodType<Output, Input>,
) =>
  z.object({
    jsonrpc: z.literal('2.0'),
    id: rpcIdSchema.optional(),
    result: resultSchema,
  })

export const rpcResponseSchema = <Output, Input = Output>(
  resultSchema: z.ZodType<Output, Input>,
) => z.union([rpcSuccessSchema(resultSchema), rpcFailureSchema])

export const rpcMethodsSchema = z.array(z.string())
