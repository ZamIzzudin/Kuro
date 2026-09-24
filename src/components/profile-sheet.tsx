'use client'

// Sheet profil sendiri — user mengubah foto, username, nama lengkap, & password.
// Dipisah menjadi dua tab (Profil / Password) agar rapi. Email hanya ditampilkan.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Camera, KeyRound, Trash2, UserRound } from 'lucide-react'
import { Button, ErrorNote, FieldLabel, Input, SuccessNote } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { Avatar } from '@/components/avatar'
import { apiSend, fetcher } from '@/lib/client'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/lib/auth'

type MeResponse = { user: SessionUser }
type Tab = 'profil' | 'password'

export function ProfileSheet({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: SessionUser
}) {
  const [tab, setTab] = useState<Tab>('profil')

  return (
    <Sheet open={open} onClose={onClose} title="Profil Saya" size="md">
      <div className="space-y-5">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Bagian profil">
          <TabButton active={tab === 'profil'} onClick={() => setTab('profil')} icon={<UserRound className="h-4 w-4" />}>
            Profil
          </TabButton>
          <TabButton active={tab === 'password'} onClick={() => setTab('password')} icon={<KeyRound className="h-4 w-4" />}>
            Password
          </TabButton>
        </div>

        {tab === 'profil' ? <ProfileTab open={open} onClose={onClose} user={user} /> : <ChangePasswordTab open={open} />}
      </div>
    </Sheet>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold transition',
        active ? 'bg-surface text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-900'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function ProfileTab({ open, onClose, user }: { open: boolean; onClose: () => void; user: SessionUser }) {
  const router = useRouter()
  const meReq = useSWR<MeResponse>(open ? '/api/auth/me' : null, fetcher)
  const me = meReq.data?.user ?? user

  const [username, setUsername] = useState(me.username ?? '')
  const [name, setName] = useState(me.name)
  // avatarKey: undefined = tidak diubah, string = ganti, null = hapus
  const [avatarKey, setAvatarKey] = useState<string | null | undefined>(undefined)
  const [avatarPreview, setAvatarPreview] = useState<string | null | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Segarkan nilai form tiap kali sheet dibuka (komponen tetap ter-mount).
  useEffect(() => {
    if (!open) return
    setUsername(user.username ?? '')
    setName(user.name)
    setAvatarKey(undefined)
    setAvatarPreview(undefined)
    setError(null)
    setOk(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const previewSrc =
    avatarPreview !== undefined
      ? avatarPreview
      : avatarKey === null
        ? null
        : avatarKey !== undefined
          ? `/api/users/${me.id}/avatar?v=${encodeURIComponent(avatarKey)}`
          : me.avatarUrl

  async function pickFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError(null)
    setOk(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/uploads/avatar', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Gagal mengunggah foto')
      setAvatarKey(data.key as string)
      setAvatarPreview(URL.createObjectURL(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengunggah foto')
    } finally {
      setUploading(false)
    }
  }

  async function submitProfile(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      await apiSend('/api/profile', 'PATCH', {
        username: username.trim() || null,
        name: name.trim(),
        ...(avatarKey !== undefined ? { avatarKey } : {}),
      })
      setAvatarKey(undefined)
      setAvatarPreview(undefined)
      await meReq.mutate()
      router.refresh()
      setOk('Profil berhasil disimpan.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan profil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submitProfile} className="space-y-5">
      {/* Foto profil */}
      <div className="flex items-center gap-4">
        <Avatar name={me.name} src={previewSrc} size={72} />
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {!uploading && <Camera className="h-3.5 w-3.5" />} Ganti Foto
            </Button>
            {previewSrc && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAvatarKey(null)
                  setAvatarPreview(null)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </Button>
            )}
          </div>
          <p className="mt-2 text-[12px] text-ink-400">PNG, JPEG, atau WebP · maksimal 2 MB.</p>
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="p-name">Nama Lengkap</FieldLabel>
        <Input
          id="p-name"
          required
          minLength={2}
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="cth: Rani Pratama"
        />
      </div>
      <div>
        <FieldLabel htmlFor="p-username">Username</FieldLabel>
        <Input
          id="p-username"
          value={username}
          maxLength={30}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="cth: rani.pratama"
        />
        <p className="mt-1.5 text-[12px] text-ink-400">
          3–30 karakter — huruf kecil, angka, titik, `_` atau `-`.
        </p>
      </div>
      <div>
        <FieldLabel htmlFor="p-email">Email</FieldLabel>
        <Input id="p-email" value={me.email} disabled readOnly />
        <p className="mt-1.5 text-[12px] text-ink-400">Email tidak dapat diubah.</p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {ok && <SuccessNote>{ok}</SuccessNote>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>
          Tutup
        </Button>
        <Button type="submit" loading={saving} disabled={uploading}>
          <UserRound className="h-4 w-4" /> Simpan Profil
        </Button>
      </div>
    </form>
  )
}

function ChangePasswordTab({ open }: { open: boolean }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Kosongkan form tiap kali sheet dibuka.
  useEffect(() => {
    if (!open) return
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setError(null)
    setOk(null)
  }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (newPassword !== confirm) {
      setError('Konfirmasi password tidak sama.')
      return
    }
    setSaving(true)
    try {
      const res = await apiSend<{ message: string }>('/api/profile/password', 'POST', {
        currentPassword,
        newPassword,
      })
      setOk(res.message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <FieldLabel htmlFor="p-cur">Password Saat Ini</FieldLabel>
        <Input
          id="p-cur"
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="p-new">Password Baru</FieldLabel>
        <Input
          id="p-new"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Minimal 8 karakter"
        />
      </div>
      <div>
        <FieldLabel htmlFor="p-conf">Konfirmasi Password Baru</FieldLabel>
        <Input
          id="p-conf"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <p className="text-[12px] text-ink-400">
        Sesi di perangkat lain akan dikeluarkan; Anda tetap login di perangkat ini.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}
      {ok && <SuccessNote>{ok}</SuccessNote>}

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          <KeyRound className="h-4 w-4" /> Ganti Password
        </Button>
      </div>
    </form>
  )
}
