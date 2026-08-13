/**
 * Secure credential storage (spec §28).
 *
 * - API keys are NEVER hard-coded and NEVER cross the IPC bridge to the renderer.
 * - At rest they are encrypted with the OS keychain via Electron `safeStorage`
 *   (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 * - If OS encryption is unavailable, keys are kept in memory for the session only
 *   and are NOT written to disk as plaintext.
 * - Values are never logged. The renderer can only ever learn whether a key is
 *   *set* (a boolean), never its value.
 */
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type CredentialName = 'STEAM_API_KEY' | 'BATTLEMETRICS_API_TOKEN'

interface EncFile {
  [name: string]: string // base64 ciphertext
}

export class CredentialStore {
  private file: string
  private mem = new Map<string, string>()
  private encryptionAvailable: boolean

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'credentials.enc')
    this.encryptionAvailable = (() => {
      try {
        return safeStorage.isEncryptionAvailable()
      } catch {
        return false
      }
    })()
    this.load()
  }

  private load(): void {
    if (!this.encryptionAvailable || !existsSync(this.file)) return
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as EncFile
      for (const [name, b64] of Object.entries(parsed)) {
        try {
          const plain = safeStorage.decryptString(Buffer.from(b64, 'base64'))
          this.mem.set(name, plain)
        } catch {
          /* ignore individual decode failures */
        }
      }
    } catch {
      /* corrupt file — ignore rather than crash */
    }
  }

  private persist(): void {
    if (!this.encryptionAvailable) return // never write plaintext to disk
    const out: EncFile = {}
    for (const [name, plain] of this.mem.entries()) {
      out[name] = safeStorage.encryptString(plain).toString('base64')
    }
    writeFileSync(this.file, JSON.stringify(out), { encoding: 'utf8', mode: 0o600 })
  }

  /** Retrieve a credential: stored value first, else environment fallback. */
  async get(name: CredentialName): Promise<string | null> {
    const stored = this.mem.get(name)
    if (stored) return stored
    const env = process.env[name]
    return env && env.trim() ? env.trim() : null
  }

  /** Store or clear a credential. Empty string clears it. */
  set(name: CredentialName, value: string): void {
    const trimmed = value.trim()
    if (!trimmed) {
      this.mem.delete(name)
    } else {
      this.mem.set(name, trimmed)
    }
    this.persist()
  }

  /** Renderer-safe status: which keys are configured, and whether at-rest encryption works. */
  async status(): Promise<{
    steamKeySet: boolean
    battlemetricsTokenSet: boolean
    encryptionAvailable: boolean
    persistent: boolean
  }> {
    return {
      steamKeySet: Boolean(await this.get('STEAM_API_KEY')),
      battlemetricsTokenSet: Boolean(await this.get('BATTLEMETRICS_API_TOKEN')),
      encryptionAvailable: this.encryptionAvailable,
      persistent: this.encryptionAvailable
    }
  }
}
