'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { AuthShell, ErrorBox, SuccessBox } from '@/components/auth-shell'
import { Button, FieldLabel, Input } from '@/components/ui'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Gagal mengirim permintaan.')
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
      title="Lupa password"
      subtitle="Masukkan email akun Anda — kami kirimkan link reset (berlaku 1 jam)."
    >
      {done ? (
        <>
          <SuccessBox>
            Permintaan terkirim. Jika email terdaftar, link reset sudah dikirim — periksa inbox
            Anda.
          </SuccessBox>
          <Link href="/login" className="block text-center text-[13px] font-bold text-brand-1 hover:underline">
            ← Kembali ke halaman masuk
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <ErrorBox>{error}</ErrorBox>
          <div className="mb-6">
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="primary" loading={loading} className="w-full">
            Kirim link reset
          </Button>
          <p className="mt-5 text-center text-[13px] text-ink-500">
            <Link href="/login" className="font-bold text-brand-1 hover:underline">
              ← Kembali ke halaman masuk
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
