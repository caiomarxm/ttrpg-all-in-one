# O Cronista — Bot

O Cronista is the Discord-facing service: it manages Session lifecycle via slash commands, records voice audio, and generates Artifacts (Crônica + Session Notes) from Transcripts.

## Language

**Session**:
A single RPG gathering. Starts when the Game Master runs `/join`. Ends with `/stop` or is abandoned with `/discard`. Tolerates multiple voice channel reconnections — recording accumulates across them.
_Avoid_: Meeting, recording, game

**Transcript**:
The raw text output of transcribing a Session's audio. The source material for Artifact generation.
_Avoid_: Transcription (verb/process), log, text dump

**Crônica**:
A narrative chronicle of a Session written for the players — what their characters saw, experienced, and discovered. Generated from a Transcript.
_Avoid_: Cronic, chronicle, player notes, summary

**Session Notes**:
The Game Master's operational document for a Session — what was revealed (and what wasn't), NPC dialogue, plot threads pulled, and state changes. Private to the Game Master.
_Avoid_: GM notes, master notes, recap

**Artifact**:
A generated document produced from a Session's Transcript — either a Crônica or Session Notes.
_Avoid_: Output, report, document, export

**Game Master**:
The player who controls the narrative and runs the game. Owns Session lifecycle (start, stop, discard) and receives Session Notes.
_Avoid_: GM, Master, DM, Dungeon Master

## Relationships

- A **Session** produces exactly one **Transcript** (once ended)
- A **Transcript** is the source for exactly two **Artifacts**: one **Crônica** and one set of **Session Notes**
- **Session Notes** are visible only to the **Game Master**; a **Crônica** is visible to all participants

## Example dialogue

> **Dev:** "Once the Game Master runs `/stop`, do we generate the Artifacts immediately?"
> **Domain expert:** "No — first we produce a Transcript from the audio. The Artifacts are generated asynchronously from the Transcript afterward."
> **Dev:** "So the Crônica and the Session Notes come from the same Transcript?"
> **Domain expert:** "Exactly. One Transcript, two Artifacts — one for players, one private to the Game Master."
