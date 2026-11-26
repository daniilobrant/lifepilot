/** Filter für „Wichtige Nachrichten“ auf der Startseite: nur Mails von echten Personen, keine automatischen Absender. */
import type { InboxLabel } from '../../agents/lifepilot/tools/classify-mail.ts'

const personLabels: ReadonlySet<string> = new Set<InboxLabel>(['personal', 'university', 'work', 'careers', 'leisure', 'review'])
const automatedLocal = /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|noreply|newsletter|news|notifications?|mailer|mailer-daemon|service|support|info|team|billing|rechnung|bestellung|order|orders|shop|kundenservice|kontakt|hello|hallo|alerts?|security|account|updates?)(?:[-_.+].*)?$/iu
const automatedDomain = /(?:^|\.)(?:paypal|klarna|amazon|ebay|google|apple|microsoft|linkedin|indeed|instaff|dhl|dpd|hermes|ups|fedex|zalando|netflix|spotify)\.[a-z.]+$/iu

export function senderAddress(from: string) {
  const match = /<([^<>\s]+@[^<>\s]+)>\s*$/u.exec(from) ?? /([^\s<>]+@[^\s<>]+)\s*$/u.exec(from)
  return match?.[1].toLowerCase() ?? ''
}

export function isPersonMail(mail: { label: string, from: string, shipment?: unknown }) {
  if (!personLabels.has(mail.label) || mail.shipment) return false
  const [local = '', domain = ''] = senderAddress(mail.from).split('@')
  if (!local || automatedLocal.test(local) || automatedDomain.test(domain)) return false
  return true
}
