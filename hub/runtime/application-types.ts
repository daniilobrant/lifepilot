export const applicationStatuses = {
  applied: 'Beworben', reply: 'Rückmeldung erhalten', interview: 'Vorstellungsgespräch',
  offer: 'Zusage', rejected: 'Absage', withdrawn: 'Zurückgezogen',
} as const
export type ApplicationStatus = keyof typeof applicationStatuses
export const applicationGroups = [
  { title: 'Beworben', statuses: ['applied'] },
  { title: 'Im Austausch', statuses: ['reply', 'interview'] },
  { title: 'Abgeschlossen', statuses: ['offer', 'rejected', 'withdrawn'] },
] as const
export type ApplicationDraft = {
  company: string, role: string, location: string, salary: string, description: string, notes: string, link: string,
  applied_on: string | null, follow_up: string | null, status: ApplicationStatus,
}
export type Application = ApplicationDraft & { id: string, revision: number, updated_at: string }
export type ApplicationSource = Pick<ApplicationDraft, 'company' | 'role' | 'location' | 'status'> & {
  id: string, title: string, application_id: string | null,
  salary?: string, description?: string, notes?: string, link?: string,
  applied_on?: string | null, follow_up?: string | null,
}
export type ApplicationOverview = {
  items: Application[], sources: ApplicationSource[], stats: Record<ApplicationStatus, number>,
}
export const emptyApplication: ApplicationDraft = {
  company: '', role: '', location: '', salary: '', description: '', notes: '', link: '',
  applied_on: null, follow_up: null, status: 'applied',
}
