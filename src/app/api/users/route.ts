// /api/users — GET (daftar) & POST (buat) — admin only
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { userCreateSchema } from '@/lib/validators'

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const

export async function GET() {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  const users = await db.user.findMany({
    select: PUBLIC_FIELDS,
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ users })
}

export async function POST(req: Request) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, userCreateSchema)
  if (parsed.error) return parsed.error
  const { name, email, password, role } = parsed.data

  const exists = await db.user.findUnique({ where: { email } })
  if (exists) {
    return NextResponse.json({ error: 'Email sudah terdaftar.' }, { status: 409 })
  }

  const created = await db.user.create({
    data: { name, email, role, passwordHash: await bcrypt.hash(password, 10) },
    select: PUBLIC_FIELDS,
  })
  await logActivity({
    userId: admin.id,
    action: 'user_created',
    entityType: 'user',
    entityId: created.id,
    newValue: { name, email, role },
    description: `${admin.name} membuat user "${name}" (${role})`,
  })
  return NextResponse.json({ user: created }, { status: 201 })
}
