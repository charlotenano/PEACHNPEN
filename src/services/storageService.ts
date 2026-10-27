import { z } from 'zod'

import type { Account, MaterialRecord, ProfileIcon, SourceDocument } from '../types'
import { materialRecordSchema } from './materialService'
import { sourceDocumentSchema } from './documentService'

const ACCOUNTS_KEY = 'peach-pen-accounts-v1'
const SESSION_KEY = 'peach-pen-session-v1'
const LAST_SOURCE_KEY = 'peach-pen-last-source-v1'

const accountSchema = z.object({ username: z.string(), password: z.string(), createdAt: z.string() })

export function loadAccounts(): Account[] {
  try {
    const result = z.array(accountSchema).safeParse(JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) ?? '[]'))
    return result.success ? result.data : []
  } catch { return [] }
}

export function registerAccount(username: string, password: string): { ok: boolean; message: string } {
  const normalized = username.trim().toLowerCase()
  const accounts = loadAccounts()
  if (normalized.length < 3 || password.length < 6) return { ok: false, message: 'Use a username with 3+ characters and a password with 6+ characters.' }
  if (accounts.some((account) => account.username === normalized)) return { ok: false, message: 'That username already exists.' }
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, { username: normalized, password, createdAt: new Date().toISOString() }]))
  saveSession(normalized)
  return { ok: true, message: 'Account created.' }
}

export function signIn(username: string, password: string): { ok: boolean; message: string } {
  const account = loadAccounts().find((entry) => entry.username === username.trim().toLowerCase() && entry.password === password)
  if (!account) return { ok: false, message: 'Username or password is incorrect.' }
  saveSession(account.username)
  return { ok: true, message: 'Welcome back.' }
}

export function loadSession(): string | null { return window.localStorage.getItem(SESSION_KEY) }
export function saveSession(username: string): void { window.localStorage.setItem(SESSION_KEY, username) }
export function clearSession(): void { window.localStorage.removeItem(SESSION_KEY) }

export function loadProfileIcon(username: string | null): ProfileIcon {
  if (!username) return 'peach'
  const value = window.localStorage.getItem(`peach-pen-profile-icon-${username}`)
  return value === 'apple' || value === 'strawberry' || value === 'kiwi' || value === 'banana' ? value : 'peach'
}

export function saveProfileIcon(username: string | null, icon: ProfileIcon): void {
  if (username) window.localStorage.setItem(`peach-pen-profile-icon-${username}`, icon)
}

export function loadDisplayName(username: string | null): string {
  return username ? window.localStorage.getItem(`peach-pen-display-name-${username}`) ?? '' : ''
}

export function saveDisplayName(username: string | null, displayName: string): void {
  if (username) window.localStorage.setItem(`peach-pen-display-name-${username}`, displayName.trim())
}

export function loadLibrary(username: string | null = null): MaterialRecord[] {
  if (!username) return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`peach-pen-library-${username}`) ?? '[]')
    const result = z.array(materialRecordSchema).safeParse(parsed)
    return result.success ? result.data : []
  } catch {
    return []
  }
}

export function saveLibrary(username: string | null | MaterialRecord[], materials?: MaterialRecord[]): void {
  if (Array.isArray(username)) {
    window.localStorage.setItem('peach-pen-library-v1', JSON.stringify(username))
  } else if (username && materials) {
    window.localStorage.setItem(`peach-pen-library-${username}`, JSON.stringify(materials))
  }
}

export function saveSourceDocument(source: SourceDocument): void {
  window.localStorage.setItem(LAST_SOURCE_KEY, JSON.stringify(sourceDocumentSchema.parse(source)))
}

export function loadSourceDocument(): SourceDocument | null {
  const raw = window.localStorage.getItem(LAST_SOURCE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    const result = sourceDocumentSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
