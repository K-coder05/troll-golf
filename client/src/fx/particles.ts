import Phaser from "phaser";

/** Most particles alive at once; bursts beyond this just get smaller. */
const MAX_PARTICLES = 160;

interface Particle {
  shape: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  gravity: number;
  spin: number;
  age: number;
  life: number;
  alive: boolean;
}

export interface BurstOptions {
  count: number;
  colours: number[];
  /** px/s */
  speed: number;
  /** ms */
  life: number;
  size?: number;
  /** px/s^2 downward (screen space). */
  gravity?: number;
  /** Radians: the cone's heading and half-width; defaults to a full circle. */
  heading?: number;
  spread?: number;
}

/**
 * A pool of small squares for splashes, shards and sparks. Objects are made
 * once and reused, so a burst allocates nothing after warm-up, and the pool
 * is capped. Call `update` every frame.
 */
export class ParticlePool {
  private readonly particles: Particle[] = [];
  private live = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  burst(x: number, y: number, o: BurstOptions): void {
    const room = MAX_PARTICLES - this.live;
    const count = Math.min(o.count, room);
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;
      const heading = o.heading ?? 0;
      const spread = o.spread ?? Math.PI;
      const angle = o.heading === undefined ? Math.random() * Math.PI * 2 : heading + (Math.random() * 2 - 1) * spread;
      const speed = o.speed * (0.4 + Math.random() * 0.6);
      const size = o.size ?? 4;
      p.shape.setPosition(x, y).setSize(size, size).setDisplaySize(size, size);
      p.shape.setFillStyle(o.colours[i % o.colours.length]!, 1).setAlpha(1).setVisible(true).setActive(true);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = o.gravity ?? 0;
      p.spin = (Math.random() - 0.5) * 12;
      p.age = 0;
      p.life = o.life * (0.7 + Math.random() * 0.3);
      p.alive = true;
      this.live++;
    }
  }

  update(deltaMs: number): void {
    if (this.live === 0) return;
    const dt = deltaMs / 1000;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += deltaMs;
      if (p.age >= p.life) {
        p.alive = false;
        p.shape.setVisible(false).setActive(false);
        this.live--;
        continue;
      }
      p.vy += p.gravity * dt;
      p.shape.x += p.vx * dt;
      p.shape.y += p.vy * dt;
      p.shape.rotation += p.spin * dt;
      p.shape.setAlpha(1 - p.age / p.life);
    }
  }

  private acquire(): Particle | null {
    for (const p of this.particles) if (!p.alive) return p;
    if (this.particles.length >= MAX_PARTICLES) return null;
    const shape = this.scene.add.rectangle(0, 0, 4, 4, 0xffffff).setDepth(8).setVisible(false).setActive(false);
    const p: Particle = { shape, vx: 0, vy: 0, gravity: 0, spin: 0, age: 0, life: 1, alive: false };
    this.particles.push(p);
    return p;
  }
}
