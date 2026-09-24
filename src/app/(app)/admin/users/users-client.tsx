'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { KeyRound, Pencil, Plus, Power, PowerOff } from 'lucide-react'
import { Button, ErrorNote, FieldLabel, IconButton, Input, Select, Spinner, SuccessNote } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { RoleBadge, StatusBadge } from '@/components/pills'
import { apiSend, fetcher } from '@/lib/client'
import { formatDateWIB } from '@/lib/time'

type UserRow = {
  id: string
  name: string
  email: string
  role: 'admin' | 'freelancer'
  isActive: boolean
  createdAt: string
}

export function UsersClient() {
  const { data, mutate, isLoading } = useSWR<{ users: UserRow[] }>('/api/users', fetcher)
  const [createOpen, setCreateOpen] = useState(false)
  const [editFor, setEditFor] = useState<UserRow | null>(null)
  const [resetFor, setResetFor] = useState<UserRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const users = data?.users ?? []

  async function toggleActive(u: UserRow) {
    setToggleError(null)
    setBusyId(u.id)
    try {
      await apiSend(`/api/users/${u.id}`, 'PATCH', { isActive: !u.isActive })
      await mutate()
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : 'Gagal mengubah status')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-extrabold">User</h1>
          <p className="mt-1 text-sm text-ink-500">Kelola akun admin & freelancer</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.4} /> Tambah User
        </Button>
      </div>

      {toggleError && (
        <div className="mb-4">
          <ErrorNote>{toggleError}</ErrorNote>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-ink-400">
            <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat…</span>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-bold text-ink-700">Belum ada user</p>
            <p className="mt-1 text-sm text-ink-500">Klik “Tambah User” untuk membuat akun pertama.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2/60 text-left text-[11px] font-bold uppercase tracking-wider text-ink-400">
                <th className="px-5 py-3">Nama</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Dibuat</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line transition hover:bg-surface-2/50">
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-ink-900">{u.name}</p>
                    <p className="text-[13px] text-ink-500">{u.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge active={u.isActive} />
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-ink-500">{formatDateWIB(u.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label={`Edit ${u.name}`}
                        icon={<Pencil className="h-4 w-4" />}
                        onClick={() => setEditFor(u)}
                      />
                      <IconButton
                        label={`Reset password ${u.name}`}
                        icon={<KeyRound className="h-4 w-4" />}
                        onClick={() => setResetFor(u)}
                      />
                      <IconButton
                        label={u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        variant={u.isActive ? 'danger' : 'secondary'}
                        loading={busyId === u.id}
                        disabled={
                          u.isActive &&
                          u.role === 'admin' &&
                          users.filter((x) => x.role === 'admin' && x.isActive).length <= 1
                        }
                        icon={
                          u.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />
                        }
                        onClick={() => toggleActive(u)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => mutate()} />
      <EditSheet user={editFor} onClose={() => setEditFor(null)} onDone={() => mutate()} />
      <ResetSheet user={resetFor} onClose={() => setResetFor(null)} />
    </div>
  )
}

function CreateSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'freelancer' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiSend('/api/users', 'POST', form)
      setForm({ name: '', email: '', password: '', role: 'freelancer' })
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Tambah User">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="u-name">Nama</FieldLabel>
          <Input
            id="u-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="cth: Rani Pratama"
          />
        </div>
        <div>
          <FieldLabel htmlFor="u-email">Email</FieldLabel>
          <Input
            id="u-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="nama@email.com"
          />
        </div>
        <div>
          <FieldLabel htmlFor="u-pass">Password Awal</FieldLabel>
          <Input
            id="u-pass"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Minimal 8 karakter"
          />
        </div>
        <div>
          <FieldLabel htmlFor="u-role">Role</FieldLabel>
          <Select
            id="u-role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="freelancer">Freelancer</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving}>
            Simpan
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function EditSheet({ user, onClose, onDone }: { user: UserRow | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'freelancer'>('freelancer')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [current, setCurrent] = useState<UserRow | null>(null)

  // Sinkron saat user berubah
  if (user && user !== current) {
    setCurrent(user)
    setName(user.name)
    setRole(user.role)
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!current) return
    setSaving(true)
    setError(null)
    try {
      await apiSend(`/api/users/${current.id}`, 'PATCH', { name, role })
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!user} onClose={onClose} title="Edit User">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="e-name">Nama</FieldLabel>
          <Input id="e-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="e-role">Role</FieldLabel>
          <Select id="e-role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'freelancer')}>
            <option value="freelancer">Freelancer</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving}>
            Simpan
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function ResetSheet({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const res = await apiSend<{ message: string }>(`/api/users/${user.id}/reset-password`, 'POST', {
        password,
      })
      setOk(res.message)
      setPassword('')
      setTimeout(() => {
        setOk(null)
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={!!user}
      onClose={onClose}
      title={`Reset Password — ${user?.name ?? ''}`}
      description="Semua sesi aktif user ini akan dikeluarkan."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="r-pass">Password Baru</FieldLabel>
          <Input
            id="r-pass"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimal 8 karakter"
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        {ok && <SuccessNote>{ok}</SuccessNote>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving}>
            Reset Password
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
