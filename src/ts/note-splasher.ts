import ADSREnvelope from './adsr-envelope';
import NoteEnvelopeSplash from './note-envelope-splash';
import Note from './note';
import Animator from './animator';
import { generateRandomColor } from './color';

const adsrEnvelope = new ADSREnvelope({
  attackDuration: 0.01,
  decayDuration: 2,
  sustainDuration: 0,
  sustainLevel: 0.4,
  releaseDuration: 0.7,
  attackCurve: ADSREnvelope.CURVES.LINEAR,
  decayCurve: ADSREnvelope.CURVES.EXPONENTIAL,
  releaseCurve: ADSREnvelope.CURVES.EXPONENTIAL,
});

const channelEnvelopes: ADSREnvelope[] =
  Array<ADSREnvelope>(16).fill(adsrEnvelope);

const channelNoteSplashLists: NoteEnvelopeSplash[][] = new Array(16)
  .fill(null)
  .map(() => []);
const channelHold: boolean[] = new Array<boolean>(16).fill(false);

function setHold(midiChannel: number, midiControllerValue: number) {
  const hold = midiControllerValue >= 64;
  channelHold[midiChannel] = hold;
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.hold(hold));
}

function setSostenuto(midiChannel: number, midiControllerValue: number) {
  const sostenuto = midiControllerValue >= 64;
  channelNoteSplashLists[midiChannel].forEach((ns) =>
    ns.note.sustain(sostenuto),
  );
}

function allSoundsOff(midiChannel: number) {
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.forceOff());
}

function allNotesOff(midiChannel: number) {
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.off());
}

function allControllersOff(midiChannel: number) {
  channelHold[midiChannel] = false;
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.hold(false));
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.sustain(false));
}

function releaseADSRNoteSplash(
  midiChannel: number,
  midiNote: number,
  force = false,
) {
  const noteSplashList = channelNoteSplashLists[midiChannel];
  const turnOff: (note: Note) => void = force
    ? (note) => note.forceOff()
    : (note) => note.off();
  noteSplashList
    .map(({ note }) => note)
    .filter((note) => note.midiNote === midiNote)
    .forEach(turnOff);
}

function addADSRNoteSplash(
  midiChannel: number,
  midiNote: number,
  midiVelocity: number,
) {
  releaseADSRNoteSplash(midiChannel, midiNote, true);

  const noteSplashList = channelNoteSplashLists[midiChannel];
  const adsr = channelEnvelopes[midiChannel];
  // FIXME: brightness should not be above 1.0; used here for backwards compatibility
  const color = generateRandomColor({});
  const noteSplash = new NoteEnvelopeSplash(
    midiNote,
    midiVelocity,
    adsr,
    color,
  );
  noteSplash.note.hold(channelHold[midiChannel]);

  noteSplashList.push(noteSplash);
}

function updateADSRNoteSplashes() {
  channelNoteSplashLists.forEach((noteSplashList) => {
    for (let i = noteSplashList.length - 1; i >= 0; i -= 1) {
      const noteSplash = noteSplashList[i];
      noteSplash.update();
      if (noteSplash.note.isOver()) {
        noteSplashList.splice(i, 1);
      }
    }
  });
}

function noteOff(channel: number, note: number) {
  releaseADSRNoteSplash(channel, note);
}

function noteOn(channel: number, note: number, velocity: number) {
  addADSRNoteSplash(channel, note, velocity);
}

function reset() {
  for (let channel = 0; channel < 16; channel += 1) {
    allControllersOff(channel);
    allSoundsOff(channel);
  }
}

const splashAnimator = new Animator(updateADSRNoteSplashes);
splashAnimator.startNow(performance.now());

export {
  noteOn,
  noteOff,
  reset,
  setHold,
  setSostenuto,
  allNotesOff,
  allSoundsOff,
  allControllersOff,
};
