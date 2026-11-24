export function confirmImageTransfer(count = 1) {
  return window.confirm(count === 1
    ? 'Das aufbereitete Bild zur Analyse an OpenAI über Codex senden? Die Analyse kann dein Modellkontingent nutzen. Abbrechen verwendet die lokale Erkennung.'
    : `Die ${count} aufbereiteten Bilder zur Analyse an OpenAI über Codex senden? Die Analyse kann dein Modellkontingent nutzen. Abbrechen verwendet die lokale Erkennung.`)
}
