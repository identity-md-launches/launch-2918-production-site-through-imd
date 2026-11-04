import { useState } from 'react';
import { createRun, gameReducer, rotateMask, routed, cellName } from '../core/engine';
import { DEMO_SOURCE } from '../data/archive';
import { Board } from './Board';
import { Modal } from './Modal';
function lesson() {
  const run = createRun(DEMO_SOURCE);
  const target = run.tiles.findIndex(t => t.kind === 'conduit' && t.solution !== 5 && t.solution !== 10);
  run.tiles = run.tiles.map((t, i) => ({ ...t, mask: i === target ? rotateMask(rotateMask(rotateMask(t.solution))) : t.solution }));
  run.selected = run.puzzle.source; run.phase = 'playing'; run.charges = 1; run.puzzle.limit = 12;
  return { run, target };
}
export function Tutorial({ onClose }: { onClose: () => void }) {
  const [initial] = useState(lesson), [run, setRun] = useState(initial.run), [step, setStep] = useState(0);
  const target = initial.target, beacon = run.puzzle.beacons[0];
  const messages = [
    `Select the outlined elbow at ${cellName(target)}. The wheel supplies baseline power, even while the real hamster rests.`,
    'Rotate it clockwise to join the gold signal. Use the button below, or press R while the board has focus.',
    `All four flowers are connected. Select the flower at ${cellName(beacon)} to spend a practice charge.`,
    'Press Grow beacon. A charge adds a golden bloom and 150 points. Routing never needs a charge.',
    'Garden restored. A full run has three gardens, three minutes and a rotation budget for each board.',
  ];
  const select = (index: number) => { setRun(r => gameReducer(r, { type: 'select', index })); if (step === 0 && index === target) setStep(1); if (step === 2 && index === beacon) setStep(3); };
  const rotate = () => { if (step === 1 && run.selected === target) { setRun(r => gameReducer(r, { type: 'rotate' })); setStep(2); } };
  return <Modal title="A little light, a little practice" onClose={onClose} wide>
    <p className="tutorial-step">Step {Math.min(step + 1, 4)} of 4 · Demo tutorial</p>
    <p className="tutorial-copy" role="status">{messages[step]}</p>
    <div className="tutorial-board"><Board run={run} onSelect={select} onRotate={rotate} tutorialTarget={step < 2 ? target : step < 4 ? beacon : undefined} /></div>
    <div className="modal-actions">
      {step < 2 && <button className="primary" disabled={step !== 1 || run.selected !== target} onClick={rotate}>Rotate clockwise <kbd>R</kbd></button>}
      {(step === 2 || step === 3) && <button className="primary" disabled={step !== 3 || run.selected !== beacon || !routed(run).includes(beacon)} onClick={() => { setRun(r => gameReducer(r, { type: 'boost' })); setStep(4); }}>Grow beacon · +150</button>}
      {step === 4 && <button className="primary" onClick={onClose}>Play a full garden</button>}
    </div>
  </Modal>;
}
