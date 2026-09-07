import { describe, expect, it } from 'vitest'
import { toLibpqUrl } from '../../scripts/backup'

/**
 * `pg_dump` rejects a whole connection string rather than ignoring a parameter it does not
 * know, so a Prisma URL — which always carries `schema` — breaks every scheduled backup. This
 * is checked here because the failure only shows up on the first night nobody is watching.
 */
describe('connection strings handed to pg_dump and psql', () => {
  it('drops the Prisma parameters libpq has never heard of', () => {
    const { url, schema } = toLibpqUrl(
      'postgresql://nakhla:secret@db:5432/nakhla_erp?schema=public&connection_limit=10&pgbouncer=true',
    )
    expect(url).not.toContain('schema=')
    expect(url).not.toContain('connection_limit')
    expect(url).not.toContain('pgbouncer')
    expect(schema).toBe('public')
  })

  it('keeps the parameters libpq does use', () => {
    const { url } = toLibpqUrl(
      'postgresql://u:p@db:5432/erp?schema=public&sslmode=require&connect_timeout=10&application_name=nakhla',
    )
    expect(url).toContain('sslmode=require')
    expect(url).toContain('connect_timeout=10')
    expect(url).toContain('application_name=nakhla')
  })

  it('leaves the host, port, database and credentials alone', () => {
    const { url } = toLibpqUrl('postgresql://nakhla:s3cret@db.internal:6543/books?schema=public')
    const parsed = new URL(url)
    expect(parsed.hostname).toBe('db.internal')
    expect(parsed.port).toBe('6543')
    expect(parsed.pathname).toBe('/books')
    expect(parsed.username).toBe('nakhla')
    expect(parsed.password).toBe('s3cret')
  })

  it('reports no schema when the URL carries none', () => {
    expect(toLibpqUrl('postgresql://u:p@localhost:5432/erp').schema).toBeNull()
  })
})
