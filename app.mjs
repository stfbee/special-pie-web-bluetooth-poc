import {TIMER_SERVICE, EVENTS, parseFrame, newSession, applyEvent} from './protocol.mjs?v=3';
const $ = id => document.getElementById(id);
let device, characteristic, busy = false, session = newSession(), mode = 'live';
const journal = [], sessions = [];
const seconds = ms => ms == null ? '—' : (ms / 1000).toFixed(2);
function log(message, extra = {}) {
  journal.push({at: new Date().toISOString(), message, ...extra});
  if (journal.length > 5000) journal.shift();
  $('log').textContent = journal.slice(-80).map(e => `${e.at.slice(11,23)} ${e.message}${e.hex ? ' | ' + e.hex : ''}`).join('\n');
  $('log').scrollTop = $('log').scrollHeight;
}
function render() {
  const last = session.shots.at(-1);
  $('time').textContent = seconds(last?.timeMs ?? 0);
  $('count').textContent = session.shots.length;
  $('split').textContent = seconds(last?.splitMs);
  const statuses = {running:'Сессия идёт', stopped:'Сессия завершена', unknown:'Старт не получен'};
  $('session').textContent = `${mode === 'demo' ? 'ДЕМО · ' : ''}${statuses[session.status]}${session.id == null ? '' : ' · ID ' + session.id}`;
  $('shots').replaceChildren(...session.shots.map(s => {
    const tr = document.createElement('tr');
    for (const value of [s.index + 1, seconds(s.timeMs), seconds(s.splitMs)]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    return tr;
  }));
}
function controls() {
  $('connect').disabled = busy || !!device?.gatt.connected || !navigator.bluetooth || !isSecureContext;
  $('disconnect').disabled = busy || !device?.gatt.connected;
  $('demo').disabled = busy || !!device?.gatt.connected;
}
function archive() { if (session.id != null || session.shots.length) {sessions.push({mode, ...session}); if (sessions.length > 100) sessions.shift();} }
function receive(value) {
  const b = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const hex = Array.from(b, n => n.toString(16).padStart(2,'0')).join(' ').toUpperCase();
  try {
    const event = parseFrame(value);
    log(event.type, {hex, event, mode});
    if (event.type === 'start') archive();
    session = applyEvent(session, event); render();
  } catch (error) { log(error.message, {hex, mode}); }
}
const onValue = event => receive(event.target.value);
function cleanup() {
  characteristic?.removeEventListener('characteristicvaluechanged', onValue);
  characteristic = undefined;
}
function onDisconnect() {cleanup(); $('connection').textContent = 'Соединение разорвано — подключитесь заново'; log('BLE отключён; события во время разрыва недоступны'); controls();}
$('connect').onclick = async () => {
  busy = true; controls();
  try {
    device?.removeEventListener('gattserverdisconnected', onDisconnect);
    device = await navigator.bluetooth.requestDevice({
      ...($('all').checked ? {acceptAllDevices:true} : {filters:[{services:[TIMER_SERVICE]}, {namePrefix:'SP M1A2 Timer'}]}),
      optionalServices:[TIMER_SERVICE]
    });
    device.addEventListener('gattserverdisconnected', onDisconnect);
    $('connection').textContent = 'Подключение…';
    archive(); mode = 'live'; session = newSession(); render();
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(TIMER_SERVICE);
    characteristic = await service.getCharacteristic(EVENTS);
    if (!characteristic.properties.notify) throw new Error('FFF1 не поддерживает Notify');
    characteristic.addEventListener('characteristicvaluechanged', onValue);
    await characteristic.startNotifications();
    $('connection').textContent = `Подключён: ${device.name || 'Special Pie'}`;
    log('Подписка FFF1 активна', {device:device.name});
  } catch (error) {
    cleanup(); device?.gatt.disconnect();
    $('connection').textContent = `${error.name}: ${error.message}`;
    log(`Подключение: ${error.name}: ${error.message}`);
  } finally {busy = false; controls();}
};
$('disconnect').onclick = () => device?.gatt.disconnect();
$('demo').onclick = () => {
  archive(); mode = 'demo'; session = newSession();
  $('connection').textContent = 'Демо · без Bluetooth';
  for (const bytes of [[248,249,52,1,249,248], [248,249,54,0,1,25,0,12,249,248], [248,249,54,0,2,4,1,12,249,248], [248,249,54,0,4,36,2,12,249,248], [248,249,24,1,249,248]]) receive(new DataView(Uint8Array.from(bytes).buffer));
};
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({exportedAt:new Date().toISOString(), device:device?.name, sessions, current:{mode,...session}, journal},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `special-pie-${Date.now()}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);
};
$('support').textContent = !isSecureContext ? 'Нужен HTTPS или localhost. HTTP по IP компьютера не подходит.' : !navigator.bluetooth ? 'Web Bluetooth недоступен. Откройте страницу в Chrome на Android.' : 'Web Bluetooth доступен. Включите Bluetooth и выберите таймер.';
controls(); render();
