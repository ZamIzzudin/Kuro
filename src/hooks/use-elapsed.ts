// Hook timer: detak tiap detik, hitung selisih dari sebuah timestamp ISO
'use client'

import { useEffect, useState } from 'react'

export function useElapsedSeconds(sinceIso: string | null | undefined): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!sinceIso) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sinceIso])

  if (!sinceIso) return 0
  return Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 1000))
}
