/** Authorization-domain request and response schemas. */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

const keySchema = z.string().min(3)
const attemptIdSchema = z.string().min(1)

const methodSchema = z.object({ id: z.string().min(1), label: z.string().min(1) })

const noticeSchema = z.object({
  message: z.string(),
  url: z.string().optional(),
  code: z.string().optional(),
})

const promptSchema = z.intersection(
  z.object({ id: z.string().min(1), message: z.string(), placeholder: z.string().optional() }),
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text') }),
    z.object({ kind: z.literal('secret') }),
    z.object({
      kind: z.literal('select'),
      options: z.array(z.object({
        id: z.string(), label: z.string(), description: z.string().optional(),
      })),
    }),
  ]),
)

const attemptSchema = z.object({
  attemptId: attemptIdSchema,
  key: keySchema,
  state: z.union([
    z.literal('running'), z.literal('prompt'), z.literal('authorized'),
    z.literal('cancelled'), z.literal('failed'),
  ]),
  notices: z.array(noticeSchema),
  prompt: promptSchema.optional(),
  error: z.string().optional(),
})

/** authorization.list request payload. */
export const authorizationListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'authorization.list'>>>
/** authorization.list response value. */
export const authorizationListValueSchema = z.object({
  entries: z.array(z.object({
    key: keySchema,
    label: z.string(),
    methods: z.array(methodSchema),
    inFlight: z.boolean(),
    configured: z.boolean(),
    writable: z.boolean(),
    credentialKind: z.union([z.literal('api-key'), z.literal('grant')]).optional(),
  })),
}) satisfies z.ZodType<Wire<ResponseValue<'authorization.list'>>>

/** authorization.start request payload. */
export const authorizationStartRequestSchema = z.object({
  key: keySchema, method: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'authorization.start'>>>
/** authorization.start response value. */
export const authorizationStartValueSchema = z.object({ attempt: attemptSchema }) satisfies z.ZodType<Wire<ResponseValue<'authorization.start'>>>

/** authorization.status request payload. */
export const authorizationStatusRequestSchema = z.object({
  key: keySchema, attemptId: attemptIdSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'authorization.status'>>>
/** authorization.status response value. */
export const authorizationStatusValueSchema = z.object({ attempt: attemptSchema }) satisfies z.ZodType<Wire<ResponseValue<'authorization.status'>>>

/** authorization.respond request payload. */
export const authorizationRespondRequestSchema = z.object({
  key: keySchema, attemptId: attemptIdSchema, promptId: z.string().min(1), value: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'authorization.respond'>>>
/** authorization.respond response value. */
export const authorizationRespondValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'authorization.respond'>>>

/** authorization.cancel request payload. */
export const authorizationCancelRequestSchema = z.object({
  key: keySchema, attemptId: attemptIdSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'authorization.cancel'>>>
/** authorization.cancel response value. */
export const authorizationCancelValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'authorization.cancel'>>>

/** authorization.signOut request payload. */
export const authorizationSignOutRequestSchema = z.object({ key: keySchema }) satisfies z.ZodType<Wire<RequestPayload<'authorization.signOut'>>>
/** authorization.signOut response value. */
export const authorizationSignOutValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'authorization.signOut'>>>
