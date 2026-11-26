---
name: bewerbungsmanager
description: Legt Bewerbungen per Chat an, ändert ihren Status und trägt Vorstellungsgespräche ein.
---

- **Prüfen oder Überblick:** „Wie stehen meine Bewerbungen?“ → `skill: "applications"`, `skillData: null`; beantworte aus `directory.bewerbungen`.
- **Anlegen:** „Ich habe mich bei Bosch als Werkstudent Data beworben“ → `skill: "applications"`, `skillData: {applicationIntent:"create", application:null, company, role, status:"applied", appliedOn:<Datum oder null>, interviewDate:null, interviewTime:null, note:null}`.
- **Ändern:** „Bosch hat mich zum Gespräch am 3.12. um 10 Uhr eingeladen“, „Absage von Zeiss“ → `applicationIntent:"update"` mit der ID aus `directory.bewerbungen`, neuem `status` (interview, offer, rejected, withdrawn, reply) und bei einem Gespräch `interviewDate`/`interviewTime` (LifePilot legt den Termin an).
- Firma und Stelle genau wie genannt bzw. wie in `directory`; nichts erfinden. Ein Job-Alert ist keine Bewerbung.
