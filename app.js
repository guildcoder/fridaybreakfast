// Friday Breakfast - small vertical mobile game
// Canvas-based; joystick for touch.
// Designed for portrait and iOS add-to-home-screen standalone mode.

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  let DPR = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // UI elements
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const joystickEl = document.getElementById('joystick');
  const knobEl = joystickEl.querySelector('.stick-knob');
  const messageEl = document.getElementById('message');

  // Game world
  const world = {
    width: canvas.width / DPR,
    height: 20000, // long vertical world
    cameraY: 0 // world y offset (camera moves down as player moves up)
  };

  // Player
  const player = {
    x: (window.innerWidth / 2),
    y: world.height - 120, // start near bottom
    size: 18,
    speed: 110, // px/sec
    color: '#ffeb3b'
  };

  // Obstacles and NPCs
  const obstacles = [];
  const npcs = [];

  // Goal zone at top
  const goal = {
    x: 0,
    y: 40,
    width: window.innerWidth,
    height: 120
  };

  let lastTime = 0;
  let running = false;

  // Create some random cubicles and hazards
  function generateWorld() {
    obstacles.length = 0;
    npcs.length = 0;
    const sections = 60;
    const sectionHeight = (world.height - 400) / sections;
    for (let i = 0; i < sections; i++) {
      const baseY = world.height - 200 - i * sectionHeight;
      // random few cubicles (rectangles)
      const count = 1 + Math.floor(Math.random() * 2);
      for (let j = 0; j < count; j++) {
        const w = 60 + Math.random() * 120;
        const h = 40 + Math.random() * 80;
        const x = 30 + Math.random() * (window.innerWidth - w - 60);
        const y = baseY - (Math.random() * (sectionHeight - 40));
        obstacles.push({ x, y, w, h, color: '#8b6f50' });
      }
      // occasionally add an NPC moving horizontally
      if (Math.random() < 0.35) {
        const x = 20 + Math.random() * (window.innerWidth - 60);
        const y = baseY - (Math.random() * (sectionHeight - 40));
        const dir = Math.random() < 0.5 ? -1 : 1;
        npcs.push({ x, y, w: 26, h: 26, color: '#e74c3c', dir, speed: 40 + Math.random()*50 });
      }
    }
  }

  // Camera follow: keep player near bottom area (so world moves down as player moves up)
  function updateCamera() {
    const viewHeight = canvas.height / DPR;
    const targetCameraY = Math.max(0, player.y - viewHeight * 0.65);
    world.cameraY = Math.max(0, Math.min(targetCameraY, world.height - viewHeight));
  }

  // Input (virtual joystick)
  const joystick = {
    active: false,
    origin: { x: 0, y: 0 },
    pos: { x: 0, y: 0 },
    maxDistance: 36,
    dir: { x: 0, y: 0 }
  };

  function setKnobPos(dx, dy) {
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Touch / mouse handlers for joystick
  function startInput(clientX, clientY) {
    joystick.active = true;
    // joystick origin is center of stick-bg
    const rect = joystickEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    joystick.origin.x = centerX;
    joystick.origin.y = centerY;
    joystick.pos.x = clientX;
    joystick.pos.y = clientY;
    updateJoystick(clientX, clientY);
  }
  function updateJoystick(clientX, clientY) {
    const dx = clientX - joystick.origin.x;
    const dy = clientY - joystick.origin.y;
    // clamp
    const dist = Math.sqrt(dx*dx + dy*dy);
    const max = joystick.maxDistance;
    const ndx = dist > max ? dx/dist * max : dx;
    const ndy = dist > max ? dy/dist * max : dy;
    setKnobPos(ndx, ndy);

    // normalize for direction (-1..1)
    const nx = dx / max;
    const ny = dy / max;
    // We restrict downward movement: allow only ny <= 0 (upwards is negative because screen coords)
    const allowedY = Math.min(0, ny);
    joystick.dir.x = Math.max(-1, Math.min(1, nx));
    joystick.dir.y = Math.max(-1, Math.min(1, allowedY));
  }
  function endInput() {
    joystick.active = false;
    joystick.dir.x = 0;
    joystick.dir.y = 0;
    setKnobPos(0,0);
  }

  // Attach events
  joystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    startInput(t.clientX, t.clientY);
  }, { passive:false });
  joystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    updateJoystick(t.clientX, t.clientY);
  }, { passive:false });
  joystickEl.addEventListener('touchend', (e) => {
    e.preventDefault();
    endInput();
  }, { passive:false });

  // Mouse support for testing in desktop
  joystickEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startInput(e.clientX, e.clientY);
    const move = (ev) => { updateJoystick(ev.clientX, ev.clientY); };
    const up = (ev) => { endInput(); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  // Collisions
  function rectsOverlap(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  // Draw repeating carpet pattern procedurally
  function drawCarpetPattern(viewX, viewY, viewW, viewH) {
    // simple tiled pattern using rectangles
    const tile = 48;
    ctx.fillStyle = '#c7b59b';
    ctx.fillRect(0,0,viewW,viewH); // base
    for (let y = Math.floor(viewY - tile); y < viewY + viewH + tile; y += tile) {
      for (let x = -tile; x < viewW + tile; x += tile) {
        const shade = ((x+y)/tile) % 2 === 0 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.02)';
        ctx.fillStyle = shade;
        ctx.fillRect(x - (viewX % tile), y - viewY, tile, tile);
      }
    }
  }

  function update(dt) {
    // move NPCs
    for (let npc of npcs) {
      npc.x += npc.dir * npc.speed * dt;
      // bounce in bounds
      if (npc.x < 10) { npc.x = 10; npc.dir *= -1; }
      if (npc.x > window.innerWidth - 10 - npc.w) { npc.x = window.innerWidth - 10 - npc.w; npc.dir *= -1; }
    }

    // Player movement from joystick.dir; joystick.dir.y is negative for up
    const vx = joystick.dir.x;
    let vy = joystick.dir.y; // negative or zero
    // scale
    player.x += vx * player.speed * dt;
    player.y += vy * player.speed * dt;

    // clamp left/right within walls (padding)
    const pad = 12;
    player.x = Math.max(pad + player.size/2, Math.min(window.innerWidth - pad - player.size/2, player.x));
    // clamp top and bottom inside world
    player.y = Math.max(20, Math.min(world.height - 40, player.y));

    // update camera
    updateCamera();

    // collision check (convert world coords -> screen by subtracting cameraY)
    // Player rect
    const playerRect = { x: player.x - player.size/2, y: player.y - player.size/2, w: player.size, h: player.size };

    // collisions with obstacles
    for (let ob of obstacles) {
      if (rectsOverlap(playerRect, ob)) {
        gameOver();
        return;
      }
    }
    // collisions with NPCs
    for (let npc of npcs) {
      if (rectsOverlap(playerRect, npc)) {
        gameOver();
        return;
      }
    }

    // reached goal?
    if (player.y <= goal.y + goal.height) {
      win();
      return;
    }
  }

  function draw() {
    const viewW = canvas.width / DPR;
    const viewH = canvas.height / DPR;
    // clear
    ctx.fillStyle = '#222';
    ctx.fillRect(0,0,viewW,viewH);

    // world camera
    const camY = world.cameraY;

    // background carpet
    drawCarpetPattern(0, camY, viewW, viewH);

    // Draw goal area at top (fixed world y)
    const goalScreenY = goal.y - camY;
    ctx.fillStyle = '#0b6f2b';
    ctx.fillRect(0, goalScreenY, viewW, goal.height);
    ctx.fillStyle = '#fff';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FRIDAY BREAKFAST', viewW/2, goalScreenY + 72);

    // Draw obstacles
    for (let ob of obstacles) {
      const sx = ob.x;
      const sy = ob.y - camY;
      if (sy + ob.h < 0 || sy > viewH) continue;
      ctx.fillStyle = ob.color;
      ctx.fillRect(sx, sy, ob.w, ob.h);
      // cubicle border
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx+1, sy+1, ob.w-2, ob.h-2);
    }

    // Draw NPCs
    for (let npc of npcs) {
      const sx = npc.x;
      const sy = npc.y - camY;
      if (sy + npc.h < 0 || sy > viewH) continue;
      ctx.fillStyle = npc.color;
      ctx.fillRect(sx, sy, npc.w, npc.h);
      ctx.fillStyle = '#000';
      ctx.fillRect(sx + 6, sy + 6, 4, 4); // eyes
      ctx.fillRect(sx + npc.w - 10, sy + 6, 4, 4);
    }

    // Draw player relative to camera
    const px = player.x;
    const py = player.y - camY;
    ctx.fillStyle = player.color;
    // simple pixel-art-ish player (square with border)
    ctx.fillRect(px - player.size/2, py - player.size/2, player.size, player.size);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - player.size/2, py - player.size/2, player.size, player.size);

    // HUD: distance to goal
    const dist = Math.max(0, Math.floor(player.y - goal.y));
    ctx.fillStyle = '#fff';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Distance: ' + dist + ' px', 8, 18);
  }

  function loop(ts) {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function startGame() {
    overlay.classList.add('hidden');
    messageEl.classList.add('hidden');
    messageEl.textContent = '';
    // Reset world
    world.cameraY = world.height - (canvas.height / DPR);
    player.x = window.innerWidth/2;
    player.y = world.height - 120;
    generateWorld();
    lastTime = 0;
    running = true;
    requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;
    messageEl.classList.remove('hidden');
    messageEl.textContent = 'Game Over — no breakfast today. Tap to retry.';
    messageEl.addEventListener('click', () => {
      startGame();
    }, { once: true });
  }

  function win() {
    running = false;
    messageEl.classList.remove('hidden');
    messageEl.textContent = 'You reached Friday Breakfast! 🎉 Tap to play again.';
    messageEl.addEventListener('click', () => {
      startGame();
    }, { once: true });
  }

  // Start button
  startBtn.addEventListener('click', (e) => {
    startGame();
  });

  // Show overlay on load (if opened in browser). If in standalone (homescreen), behavior is the same.
  overlay.classList.remove('hidden');

  // Accessibility fallback: allow arrow keys for quick testing
  const keys = { ArrowLeft:false, ArrowRight:false, ArrowUp:false };
  window.addEventListener('keydown', (e) => {
    if (!['ArrowLeft','ArrowRight','ArrowUp'].includes(e.key)) return;
    keys[e.key] = true;
    joystick.dir.x = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    joystick.dir.y = keys.ArrowUp ? -1 : 0;
  });
  window.addEventListener('keyup', (e) => {
    if (!['ArrowLeft','ArrowRight','ArrowUp'].includes(e.key)) return;
    keys[e.key] = false;
    joystick.dir.x = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    joystick.dir.y = keys.ArrowUp ? -1 : 0;
  });

  // Prevent downward movement using passive joystick: if joystick tries to give positive y, clamp
  (function enforceClamp() {
    // periodic clamp
    setInterval(() => {
      if (joystick.dir.y > 0) joystick.dir.y = 0;
    }, 80);
  })();

  // If user launches from Home Screen in iOS, it's already standalone; nothing else required.
})();
