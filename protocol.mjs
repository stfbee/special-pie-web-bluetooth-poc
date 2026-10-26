export const TIMER_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
export const EVENTS = '0000fff1-0000-1000-8000-00805f9b34fb';
export function parseFrame(value) {
  const b = value instanceof DataView ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : Uint8Array.from(value);
  if (b.length < 6 || b[0] !== 0xf8 || b[1] !== 0xf9 || b.at(-2) !== 0xf9 || b.at(-1) !== 0xf8) throw new Error('Некорректные границы пакета');
  if (b[2] === 0x34 || b[2] === 0x18) {
    if (b.length !== 6) throw new Error('Ожидалось 6 байт события сессии');
    return {type: b[2] === 0x34 ? 'start' : 'stop', sessionId: b[3]};
  }
  if (b[2] === 0x36) {
    if (b.length !== 10 || b[5] > 99) throw new Error('Некорректный пакет выстрела');
    return {type: 'shot', index: b[6], timeMs: b[4] * 1000 + b[5] * 10};
  }
  return {type: 'unknown', code: b[2]};
}

export function newSession(id = null) { return {id, status: 'unknown', shots: []}; }
export function applyEvent(session, event) {
  if (event.type === 'start') return {...newSession(event.sessionId), status: 'running'};
  if (event.type === 'stop') return session.id === event.sessionId ? {...session, status: 'stopped'} : session;
  if (event.type !== 'shot') return session;
  if (session.shots.some(s => s.index === event.index)) return session;
  const prev = session.shots.at(-1);
  const splitMs = prev && event.index === prev.index + 1 && event.timeMs >= prev.timeMs ? event.timeMs - prev.timeMs : null;
  return {...session, shots: [...session.shots, {...event, splitMs}]};
}
