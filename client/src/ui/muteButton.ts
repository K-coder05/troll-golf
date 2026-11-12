import { installSoundUnlock, isMuted, onMuteChange, setMuted } from "../fx/sound";

/** The speaker button: toggles all game sound and remembers the choice. Also arms audio for the first gesture. */
export function startMuteButton(): void {
  installSoundUnlock();
  const button = document.getElementById("mute")!;
  const paint = (muted: boolean) => {
    button.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
    button.title = muted ? "Sound off (click to turn on)" : "Sound on (click to mute)";
  };
  paint(isMuted());
  onMuteChange(paint);
  button.addEventListener("click", () => setMuted(!isMuted()));
}
