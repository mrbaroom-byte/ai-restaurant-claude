/**
 * Emit the OpenAPI 3.1 document from the same Zod schemas the route handlers validate against,
 * so the published spec cannot drift from what the API actually accepts.
 *
 * Written by hand rather than pulled from a converter: the schema set is small, and a converter
 * would add a dependency to the build for output nobody would read differently.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { ENDPOINTS, errorResponse } from '../src/lib/api/contract'

type Schema = Record<string, unknown>

/** Translate a Zod type into a JSON Schema fragment. */
function toJsonSchema(schema: z.ZodTypeAny): Schema {
  const def = schema._def as { typeName?: string; [key: string]: unknown }

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape
      const properties: Schema = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value as z.ZodTypeAny)
        if (!(value as z.ZodTypeAny).isOptional()) required.push(key)
      }
      return { type: 'object', properties, ...(required.length ? { required } : {}) }
    }
    case 'ZodArray':
      return { type: 'array', items: toJsonSchema((def.type as z.ZodTypeAny) ?? z.unknown()) }
    case 'ZodString': {
      const checks = (def.checks ?? []) as Array<{ kind: string; regex?: RegExp }>
      const uuid = checks.some((check) => check.kind === 'uuid')
      const email = checks.some((check) => check.kind === 'email')
      return { type: 'string', ...(uuid ? { format: 'uuid' } : {}), ...(email ? { format: 'email' } : {}) }
    }
    case 'ZodNumber':
      return { type: 'number' }
    case 'ZodBoolean':
      return { type: 'boolean' }
    case 'ZodDate':
      return { type: 'string', format: 'date-time' }
    case 'ZodEnum':
      return { type: 'string', enum: def.values as string[] }
    case 'ZodOptional':
    case 'ZodNullable':
      return toJsonSchema(def.innerType as z.ZodTypeAny)
    case 'ZodDefault': {
      const inner = toJsonSchema(def.innerType as z.ZodTypeAny)
      const value = (def.defaultValue as () => unknown)()
      // A default computed at generation time — `new Date()` — would differ on every run and
      // make the "spec is up to date" check in CI fail for no reason. Describe it instead.
      if (value instanceof Date) return { ...inner, description: 'Defaults to the current time.' }
      if (value !== null && typeof value === 'object') return inner
      return { ...inner, default: value }
    }
    case 'ZodEffects':
      return toJsonSchema(def.schema as z.ZodTypeAny)
    case 'ZodUnion':
      return { oneOf: (def.options as z.ZodTypeAny[]).map(toJsonSchema) }
    case 'ZodPipeline':
      return toJsonSchema(def.out as z.ZodTypeAny)
    default:
      return {}
  }
}

const paths: Record<string, Record<string, unknown>> = {}

for (const endpoint of ENDPOINTS) {
  // OpenAPI uses {id}; the contract already writes it that way.
  const path = endpoint.path
  paths[path] ??= {}

  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  }))

  paths[path][endpoint.method.toLowerCase()] = {
    summary: endpoint.summary,
    operationId: `${endpoint.method.toLowerCase()}${path.replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())}`,
    tags: [path.split('/')[3] ?? 'root'],
    security: endpoint.permission === null ? [] : [{ sessionCookie: [] }, { apiKey: [] }],
    ...('request' in endpoint && endpoint.request
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: toJsonSchema(endpoint.request as z.ZodTypeAny) } },
          },
        }
      : {}),
    ...(parameters.length ? { parameters } : {}),
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/json': {
            schema: 'response' in endpoint && endpoint.response ? toJsonSchema(endpoint.response as z.ZodTypeAny) : {},
          },
        },
      },
      '401': { description: 'Not signed in', content: { 'application/json': { schema: toJsonSchema(errorResponse) } } },
      '403': {
        description: endpoint.permission ? `Requires the ${endpoint.permission} permission` : 'Forbidden',
        content: { 'application/json': { schema: toJsonSchema(errorResponse) } },
      },
      '409': {
        description: 'The request conflicts with the state of the books, e.g. a closed period',
        content: { 'application/json': { schema: toJsonSchema(errorResponse) } },
      },
      '422': {
        description: 'The request failed validation; details name the fields',
        content: { 'application/json': { schema: toJsonSchema(errorResponse) } },
      },
    },
  }
}

const document = {
  openapi: '3.1.0',
  info: {
    title: 'Nakhla ERP API',
    version: '1.0.0',
    description:
      'Small business ERP for Saudi Arabia: double-entry accounting, ZATCA Phase 2 e-invoicing, ' +
      'inventory, point of sale and payroll. Every endpoint is scoped to the tenant of the ' +
      'presented credential; there is no cross-tenant route.',
    license: { name: 'MIT' },
  },
  servers: [{ url: '{origin}', variables: { origin: { default: 'http://localhost:3000' } } }],
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'nakhla_session' },
      apiKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'A session token from /api/v1/auth/login, or a long-lived API key.',
      },
    },
  },
  paths,
}

const output = join(__dirname, '../docs/openapi.json')
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`)
process.stdout.write(`Wrote ${Object.keys(paths).length} paths to ${output}\n`)
