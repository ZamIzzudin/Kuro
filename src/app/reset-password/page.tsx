'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { AuthShell, ErrorBox, SuccessBox } from '@/components/auth-shell'
import { Button, FieldLabel, Input } from '@/components/ui'

export default function ResetPasswordPage() {
  const [token, setToken] = useState('')
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '')
    setReady(true)
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Konfirmasi password tidak sama.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Gagal mengganti password.')
        return
      }
      setDone(true)
    } catch {
      setError('Terjadi kesalahan jaringan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Password baru"
      subtitle="Buat password baru untuk akun Anda (minimal 8 karakter)."
    >
      {done ? (
        <>
          <SuccessBox>Password berhasil diubah. Silakan login dengan password baru Anda.</SuccessBox>
          <Link
            href="/login"
            className="block text-center text-[13px] font-bold text-brand-1 hover:underline"
          >
            → Ke halaman masuk
          </Link>
        </>
      ) : ready && !token ? (
        <>
          <ErrorBox>Token reset tidak ditemukan di URL. Buka ulang link dari email Anda.</ErrorBox>
          <Link
            href="/forgot-password"
            className="block text-center text-[13px] font-bold text-brand-1 hover:underline"
          >
            Ajukan reset password baru
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <ErrorBox>{error}</ErrorBox>
          <div className="mb-4">
            <FieldLabel htmlFor="password">Password baru</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="mb-6">
            <FieldLabel htmlFor="confirm">Ulangi password baru</FieldLabel>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Ulangi password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <Button type="submit" variant="primary" loading={loading} className="w-full">
            Simpan password baru
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
