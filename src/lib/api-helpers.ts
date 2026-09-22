// Helper umum untuk API routes
import { NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'

/** Parse + validasi body JSON dengan zod → 400 jika gagal */
export async function parseJson<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      data: null,
      error: NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' },
        { status: 400 }
      ),
    }
  }
  return { data: parsed.data, error: null }
}

/** Pesan ramah untuk error Prisma yang umum */
export function prismaError(e: unknown): NextResponse | null {
  const code = (e as { code?: string })?.code
  if (code === 'P2002') {
    return NextResponse.json({ error: 'Nama/email sudah dipakai.' }, { status: 409 })
  }
  if (code === 'P2025') {
    return NextResponse.json({ error: 'Data tidak ditemukan.' }, { status: 404 })
  }
  return null
}
