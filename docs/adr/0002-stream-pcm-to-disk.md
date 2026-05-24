# Stream PCM packets to disk rather than buffering in RAM

O Escriba receives opus packets continuously during a Session. Instead of accumulating decoded PCM chunks in memory and writing a WAV file only at stop time, each speaker's audio is streamed to a WAV file on disk from the moment their first packet arrives.

The WAV format requires two size fields in its 44-byte header that aren't known until recording ends. We handle this by writing a zero-filled placeholder header when the file is opened, streaming raw PCM after it, and seeking back to patch the two size fields at stop time. The per-packet write cost is negligible — buffered I/O absorbs it.

This eliminates the unbounded RAM growth that would otherwise make long sessions (4+ hour RPG gatherings) unsafe, and it dramatically improves crash resilience: a process crash loses only the last kernel-buffered chunk rather than the entire session's audio.

## Considered Options

- **Buffer in RAM, write at stop** *(original)*: simple implementation, but memory grows linearly with session length and a crash loses everything.
- **Stream to disk** *(chosen)*: many small writes instead of one large write, but crash resilience and bounded memory are worth the I/O pattern change at this scale.

## Consequences

The `appendPacket` race condition (multiple concurrent `resolveUsername` awaits overwriting the `speakers` Map) must be fixed before streaming is introduced. With buffered chunks the race causes minor packet loss; with streaming it would open the same file path from two concurrent coroutines and corrupt the WAV. The fix is to open the write stream synchronously on the first packet using a placeholder username, then update the username asynchronously.
