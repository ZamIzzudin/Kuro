// Kuro — definisi role & label (modul netral, aman diimpor dari server maupun client)
export const ROLES = ['admin', 'project_manager', 'freelancer'] as const

export type Role = (typeof ROLES)[number]

/**
 * Role yang boleh masuk area /admin (Admin & Project Manager).
 * Project Manager dikelola seperti admin untuk Project/Sprint/Task/Master,
 * tetapi tanpa User, Rekap & Export, dan Review Koreksi.
 */
export const ADMIN_ROLES = ['admin', 'project_manager'] as const satisfies ReadonlyArray<Role>

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  freelancer: 'Freelancer',
}

export function hasAdminAccess(role: Role): boolean {
  return (ADMIN_ROLES as ReadonlyArray<Role>).includes(role)
}
