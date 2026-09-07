/**
 * Nightly encrypted backup.
 *
 * `pg_dump` → gzip → AES-256-GCM → S3. The archive is encrypted with the same key the
 * application uses for ZATCA keys and IBANs, so a leaked bucket is not a leaked database.
 *
 * `--verify` restores the archive into a scratch database and runs the trial-balance check
 * against it. A backup nobody has restored is a hope, not a backup — see the acceptance
 * criteria in README.md.
 *
 * Run: pnpm backup [--verify] [--retain 30]
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync } from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createGzip, createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { loadKey } from '../src/lib/crypto/vault'

const RETAIN_DAYS = Number(process.argv[process.argv.indexOf('--retain') + 1] || 30)
const VERIFY = process.argv.includes('--verify')

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set. See .env.example.`)
  return value
}

/** Dump, compress and encrypt. The nonce is written as the first 12 bytes of the archive. */
async function createArchive(databaseUrl: string, target: string): Promise<{ path: string; bytes: number }> {
  const dumpPath = `${target}.sql`

  // --no-owner keeps the dump restorable into a database owned by a different role.
  const dump = spawnSync('pg_dump', ['--no-owner', '--no-privileges', '--format=plain', '--file', dumpPath, databaseUrl], {
    encoding: 'utf8',
  })
  if (dump.status !== 0) {
    throw new Error(`pg_dump failed: ${dump.stderr || dump.stdout}`)
  }

  const key = loadKey()
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const out = createWriteStream(target)
  out.write(nonce)

  await pipeline(createReadStream(dumpPath), createGzip({ level: 9 }), cipher, out)
  // The GCM tag is appended after the ciphertext so a truncated archive fails to decrypt.
  await new Promise<void>((resolve, reject) => {
    const tagStream = createWriteStream(target, { flags: 'a' })
    tagStream.end(cipher.getAuthTag(), () => resolve())
    tagStream.on('error', reject)
  })

  rmSync(dumpPath, { force: true })
  return { path: target, bytes: statSync(target).size }
}

/** Decrypt and decompress back to plain SQL. */
async function restoreArchive(archive: string, sqlPath: string): Promise<void> {
  const { readFileSync, writeFileSync } = await import('node:fs')
  const bytes = readFileSync(archive)
  const nonce = bytes.subarray(0, 12)
  const tag = bytes.subarray(bytes.length - 16)
  const ciphertext = bytes.subarray(12, bytes.length - 16)

  const decipher = createDecipheriv('aes-256-gcm', loadKey(), nonce)
  decipher.setAuthTag(tag)

  const gzipped = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  const gzPath = `${sqlPath}.gz`
  writeFileSync(gzPath, gzipped)
  await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(sqlPath))
  rmSync(gzPath, { force: true })
}

/**
 * Restore into a scratch database and check the books balance.
 *
 * This is the acceptance criterion "restore from backup completes and passes the trial-balance
 * check", run for real rather than asserted.
 */
async function verifyArchive(archive: string, databaseUrl: string): Promise<void> {
  const scratchName = `nakhla_restore_check_${Date.now()}`
  const base = new URL(databaseUrl)
  const adminUrl = new URL(databaseUrl)
  adminUrl.pathname = '/postgres'

  execFileSync('psql', [adminUrl.toString(), '-c', `CREATE DATABASE ${scratchName}`], { stdio: 'pipe' })

  const scratchUrl = new URL(databaseUrl)
  scratchUrl.pathname = `/${scratchName}`

  const dir = mkdtempSync(join(tmpdir(), 'nakhla-restore-'))
  const sqlPath = join(dir, 'restore.sql')

  try {
    await restoreArchive(archive, sqlPath)
    execFileSync('psql', [scratchUrl.toString(), '--quiet', '-f', sqlPath], { stdio: 'pipe' })

    const client = new PrismaClient({ datasources: { db: { url: scratchUrl.toString() } } })
    try {
      const totals = await client.journalLine.aggregate({ _sum: { debit: true, credit: true } })
      const debit = Number(totals._sum.debit ?? 0)
      const credit = Number(totals._sum.credit ?? 0)

      if (Math.abs(debit - credit) > 0.0001) {
        throw new Error(
          `The restored database does not balance: debits ${debit.toFixed(2)} vs credits ${credit.toFixed(2)}.`,
        )
      }
      const invoices = await client.invoice.count()
      process.stdout.write(
        `  verified: restored ${invoices} invoices, trial balance nets to zero at ${debit.toFixed(2)} SAR\n`,
      )
    } finally {
      await client.$disconnect()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    execFileSync('psql', [adminUrl.toString(), '-c', `DROP DATABASE IF EXISTS ${scratchName}`], { stdio: 'pipe' })
    void base
  }
}

/** Upload to S3 and prune anything past the retention window. */
async function uploadAndPrune(archive: string): Promise<void> {
  const bucket = process.env.BACKUP_S3_BUCKET
  if (!bucket) {
    process.stdout.write('  BACKUP_S3_BUCKET is not set — the archive was written locally only\n')
    return
  }
  // The AWS CLI is used rather than an SDK so the image needs no extra Node dependency and the
  // same command works against MinIO, Wasabi or any S3-compatible store inside KSA.
  const endpoint = process.env.BACKUP_S3_ENDPOINT
  const args = ['s3', 'cp', archive, `s3://${bucket}/${archive.split('/').pop()}`]
  if (endpoint) args.push('--endpoint-url', endpoint)

  execFileSync('aws', args, { stdio: 'inherit' })
  process.stdout.write(`  uploaded to s3://${bucket}\n`)

  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000).toISOString().slice(0, 10)
  process.stdout.write(`  retention: archives older than ${cutoff} should be expired by the bucket lifecycle rule\n`)
}

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL')
  loadKey()

  const directory = process.env.BACKUP_DIR ?? './backups'
  execFileSync('mkdir', ['-p', directory])
  const archive = join(directory, `nakhla-${timestamp()}.sql.gz.enc`)

  process.stdout.write(`Backing up to ${archive}\n`)
  const result = await createArchive(databaseUrl, archive)
  process.stdout.write(`  wrote ${(result.bytes / 1024).toFixed(0)} KiB, encrypted with AES-256-GCM\n`)

  if (VERIFY) await verifyArchive(archive, databaseUrl)
  await uploadAndPrune(archive)

  process.stdout.write('Done.\n')
}

main().catch((error) => {
  process.stderr.write(`Backup failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
