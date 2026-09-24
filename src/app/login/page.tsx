"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthShell, ErrorBox } from "@/components/auth-shell";
import { Button, FieldLabel, Input } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal masuk. Coba lagi.");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // Hanya izinkan path internal (cegah open redirect: '//evil.com', '/\evil.com')
      const safeNext =
        next && /^\/(?!\/)/.test(next) && !next.startsWith("/\\") ? next : null;
      const target =
        safeNext ?? (data.user?.role === "admin" ? "/admin" : "/home");
      window.location.href = target;
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in."
      subtitle="Masuk menggunakan akun yang anda miliki"
    >
      <form onSubmit={onSubmit}>
        <ErrorBox>{error}</ErrorBox>
        <div className="mb-4">
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
        <div className="mb-6">
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          loading={loading}
          className="w-full"
        >
          Masuk
        </Button>
      </form>
      <p className="mt-5 text-center text-[13px] text-ink-500">
        Lupa password?{" "}
        <Link
          href="/forgot-password"
          className="font-bold text-brand-1 hover:underline"
        >
          Reset di sini
        </Link>
      </p>
    </AuthShell>
  );
}
